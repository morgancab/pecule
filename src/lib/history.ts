import type { Account, AccountType, AppData } from '../types';
import { detectDelimiter, parseAmount, parseCSV } from './csv';
import { toISO } from './format';
import { normalize } from './text';
import { isDebt } from './networth';

/**
 * Import d'un tableau de suivi de patrimoine (type Excel / Google Sheets) :
 * une ligne par date, une colonne par compte, éventuellement des lignes de calcul (%) entre les dates.
 */

export interface HistoryColumn {
  index: number;
  header: string;
  group: string;
  name: string;
  institution: string;
  type: AccountType;
  include: boolean;
  archived: boolean;
  points: { date: string; value: number }[];
  latest: number;
}

export interface HistoryParse {
  columns: HistoryColumn[];
  dates: string[];
  skippedFuture: number;
  dateOrder: 'dmy' | 'mdy';
  check: { ok: number; total: number; mismatches: { date: string; expected: number; got: number }[] } | null;
}

type Order = 'dmy' | 'mdy' | 'ymd';

function parseDateAs(raw: string | undefined, order: Order): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (!m) return null;
  let y = +m[3];
  if (y < 100) y += 2000;
  return order === 'mdy' ? valid(y, +m[1], +m[2]) : valid(y, +m[2], +m[1]);
}

function valid(y: number, m: number, d: number) {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return toISO(y, m, d);
}

/** Choisit jour/mois ou mois/jour : celui qui donne une suite de dates croissante. */
function guessOrder(raws: string[]): 'dmy' | 'mdy' {
  let first = 0;
  let second = 0;
  for (const r of raws) {
    const m = r.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.]/);
    if (!m) continue;
    if (+m[1] > 12) first++;
    if (+m[2] > 12) second++;
  }
  if (first && !second) return 'dmy';
  if (second && !first) return 'mdy';
  const score = (o: Order) => {
    const ds = raws.map((r) => parseDateAs(r, o)).filter(Boolean) as string[];
    let inc = 0;
    for (let i = 1; i < ds.length; i++) if (ds[i] > ds[i - 1]) inc++;
    return inc;
  };
  return score('mdy') > score('dmy') ? 'mdy' : 'dmy'; // à égalité : format français
}

