import type { Account } from '../types';
import { addMonths, daysBetween, eur, fmtDate, pct } from './format';
import { ACCOUNT_TYPES, ASSET_GROUPS, isDebt } from './networth';

/**
 * Analyses construites uniquement sur l'historique des soldes (relevés du tableau de suivi).
 * Sans détail des versements, une variation mélange épargne ajoutée et performance des placements.
 */

export interface Point {
  date: string;
  net: number;
  groups: Record<string, number>;
  accounts: Record<string, number>;
}

function valueAt(a: Account, date: string): number | null {
  let v: number | null = null;
  for (const s of a.history) {
    if (s.date <= date) v = s.value;
    else break;
  }
  return v;
}

export function buildSeries(accounts: Account[]): Point[] {
  const dates = [...new Set(accounts.flatMap((a) => a.history.map((s) => s.date)))].sort();
  return dates.map((date) => {
    const groups: Record<string, number> = {};
    const accs: Record<string, number> = {};
    let net = 0;
    for (const a of accounts) {
      const raw = valueAt(a, date);
      if (raw === null) continue;
      const v = isDebt(a) ? -Math.abs(raw) : raw;
      const g = ACCOUNT_TYPES[a.type].group;
      groups[g] = (groups[g] ?? 0) + v;
      accs[a.id] = v;
      net += v;
    }
    return { date, net, groups, accounts: accs };
  });
}

/** Dernier point à la date donnée ou avant. */
export function pointAt(series: Point[], date: string): Point | null {
  let p: Point | null = null;
  for (const s of series) {
    if (s.date <= date) p = s;
    else break;
  }
  return p;
}

/** Relevé le plus proche d'une date (à ±20 jours), sinon le dernier relevé avant cette date. */
export function pointNear(series: Point[], date: string, tolDays = 20): Point | null {
  let best: Point | null = null;
  let gap = Infinity;
  for (const p of series) {
    const g = Math.abs(daysBetween(p.date, date));
    if (g < gap) {
      gap = g;
      best = p;
    }
  }
  return best && gap <= tolDays ? best : pointAt(series, date);
}

export interface Change {
  from: Point;
  to: Point;
  amount: number;
  ratio: number;
  months: number;
}

export function changeOver(series: Point[], months: number | 'all'): Change | null {
  if (series.length < 2) return null;
  const to = series[series.length - 1];
  const from = months === 'all' ? series[0] : pointNear(series, addMonths(to.date, -months));
  if (!from || from === to) return null;
  return { from, to, amount: to.net - from.net, ratio: from.net ? (to.net - from.net) / Math.abs(from.net) : 0, months: daysBetween(from.date, to.date) / 30.44 };
}

export function cagr(series: Point[]): number | null {
  if (series.length < 2) return null;
  const a = series[0];
  const b = series[series.length - 1];
  const years = daysBetween(a.date, b.date) / 365.25;
  if (years < 0.5 || a.net <= 0 || b.net <= 0) return null;
  return Math.pow(b.net / a.net, 1 / years) - 1;
}

export interface Delta {
  date: string;
  amount: number;
  ratio: number;
}

export function monthlyDeltas(series: Point[]): Delta[] {
  const out: Delta[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1].net;
    out.push({ date: series[i].date, amount: series[i].net - prev, ratio: prev ? (series[i].net - prev) / Math.abs(prev) : 0 });
  }
  return out;
}

export interface Drawdown {
  ratio: number;
  amount: number;
  peakDate: string;
  troughDate: string;
  recovered: boolean;
}

/** Plus forte baisse depuis un sommet (sur une série de valeurs). */
export function maxDrawdown(points: { date: string; value: number }[]): Drawdown | null {
  let peak = points[0];
  let worst: Drawdown | null = null;
  for (const p of points) {
    if (p.value > peak.value) peak = p;
    const dd = peak.value > 0 ? (peak.value - p.value) / peak.value : 0;
    if (dd > 0 && (!worst || dd > worst.ratio)) worst = { ratio: dd, amount: peak.value - p.value, peakDate: peak.date, troughDate: p.date, recovered: false };
  }
  if (worst) {
    const peakValue = points.find((p) => p.date === worst!.peakDate)!.value;
    worst.recovered = points.some((p) => p.date > worst!.troughDate && p.value >= peakValue);
  }
  return worst;
}

