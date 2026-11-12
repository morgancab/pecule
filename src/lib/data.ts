import type { AppData, Settings } from '../types';

export const DEFAULT_SETTINGS: Settings = { theme: 'dark', investRate: 5, investYears: 10 };

export function emptyData(): AppData {
  return {
    version: 1,
    accounts: [],
    transactions: [],
    categories: [],
    rules: [],
    recurring: [],
    ignoredKeys: [],
    dismissedInsights: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

/** Complète un objet chargé (fichier, import, ancienne version) avec les champs manquants. */
export function ensureShape(raw: unknown): AppData {
  const base = emptyData();
  if (!raw || typeof raw !== 'object') return base;
  const d = raw as Partial<AppData>;
  const categories = Array.isArray(d.categories) ? d.categories : base.categories;
  return {
    version: 1,
    accounts: Array.isArray(d.accounts)
      ? d.accounts.map((a) => {
          // connecteurs retirés (banque, Binance) : le patrimoine vient uniquement du tableau de suivi
          const { connector: _c, externalId: _ext, ...rest } = a as typeof a & { connector?: string; externalId?: string };
          return { ...rest, institution: a.institution ?? '', positions: a.positions ?? [], history: a.history ?? [] };
        })
      : [],
    // les opérations importées par l'ancienne connexion bancaire (Enable Banking) sont retirées
    transactions: Array.isArray(d.transactions) ? d.transactions.filter((t) => !t.externalId?.startsWith('eb:')) : [],
    categories,
    rules: Array.isArray(d.rules) ? d.rules : [],
    recurring: Array.isArray(d.recurring) ? d.recurring : [],
    ignoredKeys: Array.isArray(d.ignoredKeys) ? d.ignoredKeys : [],
    dismissedInsights: Array.isArray(d.dismissedInsights) ? d.dismissedInsights : [],
    settings: { ...DEFAULT_SETTINGS, ...(d.settings ?? {}) },
    isDemo: d.isDemo,
    updatedAt: d.updatedAt,
  };
}
