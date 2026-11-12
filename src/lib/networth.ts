import type { Account, AccountType } from '../types';
import { sum, todayISO } from './format';

export type AssetGroup = 'liquidites' | 'epargne' | 'investissements' | 'crypto' | 'immobilier' | 'autres' | 'dette';

export const ACCOUNT_TYPES: Record<AccountType, { label: string; group: AssetGroup; positions?: boolean; rate?: boolean; balanceLabel: string }> = {
  courant: { label: 'Compte courant', group: 'liquidites', balanceLabel: 'Solde' },
  livret: { label: 'Livret / épargne', group: 'epargne', rate: true, balanceLabel: 'Solde' },
  especes: { label: 'Espèces', group: 'liquidites', balanceLabel: 'Montant' },
  titres_resto: { label: 'Titres-restaurant', group: 'liquidites', balanceLabel: 'Solde' },
  assurance_vie: { label: 'Assurance-vie', group: 'investissements', positions: true, balanceLabel: 'Valeur (ou fonds euros)' },
  pea: { label: 'PEA', group: 'investissements', positions: true, balanceLabel: 'Liquidités' },
  cto: { label: 'Compte-titres', group: 'investissements', positions: true, balanceLabel: 'Liquidités' },
  per: { label: 'PER', group: 'investissements', positions: true, balanceLabel: 'Valeur (ou fonds euros)' },
  crypto: { label: 'Crypto', group: 'crypto', positions: true, balanceLabel: 'Liquidités (stablecoins, €)' },
  immobilier: { label: 'Immobilier', group: 'immobilier', balanceLabel: 'Valeur estimée' },
  vehicule: { label: 'Véhicule', group: 'autres', balanceLabel: 'Valeur estimée' },
  autre_actif: { label: 'Autre actif', group: 'autres', balanceLabel: 'Valeur estimée' },
  credit_immo: { label: 'Crédit immobilier', group: 'dette', rate: true, balanceLabel: 'Capital restant dû' },
  credit_conso: { label: 'Crédit conso / auto', group: 'dette', rate: true, balanceLabel: 'Capital restant dû' },
  autre_dette: { label: 'Autre dette', group: 'dette', balanceLabel: 'Montant dû' },
};

export const ASSET_GROUPS: { id: Exclude<AssetGroup, 'dette'>; label: string; slot: number | null }[] = [
  { id: 'liquidites', label: 'Liquidités', slot: 0 },
  { id: 'epargne', label: 'Épargne', slot: 1 },
  { id: 'investissements', label: 'Investissements', slot: 2 },
  { id: 'crypto', label: 'Crypto', slot: 3 },
  { id: 'immobilier', label: 'Immobilier', slot: 4 },
  { id: 'autres', label: 'Autres actifs', slot: null },
];

export const TYPE_GROUPS: { label: string; types: AccountType[] }[] = [
  { label: 'Comptes & épargne', types: ['courant', 'livret', 'especes', 'titres_resto'] },
  { label: 'Investissements', types: ['pea', 'cto', 'assurance_vie', 'per', 'crypto'] },
  { label: 'Biens', types: ['immobilier', 'vehicule', 'autre_actif'] },
  { label: 'Dettes', types: ['credit_immo', 'credit_conso', 'autre_dette'] },
];

export function isDebt(a: Pick<Account, 'type'>): boolean {
  return ACCOUNT_TYPES[a.type].group === 'dette';
}

export function positionsValue(a: Account): number {
  return sum(a.positions.map((p) => p.quantity * p.price));
}

export function accountValue(a: Account): number {
  return (Number(a.balance) || 0) + (a.positions.length ? positionsValue(a) : 0);
}

export function signedValue(a: Account): number {
  const v = accountValue(a);
  return isDebt(a) ? -Math.abs(v) : v;
}

export function gains(a: Account): { amount: number; ratio: number } | null {
  if (!a.positions.length) return null;
  const cost = sum(a.positions.map((p) => p.quantity * p.buyPrice));
  const value = positionsValue(a);
  return { amount: value - cost, ratio: cost > 0 ? (value - cost) / cost : 0 };
}

export function totals(accounts: Account[]) {
  const byGroup: Record<string, number> = {};
  let assets = 0;
  let debts = 0;
  for (const a of accounts) {
    const g = ACCOUNT_TYPES[a.type].group;
    const v = accountValue(a);
    if (g === 'dette') debts += Math.abs(v);
    else {
      assets += v;
      byGroup[g] = (byGroup[g] ?? 0) + v;
    }
  }
  return { assets, debts, net: assets - debts, byGroup };
}

/** Enregistre la valeur du jour dans l'historique du compte (une valeur par jour). */
export function withSnapshot(a: Account, date = todayISO()): Account {
  const value = Math.round(accountValue(a) * 100) / 100;
  const history = a.history.filter((s) => s.date !== date);
  history.push({ date, value });
  history.sort((x, y) => x.date.localeCompare(y.date));
  return { ...a, history };
}

function lastAtOrBefore(a: Account, date: string): number | null {
  let v: number | null = null;
  for (const s of a.history) {
    if (s.date <= date) v = s.value;
    else break;
  }
  return v;
}

/** Valeur du patrimoine net à une date passée, d'après les historiques. null si aucune donnée. */
export function netWorthAt(accounts: Account[], date: string): number | null {
  let total = 0;
  let any = false;
  for (const a of accounts) {
    const v = lastAtOrBefore(a, date);
    if (v === null) continue;
    any = true;
    total += isDebt(a) ? -Math.abs(v) : v;
  }
  return any ? total : null;
}

export function netWorthSeries(accounts: Account[], today = todayISO()): { date: string; value: number }[] {
  const dates = new Set<string>();
  for (const a of accounts) for (const s of a.history) if (s.date < today) dates.add(s.date);
  const series = [...dates].sort().map((date) => ({ date, value: netWorthAt(accounts, date) ?? 0 }));
  series.push({ date: today, value: totals(accounts).net });
  return series;
}
