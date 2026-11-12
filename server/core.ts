import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { marketData } from './market.js';
import { isPushEndpoint, parisDay, sendPush } from './push.js';

/**
 * API de Pécule, identique en local (plugin Vite) et sur Vercel (fonctions /api).
 *
 * Sécurité :
 * - toutes les routes (sauf /api/login et /api/session) exigent une session ouverte avec le mot de passe APP_PASSWORD ;
 * - la session est un cookie HttpOnly, Secure, SameSite=Strict, signé (HMAC) avec SESSION_SECRET ;
 * - l'adresse du script Google et son jeton (GSHEET_URL, GSHEET_TOKEN) ne quittent jamais le serveur.
 */

export interface Env {
  APP_PASSWORD?: string;
  SESSION_SECRET?: string;
  GSHEET_URL?: string;
  GSHEET_TOKEN?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  CRON_SECRET?: string; // Vercel l'envoie dans « Authorization: Bearer … » aux tâches planifiées
}

export interface ApiRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  cookie: string;
  body: string;
  secure: boolean; // HTTPS (cookie Secure)
  authorization?: string;
}

export interface ApiResponse {
  status: number;
  headers: Record<string, string | string[]>;
  body: string;
}

const COOKIE = 'pecule_session';
const SESSION_DAYS = 180;

const json = (status: number, body: unknown, headers: Record<string, string | string[]> = {}): ApiResponse => ({
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  body: JSON.stringify(body),
});

function configError(env: Env): string | null {
  if (!env.APP_PASSWORD || env.APP_PASSWORD.length < 12) return 'APP_PASSWORD manquant ou trop court (12 caractères minimum).';
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) return 'SESSION_SECRET manquant ou trop court (32 caractères minimum).';
  return null;
}

const sign = (secret: string, value: string) => crypto.createHmac('sha256', secret).update(value).digest('base64url');