/** Variation moyenne par mois entre deux points. */
export function avgMonthly(c: Change | null): number | null {
  if (!c || c.months < 1) return null;
  return c.amount / c.months;
}

export interface Projection {
  monthly: number;
  in1y: number;
  in3y: number;
  in5y: number;
  milestone?: { target: number; date: string };
}

export function project(series: Point[], monthly: number | null): Projection | null {
  if (!series.length || monthly === null) return null;
  const last = series[series.length - 1];
  const step = last.net >= 100000 ? 50000 : 25000;
  const target = Math.floor(last.net / step) * step + step;
  const months = monthly > 0 ? Math.ceil((target - last.net) / monthly) : null;
  return {
    monthly,
    in1y: last.net + monthly * 12,
    in3y: last.net + monthly * 36,
    in5y: last.net + monthly * 60,
    milestone: months !== null && months <= 240 ? { target, date: addMonths(last.date, months) } : undefined,
  };
}

// ---------- Points d'attention ----------

export interface Finding {
  id: string;
  tone: 'alert' | 'warn' | 'info' | 'good';
  title: string;
  detail: string;
}

const CEILINGS: { re: RegExp; label: string; ceiling: number }[] = [
  { re: /livret a\b/i, label: 'Livret A', ceiling: 22950 },
  { re: /\bldds\b|developpement durable/i, label: 'LDDS', ceiling: 12000 },
  { re: /\blep\b|epargne populaire/i, label: 'LEP', ceiling: 10000 },
  { re: /livret jeune/i, label: 'Livret Jeune', ceiling: 1600 },
  { re: /compte epargne logement|compte épargne logement|\bcel\b/i, label: 'CEL', ceiling: 15300 },
  { re: /\bpel\b|plan epargne logement|plan épargne logement/i, label: 'PEL', ceiling: 61200 },
];

