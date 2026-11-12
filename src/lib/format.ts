const eurFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const eur0Fmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const compactFmt = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });
const numFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 8 });

/** 1 234,56 € */
export function eur(n: number, decimals = true): string {
  return (decimals ? eurFmt : eur0Fmt).format(Number.isFinite(n) ? n : 0);
}

/** +12,00 € / −12,00 € */
export function eurSigned(n: number, decimals = true): string {
  const s = eur(Math.abs(n), decimals);
  if (Math.abs(n) < 0.005) return s;
  return (n > 0 ? '+' : '−') + s;
}

/** 12 k€ pour les axes */
export function eurCompact(n: number): string {
  if (Math.abs(n) < 10000) return eur(n, false);
  return compactFmt.format(n) + ' €';
}

export function num(n: number): string {
  return numFmt.format(n);
}

export function pct(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits).replace('.', ',')} %`;
}

export function pctSigned(ratio: number, digits = 1): string {
  const s = pct(Math.abs(ratio), digits);
  if (Math.abs(ratio) < 0.0005) return s;
  return (ratio > 0 ? '+' : '−') + s;
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ---------- Dates (chaînes ISO YYYY-MM-DD, calculs en UTC pour éviter les décalages d'heure d'été) ----------

const DAY = 86400000;

export function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function todayISO(): string {
  const d = new Date();
  return toISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function parseISO(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function fromTime(t: number): string {
  const d = new Date(t);
  return toISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(iso: string, n: number): string {
  return fromTime(parseISO(iso) + n * DAY);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b) - parseISO(a)) / DAY);
}

function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return toISO(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function shiftMonth(key: string, n: number): string {
  return addMonths(key + '-01', n).slice(0, 7);
}

export function monthLabel(key: string, long = false): string {
  const [y, m] = key.split('-').map(Number);
  const s = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('fr-FR', {
    month: long ? 'long' : 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function monthShort(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('fr-FR', { month: 'short', timeZone: 'UTC' });
}

export function fmtDate(iso: string, withYear = true): string {
  return new Date(parseISO(iso)).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}

export function relativeDays(iso: string, today = todayISO()): string {
  const n = daysBetween(today, iso);
  if (n === 0) return "aujourd'hui";
  if (n === 1) return 'demain';
  if (n === -1) return 'hier';
  if (n > 0) return `dans ${n} j`;
  return `il y a ${-n} j`;
}

export function monthsBetween(a: string, b: string): number {
  return Math.max(0, daysBetween(a, b) / 30.44);
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
