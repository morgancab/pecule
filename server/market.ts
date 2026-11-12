import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Données de marché publiques (aucune donnée personnelle envoyée) :
 * - cours de clôture quotidiens (Yahoo Finance), convertis en euros ;
 * - indice des prix à la consommation harmonisé France (Eurostat).
 * Mis en cache 12 h dans data/market-cache.json.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const TTL = 12 * 3600 * 1000;

export interface MarketData {
  prices: Record<string, { name: string; currency: string; points: [string, number][] }>;
  errors: Record<string, string>;
  inflation: [string, number][]; // [YYYY-MM, indice]
  fetchedAt: string;
}

type Daily = { name: string; currency: string; points: [string, number][] };

async function yahooDaily(symbol: string, from: string): Promise<Daily> {
  const p1 = Math.floor(Date.parse(from + 'T00:00:00Z') / 1000) - 10 * 86400;
  const p2 = Math.floor(Date.now() / 1000) + 86400;
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${p1}&period2=${p2}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(r.status === 404 ? 'symbole introuvable' : `HTTP ${r.status}`);
  const res = ((await r.json()) as any)?.chart?.result?.[0];
  if (!res?.timestamp) throw new Error('pas de données');
  const closes: (number | null)[] = res.indicators?.quote?.[0]?.close ?? [];
  const points: [string, number][] = [];
  res.timestamp.forEach((t: number, i: number) => {
    const c = closes[i];
    if (typeof c === 'number' && Number.isFinite(c)) points.push([new Date(t * 1000).toISOString().slice(0, 10), c]);
  });
  return { name: res.meta?.longName || res.meta?.shortName || symbol, currency: res.meta?.currency || 'EUR', points };
}

function lastAtOrBefore(points: [string, number][], date: string): number | null {
  let lo = 0;
  let hi = points.length - 1;
  let found: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= date) {
      found = points[mid][1];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found ?? points[0]?.[1] ?? null;
}

async function toEur(d: Daily, from: string, fx: Map<string, Daily>): Promise<Daily> {
  let cur = d.currency;
  let factor = 1;
  if (cur === 'GBp' || cur === 'GBX') {
    cur = 'GBP';
    factor = 0.01;
  }
  if (cur === 'EUR') return { ...d, currency: 'EUR' };
  // EURUSD=X donne le prix d'1 € en dollars : prix en € = prix en devise / taux
  const key = `EUR${cur}=X`;
  if (!fx.has(key)) fx.set(key, await yahooDaily(key, from));
  const rate = fx.get(key)!.points;
  return {
    ...d,
    currency: 'EUR',
    points: d.points.map(([date, v]) => [date, (v * factor) / (lastAtOrBefore(rate, date) ?? 1)] as [string, number]),
  };
}

async function inflationFR(from: string): Promise<[string, number][]> {
  const since = from.slice(0, 7);
  const r = await fetch(`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr?geo=FR&coicop18=TOTAL&sinceTimePeriod=${since}&format=JSON`, {
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`Eurostat HTTP ${r.status}`);
  const j = (await r.json()) as any;
  const times: Record<string, number> = j.dimension.time.category.index;
  const units: Record<string, number> = j.dimension.unit.category.index;
  const nT = Object.keys(times).length;
  // jeu de données JSON-stat : seules les dimensions unité et temps ont plus d'une valeur
  const series = (unit: string) =>
    units[unit] === undefined
      ? []
      : Object.entries(times)
          .map(([t, i]) => [t, j.value[String(units[unit] * nT + i)]] as [string, number | undefined])
          .filter((x): x is [string, number] => typeof x[1] === 'number')
          .sort((a, b) => a[0].localeCompare(b[0]));
  const a = series('I25');
  const b = series('I15');
  return (a.at(-1)?.[0] ?? '') >= (b.at(-1)?.[0] ?? '') && a.length ? a : b;
}

export async function marketData(symbols: string[], from: string, cacheDir: string): Promise<MarketData> {
  const cacheFile = path.join(cacheDir, 'market-cache.json');
  const key = `${[...symbols].sort().join(',')}|${from}`;
  try {
    const c = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
    if (c.key === key && Date.now() - Date.parse(c.data.fetchedAt) < TTL) return c.data as MarketData;
  } catch {
    /* pas de cache */
  }
  const out: MarketData = { prices: {}, errors: {}, inflation: [], fetchedAt: new Date().toISOString() };
  const fx = new Map<string, Daily>();
  for (const s of symbols) {
    try {
      out.prices[s] = await toEur(await yahooDaily(s, from), from, fx);
    } catch (e) {
      out.errors[s] = (e as Error).message;
    }
  }
  try {
    out.inflation = await inflationFR(from);
  } catch (e) {
    out.errors.inflation = (e as Error).message;
  }
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(cacheFile, JSON.stringify({ key, data: out }), 'utf8');
  return out;
}
