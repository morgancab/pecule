import { toISO } from './format';

export interface RawTx {
  date: string;
  label: string;
  amount: number;
}

export interface Mapping {
  headerRow: number; // -1 = pas d'en-tête
  date: number;
  label: number;
  label2: number; // -1 = aucun
  mode: 'single' | 'split';
  amount: number;
  debit: number;
  credit: number;
  invert: boolean;
}

/** Lit un fichier en UTF-8, ou en Windows-1252 (fréquent dans les exports bancaires français). */
export async function readFileText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
  return text.replace(/^﻿/, '');
}

export function isOFX(text: string): boolean {
  return /<OFX>|OFXHEADER|<STMTTRN>/i.test(text.slice(0, 5000)) || /<STMTTRN>/i.test(text);
}

export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 30);
  const candidates = [';', ',', '\t', '|'];
  let best = ';';
  let bestScore = -1;
  for (const d of candidates) {
    const counts = lines.map((l) => countOutsideQuotes(l, d));
    const nonZero = counts.filter((c) => c > 0);
    if (!nonZero.length) continue;
    // on préfère un séparateur présent souvent et de façon régulière
    const mode = modeOf(nonZero);
    const score = nonZero.filter((c) => c === mode).length * Math.min(mode, 8);
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

function countOutsideQuotes(line: string, d: string) {
  let n = 0;
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === d && !q) n++;
  }
  return n;
}

function modeOf(values: number[]) {
  const m = new Map<number, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export function parseCSV(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += ch;
    } else if (ch === '"') {
      q = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()));
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()));
  return rows;
}

export function parseAmount(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  let s = String(raw)
    .trim()
    .replace(/[\s  ']/g, '')
    .replace(/€|EUR/gi, '');
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith('-')) {
    neg = !neg;
    s = s.slice(0, -1);
  }
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('-') || s.startsWith('−')) {
    neg = !neg;
    s = s.slice(1);
  }
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    const parts = s.split(',');
    s = parts.length > 2 ? parts.join('') : s.replace(',', '.');
  } else if (lastDot > -1) {
    const parts = s.split('.');
    if (parts.length > 2) s = parts.join('');
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = parseFloat(s);
  return neg ? -n : n;
}

function validDate(y: number, m: number, d: number): string | null {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return toISO(y, m, d);
}

export function parseDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return validDate(y, +m[2], +m[1]);
  }
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  return null;
}