function cellValue(raw: string | undefined): number | null | 'pct' {
  if (raw === undefined) return null;
  const s = raw.trim();
  if (!s) return null;
  if (s.includes('%') || /#DIV|#N\/A|#VALEUR|#REF/i.test(s)) return 'pct';
  if (/^[-−–]\s*€?$/.test(s)) return 0;
  return parseAmount(s);
}

const IGNORED_HEADER = /total|somme|evolution|variation|delta|diff|distribution|rendement|perf|repartition|plus.?value|gain/;

export function guessType(text: string): AccountType {
  const n = ' ' + normalize(text).toLowerCase() + ' ';
  const has = (re: RegExp) => re.test(n);
  // « Crédit Agricole », « Crédit Mutuel »… sont des banques, pas des crédits
  if (has(/ (pret|emprunt|dette)| credit (?!agricole|mutuel|du nord|lyonnais|cooperatif)/)) return has(/immo|maison|appart/) ? 'credit_immo' : 'credit_conso';
  if (has(/assurance vie|assurance-vie| av /)) return 'assurance_vie';
  if (has(/ pea /)) return 'pea';
  if (has(/ per /)) return 'per';
  if (has(/livret|ldds| lep | pel | cel |epargne|compte a terme/)) return 'livret';
  if (has(/binance|crypto|coinbase|kraken|bitpanda|ledger|metamask|bitcoin| btc | eth |bitstack|meria/)) return 'crypto';
  if (has(/ticket|resto|swile|edenred|pluxee|sodexo|up dejeuner|titre/)) return 'titres_resto';
  if (has(/ cash |espece|liquide/)) return 'especes';
  if (has(/stock|action|etoro|trade republic| tr |degiro|bourse| cto |titres|ibkr|interactive|xtb|scalable|bux|saxo/)) return 'cto';
  if (has(/immo|scpi|appartement|maison|terrain/)) return 'immobilier';
  if (has(/voiture|vehicule|moto/)) return 'vehicule';
  return 'courant';
}

function splitName(header: string): { name: string; institution: string } {
  const parts = header.split(/\s+[-–—]\s+/);
  if (parts.length >= 2 && parts[0].length <= 30) {
    const name = parts.slice(1).join(' - ').trim();
    return { institution: parts[0].trim(), name: name.charAt(0).toUpperCase() + name.slice(1) };
  }
  const name = header.trim();
  return { name: name.charAt(0).toUpperCase() + name.slice(1), institution: '' };
}

export function parseHistory(text: string, today: string): HistoryParse | { error: string } {
  const delim = text.includes('\t') ? '\t' : detectDelimiter(text);
  const rows = parseCSV(text, delim);
  if (rows.length < 3) return { error: 'Tableau trop court : colle au moins une ligne d’en-tête et deux dates.' };
  const ncols = Math.max(...rows.map((r) => r.length));

  // 1. Colonne de dates
  let dateCol = -1;
  let best = 0;
  for (let c = 0; c < Math.min(3, ncols); c++) {
    const n = rows.filter((r) => parseDateAs(r[c], 'dmy') || parseDateAs(r[c], 'mdy')).length;
    if (n > best) {
      best = n;
      dateCol = c;
    }
  }
  if (dateCol < 0 || best < 2) return { error: 'Aucune colonne de dates trouvée (formats acceptés : 31/12/2025, 2025-12-31).' };

  const dateRowIdx = rows.map((r, i) => (parseDateAs(r[dateCol], 'dmy') || parseDateAs(r[dateCol], 'mdy') ? i : -1)).filter((i) => i >= 0);
  const order = guessOrder(dateRowIdx.map((i) => rows[i][dateCol]));

  // 2. Ligne d'en-tête (noms des comptes) et éventuelle ligne de groupes au-dessus
  const isLabel = (s: string | undefined) => !!s && s.trim() !== '' && parseAmount(s) === null && !parseDateAs(s, order) && !s.includes('%');
  let headerIdx = -1;
  for (let i = dateRowIdx[0] - 1; i >= 0; i--) {
    if (rows[i].filter((s, c) => c !== dateCol && isLabel(s)).length >= 2) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return { error: 'Ligne d’en-tête introuvable : la ligne juste au-dessus de la première date doit contenir les noms des comptes.' };
  const header = rows[headerIdx];
  const groupRow = headerIdx > 0 ? rows[headerIdx - 1] : [];
  const groupOf = (c: number) => {
    for (let k = c; k >= 0; k--) if (k !== dateCol && groupRow[k]?.trim()) return groupRow[k].trim();
    return '';
  };

  // 3. Dates (on ignore les lignes futures, souvent pré-remplies)
  const dated = dateRowIdx
    .map((i) => ({ i, date: parseDateAs(rows[i][dateCol], order)! }))
    .filter((x) => !!x.date);
  const future = dated.filter((x) => x.date > today).length;
  const kept = new Map<string, number>();
  for (const x of dated) if (x.date <= today) kept.set(x.date, x.i); // une seule ligne par date (la dernière)
  const dates = [...kept.keys()].sort();

  // 4. Colonnes de comptes
  const columns: HistoryColumn[] = [];
  let totalCol = -1;
  for (let c = 0; c < ncols; c++) {
    if (c === dateCol) continue;
    const h = (header[c] ?? '').trim();
    const ownGroup = (groupRow[c] ?? '').trim();
    if (totalCol < 0 && (/^total/i.test(h) || (!h && /^total/i.test(ownGroup)))) {
      totalCol = c;
      continue;
    }
    if (!h || IGNORED_HEADER.test(normalize(h).toLowerCase())) continue;
    const values = dates.map((d) => cellValue(rows[kept.get(d)!][c]));
    if (values.some((v) => v === 'pct')) continue;
    if (!values.some((v) => typeof v === 'number' && v !== 0)) continue;

    const points: { date: string; value: number }[] = [];
    let started = false;
    dates.forEach((date, k) => {
      const v = values[k] as number | null;
      if (!started && (v === null || v === 0)) return;
      started = true;
      points.push({ date, value: Math.round((v ?? 0) * 100) / 100 });
    });
    const group = groupOf(c);
    const { name, institution } = splitName(h);
    const type = guessType(`${h} ${group}`);
    const latest = points.length ? points[points.length - 1].value : 0;
    columns.push({ index: c, header: h, group, name, institution, type, include: true, archived: latest === 0, points, latest });
  }
  if (!columns.length) return { error: 'Aucune colonne de montants reconnue.' };

  // 5. Contrôle avec la colonne Total si elle existe
  let check: HistoryParse['check'] = null;
  if (totalCol >= 0) {
    const mismatches: { date: string; expected: number; got: number }[] = [];
    let ok = 0;
    let total = 0;
    for (const d of dates) {
      const t = cellValue(rows[kept.get(d)!][totalCol]);
      if (typeof t !== 'number') continue;
      total++;
      const got = columns.reduce((s, col) => s + (col.points.find((p) => p.date === d)?.value ?? 0), 0);
      if (Math.abs(got - t) <= Math.max(1.5, Math.abs(t) * 0.0005)) ok++;
      else mismatches.push({ date: d, expected: t, got: Math.round(got * 100) / 100 });
    }
    check = { ok, total, mismatches };
  }

  return { columns, dates, skippedFuture: future, dateOrder: order, check };
}

/** Ajoute (ou fusionne par nom) les comptes et leur historique dans les données. */
/**
 * `sheetIsSource` (synchro Google Sheet) : la feuille fait foi. Pour chaque compte suivi, les points d'historique
 * postérieurs au dernier relevé de la feuille sont retirés et le solde reprend la valeur de la feuille.
 */
export function applyHistory(data: AppData, columns: HistoryColumn[], sheetIsSource = false): { data: AppData; created: number; merged: number } {
  const accounts = [...data.accounts];
  let created = 0;
  let merged = 0;
  const key = (a: { name: string; institution: string }) => normalize(`${a.institution} ${a.name}`);

  for (const col of columns.filter((c) => c.include && c.points.length)) {
    const debt = isDebt({ type: col.type });
    const points = col.points.map((p) => ({ date: p.date, value: debt ? Math.abs(p.value) : p.value }));
    const lastImported = points[points.length - 1];
    const src = normalize(col.header);
    // on retrouve d'abord le compte par sa colonne d'origine (même s'il a été renommé dans Pécule)
    let idx = accounts.findIndex((a) => a.source === src);
    if (idx < 0) idx = accounts.findIndex((a) => !a.source && (key(a) === key(col) || normalize(a.name) === src));
    if (idx >= 0) {
      const a = accounts[idx];
      const authoritative = sheetIsSource && !a.positions.length;
      const kept = authoritative ? a.history.filter((s) => s.date <= lastImported.date) : a.history;
      const byDate = new Map(kept.map((s) => [s.date, s.value]));
      for (const p of points) byDate.set(p.date, p.value);
      const history = [...byDate.entries()].map(([date, value]) => ({ date, value })).sort((x, y) => x.date.localeCompare(y.date));
      const isLatest = history[history.length - 1].date === lastImported.date;
      accounts[idx] = {
        ...a,
        history,
        balance: (isLatest || authoritative) && !a.positions.length ? lastImported.value : a.balance,
        archived: isLatest ? col.archived : a.archived,
        source: src,
      };
      merged++;
    } else {
      const acc: Account = {
        // identifiant stable, dérivé de la colonne : les réglages restent attachés au bon compte
        id: 'a_' + src.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
        name: col.name,
        institution: col.institution,
        type: col.type,
        balance: lastImported.value,
        positions: [],
        history: points,
        createdAt: points[0].date,
        archived: col.archived || undefined,
        source: src,
      };
      accounts.push(acc);
      created++;
    }
  }
  return { data: { ...data, accounts, isDemo: false }, created, merged };
}
