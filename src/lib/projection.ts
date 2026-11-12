import { addMonths } from './format';

/**
 * Simulation mois par mois : chaque classe d'actifs rapporte son rendement annuel,
 * l'épargne mensuelle est ajoutée selon une répartition choisie.
 */

export type ClassId = 'liquidites' | 'epargne' | 'investissements' | 'crypto' | 'immobilier' | 'autres';

export interface ProjectionInput {
  start: Record<ClassId, number>; // valeurs actuelles par classe
  debts: number; // dettes actuelles (supposées constantes)
  monthly: number; // épargne ajoutée chaque mois
  split: Record<ClassId, number>; // répartition de l'épargne (somme = 1)
  returns: Record<ClassId, number>; // rendement annuel en %
  years: number;
  startDate: string;
}

export interface ProjPoint {
  date: string;
  month: number;
  net: number;
  contributed: number; // cumul de l'épargne ajoutée
}

export const CLASS_IDS: ClassId[] = ['liquidites', 'epargne', 'investissements', 'crypto', 'immobilier', 'autres'];

export function simulate(p: ProjectionInput, returnShift: Partial<Record<ClassId, number>> = {}): ProjPoint[] {
  const v = { ...p.start };
  const monthlyRate = Object.fromEntries(CLASS_IDS.map((c) => [c, Math.pow(1 + (p.returns[c] + (returnShift[c] ?? 0)) / 100, 1 / 12) - 1])) as Record<ClassId, number>;
  const out: ProjPoint[] = [];
  let contributed = 0;
  const total = () => CLASS_IDS.reduce((s, c) => s + v[c], 0) - p.debts;
  out.push({ date: p.startDate, month: 0, net: total(), contributed: 0 });
  for (let m = 1; m <= p.years * 12; m++) {
    for (const c of CLASS_IDS) v[c] = v[c] * (1 + monthlyRate[c]) + p.monthly * (p.split[c] ?? 0);
    contributed += p.monthly;
    out.push({ date: addMonths(p.startDate, m), month: m, net: total(), contributed });
  }
  return out;
}

/** Date à laquelle la courbe franchit un montant (null si jamais sur l'horizon). */
export function reachDate(points: ProjPoint[], target: number): string | null {
  if (points[0] && points[0].net >= target) return points[0].date;
  return points.find((p) => p.net >= target)?.date ?? null;
}

export function milestonesAbove(current: number): number[] {
  const steps = [50000, 100000, 150000, 200000, 250000, 300000, 400000, 500000, 750000, 1000000, 1500000, 2000000];
  return steps.filter((s) => s > current).slice(0, 5);
}

/** Scénarios : écarts de rendement appliqués aux placements risqués. */
export const SCENARIOS = {
  prudent: { label: 'Prudent', shift: { investissements: -4, crypto: -15 } as Partial<Record<ClassId, number>> },
  central: { label: 'Central', shift: {} as Partial<Record<ClassId, number>> },
  favorable: { label: 'Favorable', shift: { investissements: 3, crypto: 10 } as Partial<Record<ClassId, number>> },
};
