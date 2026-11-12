/** Vues « coup d'œil » : record, vitesse d'enrichissement, calendrier des mois, cascade. */
import type { Point } from './analytics';
import { monthsBetween } from './format';
import { sumPeriods, type Period } from './market';
import { ASSET_GROUPS } from './networth';
import type { Account } from '../types';

// ---------- Record ----------

export function recordInfo(series: Point[]) {
  if (!series.length) return null;
  let peak = series[0];
  for (const p of series) if (p.net >= peak.net) peak = p;
  const last = series[series.length - 1];
  return { peak, isRecord: peak === last, gap: peak.net ? last.net / peak.net - 1 : 0 };
}

// ---------- Vitesse d'enrichissement : temps passé pour chaque tranche ----------

export interface Tranche {
  from: number;
  to: number;
  start: string;
  end: string | null; // null = tranche en cours
  months: number;
}

export function climbSpeed(series: Point[]): { step: number; tranches: Tranche[] } | null {
  if (series.length < 3) return null;
  const nets = series.map((p) => p.net);
  const range = Math.max(...nets) - Math.min(...nets);
  const steps = [1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];
  const step = steps.find((s) => range / s <= 7) ?? steps[steps.length - 1];
  const last = series[series.length - 1];
  const crossing = (t: number) => series.find((p) => p.net >= t)?.date ?? null;

  const tranches: Tranche[] = [];
  let t = Math.floor(series[0].net / step) * step + step; // premier palier au-dessus du départ
  for (;;) {
    const start = crossing(t);
    if (!start) break;
    const end = crossing(t + step);
    tranches.push({ from: t, to: t + step, start, end, months: monthsBetween(start, end ?? last.date) });
    if (!end) break;
    t += step;
  }
  return tranches.filter((x) => x.end).length >= 2 ? { step, tranches } : null;
}

// ---------- Calendrier : variation du patrimoine par mois ----------

export function monthlyGrid(series: Point[]) {
  const cells = new Map<string, number>(); // 'AAAA-MM' → variation (relevé de fin dans ce mois)
  for (let i = 1; i < series.length; i++) {
    const key = series[i].date.slice(0, 7);
    cells.set(key, (cells.get(key) ?? 0) + series[i].net - series[i - 1].net);
  }
  const years = [...new Set([...cells.keys()].map((k) => k.slice(0, 4)))].sort();
  const values = [...cells.entries()];
  const best = values.reduce((m, e) => (e[1] > m[1] ? e : m), values[0]);
  const worst = values.reduce((m, e) => (e[1] < m[1] ? e : m), values[0]);
  const up = values.filter((e) => e[1] > 0).length;
  // Total par année, en % du patrimoine au début de l'année (dernier relevé de l'année précédente)
  const yearTotals = new Map<string, { amount: number; ratio: number }>();
  for (const y of years) {
    const start = [...series].reverse().find((p) => p.date < `${y}-01-01`) ?? series[0];
    const end = [...series].reverse().find((p) => p.date <= `${y}-12-31`)!;
    const amount = end.net - start.net;
    yearTotals.set(y, { amount, ratio: start.net ? amount / start.net : 0 });
  }
  return { cells, years, yearTotals, best, worst, up, count: values.length };
}

// ---------- Cascade : du patrimoine de départ à aujourd'hui ----------

export function bridge(series: Point[], periods: Period[], fromDate: string) {
  const start = [...series].reverse().find((p) => p.date <= fromDate) ?? series[0];
  const end = series[series.length - 1];
  const s = sumPeriods(periods, start.date);
  // le reste (arrondis, dettes) est compté avec l'épargne pour que la cascade tombe juste
  const savings = end.net - start.net - s.market - s.interest;
  return { start, end, savings, market: s.market, interest: s.interest, total: end.net - start.net };
}

// ---------- Ton année en résumé ----------