const strip = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Devine la ligne d'en-tête et le rôle de chaque colonne. */
export function guessMapping(rows: string[][]): Mapping {
  const map: Mapping = { headerRow: -1, date: -1, label: -1, label2: -1, mode: 'single', amount: -1, debit: -1, credit: -1, invert: false };
  if (!rows.length) return map;

  // 1. Ligne d'en-tête : la première qui contient « date » et un mot de montant/libellé
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const cells = rows[i].map(strip);
    const hasDate = cells.some((c) => /date|^jour$/.test(c));
    const hasOther = cells.some((c) => /montant|amount|debit|credit|libelle|label|description|intitule|operation/.test(c));
    if (hasDate && hasOther) {
      map.headerRow = i;
      break;
    }
  }

  const ncols = Math.max(...rows.map((r) => r.length));
  const body = rows.slice(map.headerRow + 1, map.headerRow + 60);

  if (map.headerRow >= 0) {
    const h = rows[map.headerRow].map(strip);
    const find = (re: RegExp, exclude: number[] = []) => h.findIndex((c, i) => re.test(c) && !exclude.includes(i));
    map.date = find(/^date$|date.*op|date de l.?op|^date comptable|^jour$/);
    if (map.date < 0) map.date = find(/date(?!.*valeur)/);
    if (map.date < 0) map.date = find(/date/);
    map.label = find(/libelle|label|intitule|description|wording|nature|beneficiaire|tiers|payee/, [map.date]);
    if (map.label < 0) map.label = find(/operation|detail/, [map.date]);
    map.label2 = find(/detail|complement|memo|commentaire/, [map.date, map.label]);
    map.amount = find(/montant|amount|somme|valeur(?!.*date)/, [map.date, map.label]);
    map.debit = find(/debit/, [map.date, map.label]);
    map.credit = find(/credit/, [map.date, map.label]);
    if (map.amount < 0 && map.debit >= 0 && map.credit >= 0) map.mode = 'split';
    // le libellé complémentaire n'est utile que s'il est distinct et rempli
    if (map.label2 >= 0 && body.filter((r) => (r[map.label2] ?? '').length > 2).length < body.length / 2) map.label2 = -1;
    if (map.label2 >= 0) map.label2 = -1; // désactivé par défaut, l'utilisateur peut l'activer
  }

  // 2. Repli par contenu quand l'en-tête ne suffit pas
  const score = (fn: (v: string) => boolean, col: number) => body.filter((r) => fn(r[col] ?? '')).length;
  if (map.date < 0) {
    let best = -1;
    for (let c = 0; c < ncols; c++) {
      const s = score((v) => parseDate(v) !== null, c);
      if (s > best) {
        best = s;
        map.date = c;
      }
    }
  }
  if (map.mode === 'single' && map.amount < 0) {
    let best = -1;
    for (let c = 0; c < ncols; c++) {
      if (c === map.date) continue;
      const s = score((v) => parseAmount(v) !== null && /\d[.,]\d{1,2}$|^-?\d+$/.test(v.replace(/[\s€]/g, '')), c);
      if (s > best) {
        best = s;
        map.amount = c;
      }
    }
  }
  if (map.label < 0) {
    let bestLen = -1;
    for (let c = 0; c < ncols; c++) {
      if ([map.date, map.amount, map.debit, map.credit].includes(c)) continue;
      const vals = body.map((r) => r[c] ?? '').filter((v) => parseAmount(v) === null && parseDate(v) === null);
      const avg = vals.reduce((a, v) => a + v.length, 0) / Math.max(1, body.length);
      if (avg > bestLen) {
        bestLen = avg;
        map.label = c;
      }
    }
  }
  return map;
}

export function applyMapping(rows: string[][], map: Mapping): { txs: RawTx[]; invalid: number } {
  const txs: RawTx[] = [];
  let invalid = 0;
  for (let i = map.headerRow + 1; i < rows.length; i++) {
    const r = rows[i];
    const date = parseDate(r[map.date]);
    let amount: number | null = null;
    if (map.mode === 'single') amount = parseAmount(r[map.amount]);
    else {
      const d = parseAmount(r[map.debit]);
      const c = parseAmount(r[map.credit]);
      if (d !== null || c !== null) amount = Math.abs(c ?? 0) - Math.abs(d ?? 0);
    }
    const label = [r[map.label] ?? '', map.label2 >= 0 ? r[map.label2] ?? '' : '']
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!date || amount === null || amount === 0 || !label) {
      invalid++;
      continue;
    }
    txs.push({ date, label, amount: Math.round((map.invert ? -amount : amount) * 100) / 100 });
  }
  return { txs, invalid };
}

/** Format OFX/QFX (export proposé par la plupart des banques françaises). */
export function parseOFX(text: string): RawTx[] {
  const out: RawTx[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  for (const block of blocks) {
    const get = (tag: string) => block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'))?.[1]?.trim() ?? '';
    const date = parseDate(get('DTPOSTED'));
    const amount = parseAmount(get('TRNAMT'));
    const name = get('NAME');
    const memo = get('MEMO');
    const label = (memo && !name.includes(memo) && !memo.includes(name) ? `${name} ${memo}` : memo.length > name.length ? memo : name)
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
    if (date && amount !== null && amount !== 0 && label) out.push({ date, label, amount });
  }
  return out;
}
