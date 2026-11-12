import type { Account } from '../types';
import { ACCOUNT_TYPES, isDebt } from './networth';
import { referenceOf } from './market';

/**
 * Diversification estimée compte par compte :
 * - classe d'actifs : d'après le type de compte ;
 * - zone géographique et secteur : d'après la référence de marché du compte (composition approximative de l'indice),
 *   calculés sur la partie actions du patrimoine.
 * Score = nombre « effectif » de poches (1 / indice de Herfindahl), ramené sur 10.
 */

type Weights = Record<string, number>;

// Compositions approximatives des références (ordre de grandeur 2025-2026)
const GEO: Record<string, Weights> = {
  AMZN: { 'États-Unis': 1 },
  'ESE.PA': { 'États-Unis': 1 },
  'CW8.PA': { 'États-Unis': 0.72, Japon: 0.055, 'Royaume-Uni': 0.035, Canada: 0.03, France: 0.027, Suisse: 0.023, Allemagne: 0.022, 'Autres pays': 0.088 },
};
const SECTOR: Record<string, Weights> = {
  AMZN: { 'Consommation discrétionnaire': 1 },
  'ESE.PA': { Technologie: 0.32, Finance: 0.13, Santé: 0.1, 'Consommation discrétionnaire': 0.1, Communication: 0.1, Industrie: 0.08, 'Consommation de base': 0.06, Autres: 0.11 },
  'CW8.PA': { Technologie: 0.26, Finance: 0.16, Industrie: 0.11, 'Consommation discrétionnaire': 0.1, Santé: 0.09, Communication: 0.08, 'Consommation de base': 0.06, Autres: 0.14 },
};

export type AssetClass = 'Liquidités' | 'Épargne réglementée' | 'Actions' | 'Fonds euros / obligations' | 'Crypto' | 'Immobilier' | 'Autres';

export function assetClassOf(a: Account): AssetClass {
  const ref = referenceOf(a);
  if (a.type === 'crypto' || ref?.ticker.endsWith('-EUR')) return 'Crypto';
  if (a.type === 'courant' || a.type === 'especes' || a.type === 'titres_resto') return 'Liquidités';
  if (a.type === 'livret') return 'Épargne réglementée';
  if (a.type === 'immobilier') return 'Immobilier';
  if (ref || a.type === 'pea' || a.type === 'cto') return 'Actions';
  if (a.type === 'assurance_vie' || a.type === 'per') return 'Fonds euros / obligations';
  return 'Autres';
}

function add(target: Weights, w: Weights, amount: number) {
  for (const [k, v] of Object.entries(w)) target[k] = (target[k] ?? 0) + v * amount;
}

function normalize(w: Weights): { label: string; value: number; share: number }[] {
  const total = Object.values(w).reduce((s, v) => s + v, 0);
  return Object.entries(w)
    .filter(([, v]) => v > 0.5)
    .map(([label, value]) => ({ label, value, share: total ? value / total : 0 }))
    .sort((a, b) => b.value - a.value);
}

export interface Dimension {
  id: 'classes' | 'geo' | 'sector' | 'concentration';
  title: string;
  score: number; // 0 à 10
  label: string;
  parts: { label: string; value: number; share: number }[];
  explain: string;
  base: number; // montant analysé
}

function scoreFrom(parts: { share: number }[], target: number): number {
  const hhi = parts.reduce((s, p) => s + p.share * p.share, 0);
  if (!hhi) return 0;
  const eff = 1 / hhi;
  return Math.max(0, Math.min(10, Math.round(((eff - 1) / (target - 1)) * 10)));
}

export function scoreLabel(s: number): string {
  if (s >= 8) return 'Excellente';
  if (s >= 6) return 'Très bonne';
  if (s >= 4) return 'Correcte';
  if (s >= 2) return 'Limitée';
  return 'Faible';
}

export function diversification(accounts: Account[]): { dimensions: Dimension[]; global: number; unknownEquity: number } {
  const active = accounts.filter((a) => !a.archived && !isDebt(a) && a.balance > 0);
  const classes: Weights = {};
  const geo: Weights = {};
  const sector: Weights = {};
  let equity = 0;
  let unknownEquity = 0;
  for (const a of active) {
    const cls = assetClassOf(a);
    classes[cls] = (classes[cls] ?? 0) + a.balance;
    if (cls !== 'Actions') continue;
    equity += a.balance;
    const ref = referenceOf(a);
    const g = ref && GEO[ref.ticker];
    const s = ref && SECTOR[ref.ticker];
    if (g) add(geo, g, a.balance);
    else {
      add(geo, { 'Non renseigné': 1 }, a.balance);
      unknownEquity += a.balance;
    }
    if (s) add(sector, s, a.balance);
    else add(sector, { 'Non renseigné': 1 }, a.balance);
  }
  const total = active.reduce((s, a) => s + a.balance, 0);
  const lines = normalize(Object.fromEntries(active.map((a) => [a.name, a.balance])));

  const classParts = normalize(classes);
  const geoParts = normalize(geo);
  const sectorParts = normalize(sector);
  const top = lines[0];

  const dims: Dimension[] = [
    {
      id: 'classes',
      title: 'Classes d’actifs',
      score: scoreFrom(classParts, 4),
      label: '',
      parts: classParts,
      base: total,
      explain: 'Répartition entre liquidités, épargne réglementée, actions, fonds euros, crypto et immobilier, sur tout le patrimoine.',
    },
    {
      id: 'geo',
      title: 'Diversification géographique',
      score: equity ? scoreFrom(geoParts, 3) : 0,
      label: '',
      parts: geoParts,
      base: equity,
      explain: 'Pays des entreprises détenues, sur la partie actions (d’après la référence de chaque compte : un ETF monde est réparti selon son indice).',
    },
    {
      id: 'sector',
      title: 'Diversification sectorielle',
      score: equity ? scoreFrom(sectorParts, 5) : 0,
      label: '',
      parts: sectorParts,
      base: equity,
      explain: 'Secteurs d’activité des entreprises détenues, sur la partie actions.',
    },
    {
      id: 'concentration',
      title: 'Concentration',
      score: top ? Math.max(0, Math.min(10, Math.round((1 - (top.share - 0.1) / 0.4) * 10))) : 0,
      label: '',
      parts: lines.slice(0, 6),
      base: total,
      explain: 'Poids de ton plus gros placement : 10/10 sous 10 % du patrimoine, 0/10 au-delà de 50 %.',
    },
  ];
  for (const d of dims) d.label = scoreLabel(d.score);
  const weights = { classes: 0.3, geo: 0.25, sector: 0.25, concentration: 0.2 };
  const global = Math.round(dims.reduce((s, d) => s + d.score * weights[d.id], 0));
  return { dimensions: dims, global, unknownEquity };
}

export const CLASS_TYPES = ACCOUNT_TYPES;
