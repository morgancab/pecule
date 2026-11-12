/** Vues « coup d'œil » : record, vitesse d'enrichissement, calendrier des mois, cascade. */
import type { Point } from './analytics';
import { monthsBetween } from './format';
import { sumPeriods, type Period } from './market';

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
