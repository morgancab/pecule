export type AccountType =
  | 'courant'
  | 'livret'
  | 'especes'
  | 'titres_resto'
  | 'assurance_vie'
  | 'pea'
  | 'cto'
  | 'per'
  | 'crypto'
  | 'immobilier'
  | 'vehicule'
  | 'autre_actif'
  | 'credit_immo'
  | 'credit_conso'
  | 'autre_dette';

export interface Snapshot {
  date: string; // YYYY-MM-DD
  value: number; // valeur brute (positive, même pour une dette)
}

export interface Position {
  id: string;
  symbol: string;
  name: string;
  quantity: number;
  buyPrice: number; // PRU
  price: number; // cours actuel en EUR
  updatedAt?: string;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  institution: string;
  balance: number; // solde, valeur, capital restant dû, ou liquidités si positions
  rate?: number; // taux annuel en %
  positions: Position[];
  history: Snapshot[];
  createdAt: string;
  archived?: boolean; // compte clôturé : masqué, mais son historique compte dans la courbe
  source?: string; // colonne d'origine dans le tableau de suivi (Google Sheet / import)
  ticker?: string; // référence de marché ("" = aucune, absent = devinée)
  tickerExact?: boolean; // le compte ne contient que cet actif
}

export type CategoryKind = 'expense' | 'income' | 'transfer';

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
}

export interface Transaction {
  id: string;
  date: string;
  label: string;
  amount: number; // négatif = dépense
  categoryId: string;
  accountId?: string;
  manual?: boolean; // catégorie choisie à la main
  externalId?: string; // identifiant côté connecteur, pour ne jamais importer deux fois
}

export interface Rule {
  id: string;
  pattern: string;
  categoryId: string;
}

export type Frequency = 'hebdo' | 'mensuel' | 'bimestriel' | 'trimestriel' | 'semestriel' | 'annuel';
export type RecurringStatus = 'essentiel' | 'utile' | 'a_revoir' | 'a_resilier' | 'resilie';
export type Usage = 'quotidien' | 'hebdo' | 'mensuel' | 'rare' | 'jamais';
export type RecurringKind =
  | 'logement'
  | 'energie'
  | 'internet'
  | 'mobile'
  | 'assurance'
  | 'mutuelle'
  | 'transport'
  | 'credit'
  | 'video'
  | 'musique'
  | 'cloud'
  | 'logiciel'
  | 'ia'
  | 'jeux'
  | 'presse'
  | 'sport'
  | 'livraison'
  | 'banque'
  | 'dons'
  | 'education'
  | 'autre';

export interface Recurring {
  id: string;
  name: string;
  amount: number; // montant par échéance, positif
  frequency: Frequency;
  kind: RecurringKind;
  status: RecurringStatus;
  usage?: Usage;
  nextDate?: string;
  matchKey?: string; // lien avec les opérations bancaires
  merchantId?: string;
  notes?: string;
  createdAt: string;
  cancelledAt?: string;
}

export type ThemePref = 'dark' | 'light' | 'system';

export interface Settings {
  theme: ThemePref;
  investRate: number; // % annuel pour les projections
  investYears: number;
  sheetUrl?: string; // feuille Google reliée (source du patrimoine)
  projection?: {
    monthly?: number;
    years?: number;
    split?: 'historique' | 'epargne' | 'investissements' | 'liquidites';
    returns?: Record<string, number>;
    real?: boolean;
    inflation?: number;
  };
  lastSync?: string;
  birthYear?: number; // pour se comparer aux ménages de son âge (INSEE)
  reminder?: {
    day: number; // jour du mois (1-28)
    subs: { endpoint: string; keys?: Record<string, string> }[]; // abonnements push des appareils
  };
}

export interface AppData {
  version: 1;
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  rules: Rule[];
  recurring: Recurring[];
  ignoredKeys: string[];
  dismissedInsights: string[];
  settings: Settings;
  isDemo?: boolean;
  updatedAt?: string;
}
