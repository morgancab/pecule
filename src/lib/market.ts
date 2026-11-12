import type { Account } from '../types';
import { daysBetween } from './format';
import type { Point } from './analytics';

/** Données publiques renvoyées par /api/market. */
export interface MarketData {
  prices: Record<string, { name: string; currency: string; points: [string, number][] }>;
  errors: Record<string, string>;
  inflation: [string, number][];
  fetchedAt: string;
}

export async function fetchMarket(symbols: string[], from: string): Promise<MarketData> {
  const r = await fetch(`/api/market?symbols=${encodeURIComponent(symbols.join(','))}&from=${from}`, { credentials: 'same-origin' });
  if (!r.ok) throw new Error(`Données de marché indisponibles (${r.status})`);
  return r.json();
}

// ---------- Références de marché par compte ----------

export const REFERENCES: { ticker: string; label: string; exact?: boolean }[] = [
  { ticker: 'AMZN', label: 'Action Amazon', exact: true },
  { ticker: 'CW8.PA', label: 'MSCI World (ETF)' },
  { ticker: 'ESE.PA', label: 'S&P 500 (ETF)' },
  { ticker: 'BTC-EUR', label: 'Bitcoin' },
  { ticker: 'ETH-EUR', label: 'Ethereum' },
];

export interface Reference {
  ticker: string;
  exact: boolean; // le compte ne contient que cet actif (sinon : indice de comparaison)
}

/** Référence choisie, sinon devinée : Amazon → AMZN, crypto → Bitcoin, compte-titres/PEA → MSCI World. */
export function referenceOf(a: Account): Reference | null {
  if (a.ticker !== undefined) return a.ticker ? { ticker: a.ticker, exact: !!a.tickerExact } : null;
  if (/amazon|amzn/i.test(a.name)) return { ticker: 'AMZN', exact: true };
  if (a.type === 'crypto') return { ticker: 'BTC-EUR', exact: false };
  if (a.type === 'cto' || a.type === 'pea') return { ticker: 'CW8.PA', exact: false };
  return null;
}

export function referenceLabel(t: string): string {
  return REFERENCES.find((r) => r.ticker === t)?.label ?? t;
}

export function priceAt(points: [string, number][] | undefined, date: string): number | null {
  if (!points?.length) return null;
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
  return found;
}

// ---------- Taux du Livret A (taux officiels) ----------

export const LIVRET_A: [string, number][] = [
  ['2020-02-01', 0.5],
  ['2022-02-01', 1],
  ['2022-08-01', 2],
  ['2023-02-01', 3],
  ['2025-02-01', 2.4],
  ['2025-08-01', 1.7],
  ['2026-02-01', 1.5],
  ['2026-08-01', 1.7],
];

export function livretRate(date: string): number {
  let r = LIVRET_A[0][1];
  for (const [d, v] of LIVRET_A) if (d <= date) r = v;
  return r;
}

/** Taux moyen pondéré dans le temps entre deux dates (en %). */
export function avgLivretRate(from: string, to: string): number {
  const days = Math.max(1, daysBetween(from, to));
  let acc = 0;
  let cursor = from;
  const changes = LIVRET_A.map(([d]) => d).filter((d) => d > from && d < to);
  for (const next of [...changes, to]) {
    acc += livretRate(cursor) * daysBetween(cursor, next);
    cursor = next;
  }
  return acc / days;
}

/** Le CEL rapporte environ 2/3 du Livret A ; LEP et Livret Jeune au moins autant que le Livret A. */
function accountRate(a: Account, date: string): number {
  if (a.rate) return a.rate;
  if (/epargne logement|épargne logement|\bcel\b/i.test(a.name)) return Math.round((livretRate(date) * 2) / 3 / 0.25) * 0.25;
  return livretRate(date);
}

// ---------- Décomposition : épargne / marchés / intérêts ----------

export interface Period {
  date: string; // date du relevé de fin
  from: string;
  savings: number; // argent nouveau estimé (épargne, versements, actions reçues…)
  market: number; // effet des cours sur les comptes suivis par une référence
  interest: number; // intérêts annuels des livrets (versés en janvier)
  byAccount: Record<string, { savings: number; market: number; interest: number }>;
}

/**
 * Pour chaque intervalle entre deux relevés :
 * - comptes avec une référence de marché : effet marché = valeur précédente × évolution du cours, le reste = apports nets ;
 * - livrets : au passage du 1er janvier, la hausse jusqu'aux intérêts attendus est comptée comme intérêts ;
 * - autres comptes : toute variation est de l'épargne (ou une dépense, si négative).
 */
export function decompose(accounts: Account[], series: Point[], market: MarketData | null): Period[] {
  const out: Period[] = [];
  for (let i = 1; i < series.length; i++) {
    const p0 = series[i - 1];
    const p1 = series[i];
    const per: Period = { date: p1.date, from: p0.date, savings: 0, market: 0, interest: 0, byAccount: {} };
    for (const a of accounts) {
      const v0 = p0.accounts[a.id] ?? 0;
      const v1 = p1.accounts[a.id] ?? 0;
      if (v0 === 0 && v1 === 0) continue;
      const delta = v1 - v0;
      let mkt = 0;
      let intr = 0;
      const ref = referenceOf(a);
      const pts = ref ? market?.prices[ref.ticker]?.points : undefined;
      if (ref && pts && v0 > 0) {
        const c0 = priceAt(pts, p0.date);
        const c1 = priceAt(pts, p1.date);
        if (c0 && c1) mkt = v0 * (c1 / c0 - 1);
      } else if (a.type === 'livret' && v0 > 0 && p1.date.slice(0, 4) > p0.date.slice(0, 4)) {
        const year = p0.date.slice(0, 4);
        const expected = (v0 * accountRate(a, `${year}-07-01`)) / 100;
        intr = Math.min(Math.max(delta, 0), expected * 1.3);
      }
      const sav = delta - mkt - intr;
      per.byAccount[a.id] = { savings: sav, market: mkt, interest: intr };
      per.savings += sav;
      per.market += mkt;
      per.interest += intr;
    }
    out.push(per);
  }
  return out;
}