function safeEqual(a: string, b: string) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function readCookie(header: string, name: string): string | null {
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function isAuthenticated(req: ApiRequest, env: Env): boolean {
  const raw = readCookie(req.cookie, COOKIE);
  if (!raw || !env.SESSION_SECRET) return false;
  const [exp, mac] = raw.split('.');
  if (!exp || !mac || Number(exp) < Date.now()) return false;
  return safeEqual(mac, sign(env.SESSION_SECRET, `v1.${exp}`));
}

function sessionCookie(env: Env, secure: boolean): string {
  const exp = Date.now() + SESSION_DAYS * 86400000;
  const value = `${exp}.${sign(env.SESSION_SECRET!, `v1.${exp}`)}`;
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`;
}

// ---------- Google Sheet (script Apps Script) ----------

async function sheetCall(env: Env, init?: { prefs: unknown }): Promise<any> {
  if (!env.GSHEET_URL || !env.GSHEET_TOKEN) throw new Error('GSHEET_URL et GSHEET_TOKEN ne sont pas configurés.');
  const url = new URL(env.GSHEET_URL);
  if (url.protocol !== 'https:' || url.hostname !== 'script.google.com') throw new Error('GSHEET_URL doit être l’adresse /exec du script Google.');
  const r = init
    ? await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ token: env.GSHEET_TOKEN, prefs: init.prefs }),
        redirect: 'follow',
        signal: AbortSignal.timeout(60000),
      })
    : await fetch(`${url}?token=${encodeURIComponent(env.GSHEET_TOKEN)}`, { redirect: 'follow', signal: AbortSignal.timeout(60000) });
  const text = await r.text();
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    if (init) throw new Error('Ton script Google n’enregistre pas encore les réglages : colle la dernière version du script (avec la fonction doPost) puis « Gérer les déploiements » → Nouvelle version.');
    throw new Error('Le script Google ne répond pas comme prévu (déploiement « Application Web », accès « Tout le monde », adresse en /exec).');
  }
  if (j?.error === 'forbidden') throw new Error('Jeton refusé par le script Google : GSHEET_TOKEN doit être identique au TOKEN du script.');
  if (j?.error) throw new Error(`Script Google : ${j.error}`);
  return j;
}

// ---------- Rappel mensuel ----------

/** Envoie le rappel aux appareils abonnés si c'est le jour choisi (heure de Paris). Retire les abonnements expirés. */
async function remind(env: Env) {
  const j = await sheetCall(env);
  const prefs = j?.prefs ?? null;
  const reminder = prefs?.settings?.reminder as { day?: number; subs?: { endpoint: string }[] } | undefined;
  const subs = (reminder?.subs ?? []).filter((x) => x && isPushEndpoint(String(x.endpoint)));
  if (!reminder || !subs.length) return { sent: 0, reason: 'aucun appareil abonné' };
  const { day, lastDay } = parisDay();
  const target = Math.min(Math.max(1, Math.round(Number(reminder.day) || 7)), lastDay);
  if (day !== target) return { sent: 0, reason: `rappel prévu le ${target}` };
  const results = await Promise.all(subs.map(async (x) => ({ endpoint: x.endpoint, status: await sendPush(x, env).catch(() => 0) })));
  const expired = new Set(results.filter((r) => r.status === 404 || r.status === 410).map((r) => r.endpoint));
  if (expired.size) {
    prefs.settings.reminder.subs = reminder.subs!.filter((x) => !expired.has(x.endpoint));
    await sheetCall(env, { prefs });
  }
  return { sent: results.filter((r) => r.status >= 200 && r.status < 300).length, removed: expired.size };
}

// ---------- Routeur ----------

export async function handle(req: ApiRequest, env: Env): Promise<ApiResponse> {
  const cfg = configError(env);

  if (req.path === '/api/session') {
    return json(200, { authenticated: !cfg && isAuthenticated(req, env), configured: !cfg, error: cfg ?? undefined, sheet: !!(env.GSHEET_URL && env.GSHEET_TOKEN), push: env.VAPID_PUBLIC_KEY || null });
  }

  if (req.path === '/api/login' && req.method === 'POST') {
    if (cfg) return json(500, { error: cfg });
    let password = '';
    try {
      password = String(JSON.parse(req.body || '{}').password ?? '');
    } catch {
      /* corps invalide */
    }
    if (!safeEqual(password, env.APP_PASSWORD!)) {
      await new Promise((r) => setTimeout(r, 1500)); // freine les essais en rafale
      return json(401, { error: 'Mot de passe incorrect.' });
    }
    return json(200, { ok: true }, { 'Set-Cookie': sessionCookie(env, req.secure) });
  }

  if (req.path === '/api/logout' && req.method === 'POST') {
    return json(200, { ok: true }, { 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${req.secure ? '; Secure' : ''}` });
  }

  // Rappel mensuel : appelé chaque jour par la tâche planifiée Vercel (vercel.json → crons), protégé par CRON_SECRET
  if (req.path === '/api/remind') {
    if (!env.CRON_SECRET || !safeEqual(req.authorization || '', `Bearer ${env.CRON_SECRET}`)) return json(401, { error: 'Accès refusé.' });
    try {
      return json(200, await remind(env));
    } catch (e) {
      return json(502, { error: (e as Error).message });
    }
  }

  // Tout le reste exige une session
  if (cfg) return json(500, { error: cfg });
  if (!isAuthenticated(req, env)) return json(401, { error: 'Session expirée : reconnecte-toi.' });

  try {
    if (req.path === '/api/sheet' && req.method === 'GET') {
      const j = await sheetCall(env);
      if (!Array.isArray(j?.values)) throw new Error('Réponse inattendue du script Google.');
      return json(200, { sheet: String(j.sheet ?? ''), values: j.values.map((row: unknown[]) => row.map((c) => String(c ?? ''))), prefs: j.prefs ?? null });
    }

    if (req.path === '/api/prefs' && req.method === 'PUT') {
      const prefs = JSON.parse(req.body || '{}');
      if (JSON.stringify(prefs).length > 8000) return json(413, { error: 'Réglages trop volumineux.' });
      await sheetCall(env, { prefs });
      return json(200, { ok: true });
    }

    if (req.path === '/api/push-test' && req.method === 'POST') {
      const endpoint = String(JSON.parse(req.body || '{}').endpoint ?? '');
      if (!isPushEndpoint(endpoint)) return json(400, { error: 'Abonnement invalide.' });
      const status = await sendPush({ endpoint }, env);
      if (status >= 300) return json(502, { error: `Le service de notifications a répondu ${status}.` });
      return json(200, { ok: true });
    }

    if (req.path === '/api/market' && req.method === 'GET') {
      const symbols = (req.query.get('symbols') || '')
        .split(',')
        .map((x) => x.trim().toUpperCase())
        .filter((x) => /^[A-Z0-9.\-=^]{1,24}$/.test(x))
        .slice(0, 20);
      const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.get('from') || '') ? req.query.get('from')! : '2020-01-01';
      const cacheDir = process.env.VERCEL ? '/tmp' : 'data';
      return json(200, await marketData([...new Set(symbols)], from, cacheDir));
    }
  } catch (e) {
    return json(502, { error: (e as Error).message });
  }

  return json(404, { error: 'Route inconnue' });
}

// ---------- Adaptateur Node (plugin Vite et fonctions Vercel) ----------

async function readBody(req: IncomingMessage & { body?: unknown }): Promise<string> {
  if (typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return JSON.stringify(req.body);
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 100_000) throw new Error('Requête trop volumineuse');
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function nodeHandler(req: IncomingMessage, res: ServerResponse, env: Env, forcedPath?: string) {
  const url = new URL(req.url || '/', 'http://localhost');
  const proto = String(req.headers['x-forwarded-proto'] || '');
  let out: ApiResponse;
  try {
    out = await handle(
      {
        method: req.method || 'GET',
        path: forcedPath ?? url.pathname.replace(/\/+$/, ''),
        query: url.searchParams,
        cookie: String(req.headers.cookie || ''),
        body: req.method === 'GET' ? '' : await readBody(req),
        secure: proto === 'https' || !!process.env.VERCEL,
        authorization: String(req.headers.authorization || ''),
      },
      env,
    );
  } catch (e) {
    out = json(500, { error: (e as Error).message });
  }
  res.statusCode = out.status;
  for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v);
  res.end(out.body);
}

export const envFromProcess = (): Env => ({
  APP_PASSWORD: process.env.APP_PASSWORD,
  SESSION_SECRET: process.env.SESSION_SECRET,
  GSHEET_URL: process.env.GSHEET_URL,
  GSHEET_TOKEN: process.env.GSHEET_TOKEN,
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
  VAPID_SUBJECT: process.env.VAPID_SUBJECT,
  CRON_SECRET: process.env.CRON_SECRET,
});
