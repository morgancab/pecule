import type { Account, AppData, Settings } from '../types';
import { emptyData, DEFAULT_SETTINGS } from './data';
import { applyHistory, parseHistory, type HistoryParse } from './history';
import { todayISO } from './format';

/**
 * Données de l'app = feuille Google (soldes et historique) + réglages de l'utilisateur.
 * Les réglages sont enregistrés dans le compte Google de l'utilisateur, via son script (PropertiesService).
 */

type AccountPrefs = Partial<Pick<Account, 'name' | 'type' | 'institution' | 'rate' | 'ticker' | 'tickerExact' | 'archived'>>;

export interface Prefs {
  v: 1;
  settings?: Partial<Pick<Settings, 'theme' | 'projection' | 'investRate' | 'investYears' | 'birthYear' | 'reminder'>>;
  accounts?: Record<string, AccountPrefs>; // clé : colonne d'origine dans la feuille
}

export function prefsOf(d: AppData): Prefs {
  const accounts: Record<string, AccountPrefs> = {};
  for (const a of d.accounts) {
    if (!a.source) continue;
    accounts[a.source] = { name: a.name, type: a.type, institution: a.institution, rate: a.rate, ticker: a.ticker, tickerExact: a.tickerExact, archived: a.archived };
  }
  const { theme, projection, investRate, investYears, birthYear, reminder } = d.settings;
  return { v: 1, settings: { theme, projection, investRate, investYears, birthYear, reminder }, accounts };
}

export function buildFromSheet(values: string[][], prefs: Prefs | null, previous?: AppData): { data: AppData; parsed: HistoryParse } {
  const tsv = values.map((r) => r.join('\t')).join('\n');
  const parsed = parseHistory(tsv, todayISO());
  if ('error' in parsed) throw new Error(parsed.error);
  const base = emptyData();
  base.settings = { ...DEFAULT_SETTINGS, ...(previous?.settings ?? {}), ...(prefs?.settings ?? {}), lastSync: new Date().toISOString() };
  const { data } = applyHistory(base, parsed.columns, true);
  const over = prefs?.accounts ?? {};
  data.accounts = data.accounts.map((a) => {
    const p = a.source ? over[a.source] : undefined;
    if (!p) return a;
    const clean = Object.fromEntries(Object.entries(p).filter(([k, v]) => v !== undefined || k === 'ticker'));
    return { ...a, ...clean };
  });
  return { data, parsed };
}