export function yearReview(series: Point[], periods: Period[], accounts: Account[], year: string) {
  const inYear = series.filter((p) => p.date.startsWith(year));
  if (!inYear.length) return null;
  const start = [...series].reverse().find((p) => p.date < `${year}-01-01`) ?? series[0];
  const end = inYear[inYear.length - 1];
  const s = sumPeriods(periods, start.date, end.date);
  const savings = end.net - start.net - s.market - s.interest;

  const grid = monthlyGrid(series);
  const months = [...grid.cells.entries()].filter(([k]) => k.startsWith(year));
  const best = months.reduce<[string, number] | null>((m, e) => (!m || e[1] > m[1] ? e : m), null);
  const worst = months.reduce<[string, number] | null>((m, e) => (!m || e[1] < m[1] ? e : m), null);

  let peak = Math.max(...series.filter((p) => p.date < inYear[0].date).map((p) => p.net), -Infinity);
  let records = 0;
  for (const p of inYear) {
    if (p.net > peak) {
      records++;
      peak = p.net;
    }
  }

  const byAccount = accounts
    .map((a) => ({ a, delta: (end.accounts[a.id] ?? 0) - (start.accounts[a.id] ?? 0) }))
    .filter((x) => Math.abs(x.delta) >= 1)
    .sort((x, y) => y.delta - x.delta);

  const prevStart = [...series].reverse().find((p) => p.date < `${Number(year) - 1}-01-01`) ?? series[0];
  const prev = start.date > prevStart.date ? sumPeriods(periods, prevStart.date, start.date) : null;

  const share = (p: Point) => {
    const total = Object.entries(p.groups)
      .filter(([g]) => g !== 'dette')
      .reduce((t, [, v]) => t + Math.max(0, v), 0);
    return ASSET_GROUPS.map((g) => ({ id: g.id, label: g.label, value: total ? Math.max(0, p.groups[g.id] ?? 0) / total : 0 })).filter((g) => g.value > 0.005);
  };

  return {
    year,
    partial: !series.some((p) => p.date > `${year}-12-31`),
    start,
    end,
    total: end.net - start.net,
    ratio: start.net ? (end.net - start.net) / start.net : 0,
    savings,
    market: s.market,
    interest: s.interest,
    perMonth: s.months ? savings / s.months : null,
    prevPerMonth: prev && prev.months ? prev.savings / prev.months : null,
    best,
    worst,
    upMonths: months.filter(([, v]) => v > 0).length,
    monthCount: months.length,
    records,
    top: byAccount[0] ?? null,
    bottom: byAccount.length > 1 && byAccount[byAccount.length - 1].delta < 0 ? byAccount[byAccount.length - 1] : null,
    sharesStart: share(start),
    sharesEnd: share(end),
  };
}

// ---------- Comparaison avec les ménages du même âge (INSEE) ----------

/**
 * INSEE, enquête Histoire de vie et Patrimoine, début 2024 : patrimoine BRUT des ménages selon l'âge de la
 * personne de référence (celle qui apporte le plus de revenus). France hors Mayotte, logements ordinaires.
 * https://www.insee.fr/fr/statistiques/8894780 (publié le 07/04/2026).
 */
export const INSEE_2024 = {
  source: 'https://www.insee.fr/fr/statistiques/8894780',
  rows: [
    { id: 'u30', label: 'Moins de 30 ans', min: 0, max: 29, mean: 104400, d1: 3600, median: 26100, d9: 296400 },
    { id: '30', label: '30 à 39 ans', min: 30, max: 39, mean: 265000, d1: 6200, median: 146200, d9: 620100 },
    { id: '40', label: '40 à 49 ans', min: 40, max: 49, mean: 367600, d1: 7400, median: 215200, d9: 850000 },
    { id: '50', label: '50 à 59 ans', min: 50, max: 59, mean: 464800, d1: 7700, median: 254100, d9: 1021900 },
    { id: '60', label: '60 à 69 ans', min: 60, max: 69, mean: 462500, d1: 4000, median: 245000, d9: 1024700 },
    { id: '70', label: '70 ans ou plus', min: 70, max: 200, mean: 420300, d1: 7800, median: 247600, d9: 900500 },
  ],
  all: { label: 'Ensemble des ménages', mean: 374900, d1: 6200, median: 205100, d9: 857700 },
};

/** Position estimée (centile) par interpolation logarithmique entre 1er décile, médiane et 9e décile. */
export function percentileIn(v: number, b: { d1: number; median: number; d9: number }): { p: number; above9: boolean; below1: boolean } {
  if (v >= b.d9) return { p: 90, above9: true, below1: false };
  if (v <= b.d1) return { p: Math.max(0, (10 * v) / b.d1), above9: false, below1: true };
  const [lo, hi, p0] = v < b.median ? [b.d1, b.median, 10] : [b.median, b.d9, 50];
  return { p: p0 + (40 * Math.log(v / lo)) / Math.log(hi / lo), above9: false, below1: false };
}