export function sumPeriods(periods: Period[], from: string, to = '9999') {
  const sel = periods.filter((p) => p.date > from && p.date <= to);
  return {
    savings: sel.reduce((s, p) => s + p.savings, 0),
    market: sel.reduce((s, p) => s + p.market, 0),
    interest: sel.reduce((s, p) => s + p.interest, 0),
    months: sel.length ? Math.max(1, daysBetween(sel[0].from, sel[sel.length - 1].date) / 30.44) : 0,
  };
}

export function byYear(periods: Period[]) {
  const years = new Map<string, { year: string; savings: number; market: number; interest: number }>();
  for (const p of periods) {
    const y = p.date.slice(0, 4);
    const e = years.get(y) ?? { year: y, savings: 0, market: 0, interest: 0 };
    e.savings += p.savings;
    e.market += p.market;
    e.interest += p.interest;
    years.set(y, e);
  }
  return [...years.values()];
}

// ---------- Inflation ----------

export function cpiAt(inflation: [string, number][], date: string): number | null {
  const month = date.slice(0, 7);
  let v: number | null = null;
  for (const [m, x] of inflation) {
    if (m <= month) v = x;
    else break;
  }
  return v ?? inflation[0]?.[1] ?? null;
}

/** Patrimoine exprimé en euros d'aujourd'hui. */
export function realSeries(series: Point[], inflation: [string, number][]) {
  const last = inflation[inflation.length - 1]?.[1];
  if (!last) return null;
  return series.map((p) => {
    const c = cpiAt(inflation, p.date);
    return { date: p.date, nominal: p.net, real: c ? (p.net * last) / c : p.net };
  });
}

/** Inflation, taux moyen du Livret A et rendement réel, par année civile. */
export function savingsVsInflation(inflation: [string, number][], fromYear: number, today: string) {
  const rows: { year: string; inflation: number; livretA: number; real: number; partial: boolean }[] = [];
  const lastMonth = inflation[inflation.length - 1]?.[0];
  if (!lastMonth) return rows;
  for (let y = fromYear; y <= Number(today.slice(0, 4)); y++) {
    // année en cours : sur les 12 derniers mois connus (pas d'extrapolation d'une année partielle)
    const partial = `${y}-12` > lastMonth;
    const endMonth = partial ? lastMonth : `${y}-12`;
    const startMonth = partial ? `${Number(lastMonth.slice(0, 4)) - 1}${lastMonth.slice(4)}` : `${y - 1}-12`;
    const start = cpiAt(inflation, `${startMonth}-15`);
    const end = cpiAt(inflation, `${endMonth}-15`);
    if (!start || !end || endMonth <= `${y - 1}-12`) continue;
    const infl = (end / start - 1) * 100;
    const la = partial ? avgLivretRate(`${startMonth}-01`, today) : avgLivretRate(`${y}-01-01`, `${y + 1}-01-01`);
    rows.push({ year: String(y), inflation: infl, livretA: la, real: ((1 + la / 100) / (1 + infl / 100) - 1) * 100, partial });
  }
  return rows;
}

// ---------- Argent qui dort ----------

/**
 * Manque à gagner : ce que la part des comptes courants au-delà d'un coussin de sécurité
 * aurait rapporté au taux du Livret A, relevé après relevé.
 */
export function cashDrag(accounts: Account[], series: Point[], buffer = 5000) {
  const cashIds = accounts.filter((a) => a.type === 'courant').map((a) => a.id);
  let total = 0;
  let last12 = 0;
  const end = series[series.length - 1]?.date ?? '';
  const yearAgo = end ? `${Number(end.slice(0, 4)) - 1}${end.slice(4)}` : '';
  for (let i = 1; i < series.length; i++) {
    const p0 = series[i - 1];
    const cash = cashIds.reduce((s, id) => s + Math.max(0, p0.accounts[id] ?? 0), 0);
    const excess = Math.max(0, cash - buffer);
    const missed = (excess * livretRate(p0.date)) / 100 * (daysBetween(p0.date, series[i].date) / 365);
    total += missed;
    if (series[i].date > yearAgo) last12 += missed;
  }
  const lastPoint = series[series.length - 1];
  const cashNow = lastPoint ? cashIds.reduce((s, id) => s + Math.max(0, lastPoint.accounts[id] ?? 0), 0) : 0;
  const excessNow = Math.max(0, cashNow - buffer);
  return { total, last12, cashNow, excessNow, perYearNow: (excessNow * livretRate(end || '9999')) / 100, rateNow: livretRate(end || '9999'), buffer };
}

// ---------- Actions d'une seule société (ex. Amazon) ----------

/** Nombre d'actions implicite à chaque relevé (valeur / cours). */
export function impliedShares(a: Account, series: Point[], market: MarketData | null) {
  const ref = referenceOf(a);
  const pts = ref ? market?.prices[ref.ticker]?.points : undefined;
  if (!ref || !ref.exact || !pts) return null;
  return series
    .filter((p) => (p.accounts[a.id] ?? 0) > 0)
    .map((p) => {
      const price = priceAt(pts, p.date)!;
      return { date: p.date, value: p.accounts[a.id], price, shares: p.accounts[a.id] / price };
    });
}
