import crypto from 'node:crypto';

/**
 * Notifications push (Web Push, RFC 8030 + VAPID RFC 8292), sans dépendance.
 * On envoie une notification SANS contenu : le service worker affiche un message fixe.
 * Aucune donnée (montant, nom de compte…) ne transite donc par Apple ou Google.
 */

export interface PushEnv {
  VAPID_PUBLIC_KEY?: string; // clé publique brute (65 octets, base64url)
  VAPID_PRIVATE_KEY?: string; // clé privée brute (32 octets, base64url)
  VAPID_SUBJECT?: string; // https://… ou mailto:… (sinon : adresse de production Vercel)
}

export interface PushSub {
  endpoint: string;
}

const b64u = (b: Buffer) => b.toString('base64url');

/** Services de push des navigateurs : on refuse toute autre adresse (pas de requête vers un serveur arbitraire). */
export function isPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname;
    return (
      h.endsWith('.push.apple.com') ||
      h === 'fcm.googleapis.com' ||
      h.endsWith('.notify.windows.com') ||
      h === 'updates.push.services.mozilla.com' ||
      h.endsWith('.push.services.mozilla.com')
    );
  } catch {
    return false;
  }
}

function subject(env: PushEnv): string {
  if (env.VAPID_SUBJECT) return env.VAPID_SUBJECT;
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return prod ? `https://${prod}` : 'https://localhost'; // en local seulement ; sur Vercel, l'adresse de production
}

export function vapidJwt(env: PushEnv, audience: string): string {
  const pub = Buffer.from(env.VAPID_PUBLIC_KEY!, 'base64url');
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID_PUBLIC_KEY invalide.');
  const key = crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: env.VAPID_PRIVATE_KEY!, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: 'jwk',
  });
  const head = b64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(Buffer.from(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject(env) })));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${b64u(sig)}`;
}

/** Envoie une notification (sans contenu). Renvoie le code HTTP du service de push (201 = accepté, 404/410 = abonnement expiré). */
export async function sendPush(sub: PushSub, env: PushEnv): Promise<number> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) throw new Error('VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY ne sont pas configurés.');
  if (!isPushEndpoint(sub.endpoint)) return 400;
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      TTL: String(2 * 86400),
      Urgency: 'normal',
      Authorization: `vapid t=${vapidJwt(env, new URL(sub.endpoint).origin)}, k=${env.VAPID_PUBLIC_KEY}`,
      'Content-Length': '0',
    },
    signal: AbortSignal.timeout(15000),
  });
  return r.status;
}

/** Jour du mois à Paris (le cron Vercel tourne en UTC). */
export function parisDay(d = new Date()): { day: number; lastDay: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(d).map((p) => [p.type, p.value]));
  const y = Number(parts.year);
  const m = Number(parts.month);
  return { day: Number(parts.day), lastDay: new Date(Date.UTC(y, m, 0)).getUTCDate() };
}