export function findings(accounts: Account[], series: Point[], idleRate = 2): Finding[] {
  const out: Finding[] = [];
  const active = accounts.filter((a) => !a.archived);
  const last = series[series.length - 1];
  if (!last) return out;
  const assets = active.filter((a) => !isDebt(a)).reduce((s, a) => s + Math.max(0, a.balance), 0);
  if (assets <= 0) return out;

  // Concentration sur un seul placement risqué
  for (const a of active) {
    const g = ACCOUNT_TYPES[a.type].group;
    if (!['investissements', 'crypto'].includes(g) || a.type === 'assurance_vie' || a.type === 'per') continue;
    const share = a.balance / assets;
    if (share >= 0.2) {
      out.push({
        id: `conc:${a.id}`,
        tone: share >= 0.3 ? 'alert' : 'warn',
        title: `${a.name} pèse ${pct(share, 0)} de ton patrimoine`,
        detail:
          `${eur(a.balance, false)} sur une seule ligne : une baisse de 30 % de ce placement te ferait perdre ${eur(a.balance * 0.3, false)}, soit ${pct(share * 0.3, 0)} du total. ` +
          (/stock|action|amazon|rsu|espp/i.test(a.name)
            ? 'S’il s’agit d’actions de ton employeur, ton salaire et ton patrimoine dépendent de la même entreprise : vendre progressivement une partie pour diversifier réduit ce risque.'
            : 'Diversifier (ETF monde, plusieurs supports) réduit ce risque.'),
      });
    }
  }

  // Argent qui dort sur les comptes courants
  const cash = active.filter((a) => a.type === 'courant');
  const cashTotal = cash.reduce((s, a) => s + Math.max(0, a.balance), 0);
  if (cashTotal > 10000) {
    const buffer = 5000;
    const idle = cashTotal - buffer;
    out.push({
      id: 'idle-cash',
      tone: 'warn',
      title: `${eur(cashTotal, false)} sur des comptes courants`,
      detail: `${cash
        .filter((a) => a.balance > 500)
        .sort((x, y) => y.balance - x.balance)
        .map((a) => `${a.name} ${eur(a.balance, false)}`)
        .join(', ')}. En gardant ${eur(buffer, false)} de trésorerie, il reste ${eur(idle, false)} qui ne rapportent probablement rien : placés à ${String(idleRate).replace('.', ',')} %/an (livret, fonds euros…), ce serait environ ${eur((idle * idleRate) / 100, false)} d’intérêts par an. Si une partie est déjà rémunérée (coffre Revolut, compte à terme…), ignore cette piste.`,
    });
  }

  // Plafonds des livrets réglementés
  for (const a of active) {
    if (a.type !== 'livret') continue;
    const c = CEILINGS.find((x) => x.re.test(a.name));
    if (!c) continue;
    if (a.balance >= c.ceiling - 50) {
      out.push({
        id: `ceiling:${a.id}`,
        tone: 'info',
        title: `${a.name} : plafond atteint`,
        detail: `Plafond de versement du ${c.label} : ${eur(c.ceiling, false)}. Les intérêts continuent de s’ajouter, mais tu ne peux plus y verser : ton épargne supplémentaire doit aller ailleurs.`,
      });
    }
  }

  // Part de crypto
  const cryptoShare = (last.groups.crypto ?? 0) / assets;
  if (cryptoShare >= 0.1) {
    out.push({
      id: 'crypto',
      tone: 'warn',
      title: `Crypto : ${pct(cryptoShare, 0)} du patrimoine`,
      detail: 'Les cryptos peuvent perdre plus de la moitié de leur valeur en quelques mois : au-delà de 5 à 10 % du patrimoine, une forte baisse se ressent nettement.',
    });
  }

  // Rythme d'enrichissement : derniers 6 mois vs 6 mois précédents
  const c6 = changeOver(series, 6);
  const p6 = pointNear(series, addMonths(last.date, -6));
  const p12 = pointNear(series, addMonths(last.date, -12));
  if (c6 && p6 && p12 && p6 !== p12) {
    const recent = c6.amount / Math.max(1, c6.months);
    const before = (p6.net - p12.net) / Math.max(1, daysBetween(p12.date, p6.date) / 30.44);
    if (before > 0 && recent < before * 0.5) {
      out.push({
        id: 'slowdown',
        tone: 'info',
        title: 'Ton patrimoine progresse moins vite',
        detail: `${eur(recent, false)} par mois en moyenne ces 6 derniers mois, contre ${eur(before, false)} sur les 6 mois d’avant. Ça peut venir des marchés (actions, crypto) ou d’une épargne plus faible : regarde la répartition de la variation ci-dessus.`,
      });
    } else if (recent > before * 1.5 && recent > 0) {
      out.push({
        id: 'speedup',
        tone: 'good',
        title: 'Ton patrimoine accélère',
        detail: `${eur(recent, false)} par mois en moyenne ces 6 derniers mois, contre ${eur(before, false)} sur les 6 mois d’avant.`,
      });
    }
  }

  // Sous le plus haut historique
  const peak = series.reduce((m, p) => (p.net > m.net ? p : m), series[0]);
  if (last.net < peak.net * 0.97) {
    out.push({
      id: 'below-peak',
      tone: 'info',
      title: `${pct((peak.net - last.net) / peak.net, 1)} sous ton plus haut`,
      detail: `Plus haut : ${eur(peak.net, false)} le ${fmtDate(peak.date)}. Écart actuel : ${eur(peak.net - last.net, false)}.`,
    });
  }

  return out;
}

export const GROUP_ORDER = ASSET_GROUPS.map((g) => g.id as string).concat('dette');
