import type { Account } from '../types';
import { eur, eurSigned, fmtDate, pct, pctSigned } from './format';
import type { Point } from './analytics';
import type { Period } from './market';
import { ASSET_GROUPS } from './networth';

/** Rapport d'un relevé : ce qui a changé depuis le relevé précédent. */
export interface Report {
  date: string;
  prevDate: string;
  net: number;
  delta: number;
  ratio: number;
  period: Period | null;
  rank: number; // classement de la variation parmi tous les relevés (1 = la meilleure)
  count: number;
  avg12: number | null;
  movers: { account: Account; delta: number }[];
  events: { tone: 'good' | 'info' | 'warn'; text: string }[];
  shifts: { label: string; before: number; after: number }[];
  summary: string;
}

export function buildReport(index: number, series: Point[], periods: Period[], accounts: Account[]): Report | null {
  if (index < 1 || index >= series.length) return null;
  const p = series[index];
  const prev = series[index - 1];
  const delta = p.net - prev.net;
  const ratio = prev.net ? delta / Math.abs(prev.net) : 0;
  const period = periods.find((x) => x.date === p.date) ?? null;

  const deltas = series.slice(1).map((s, i) => s.net - series[i].net);
  const rank = deltas.filter((d) => d > delta).length + 1;
  const window = series.slice(Math.max(0, index - 12), index + 1);
  const avg12 = window.length > 2 ? (window[window.length - 1].net - window[0].net) / (window.length - 1) : null;

  const movers = accounts
    .map((a) => ({ account: a, delta: (p.accounts[a.id] ?? 0) - (prev.accounts[a.id] ?? 0) }))
    .filter((m) => Math.abs(m.delta) >= 1)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 6);

  const events: Report['events'] = [];
  const peakBefore = Math.max(...series.slice(0, index).map((s) => s.net));
  if (p.net > peakBefore) events.push({ tone: 'good', text: `Nouveau record : ${eur(p.net, false)}, au-dessus du précédent plus haut (${eur(peakBefore, false)}).` });
  for (const a of accounts) {
    const before = prev.accounts[a.id];
    const now = p.accounts[a.id];
    const appearedBefore = series.slice(0, index).some((s) => (s.accounts[a.id] ?? 0) !== 0);
    if (!appearedBefore && now) events.push({ tone: 'info', text: `Nouveau compte suivi : ${a.name} (${eur(now, false)}).` });
    if (before && before > 0 && (!now || now === 0)) events.push({ tone: 'info', text: `${a.name} est passé à 0 € (compte vidé ou clôturé).` });
  }
  if (period && period.interest > 1) events.push({ tone: 'good', text: `Intérêts annuels des livrets versés : environ ${eur(period.interest, false)}.` });
  if (deltas.length > 6 && rank <= 3 && delta > 0) events.push({ tone: 'good', text: `${rank === 1 ? 'Meilleure' : `${rank}e meilleure`} progression de tout ton historique.` });
  if (deltas.length > 6 && rank >= deltas.length - 2 && delta < 0) events.push({ tone: 'warn', text: 'Une des plus fortes baisses de ton historique.' });

  const share = (pt: Point, g: string) => {
    const assets = Object.entries(pt.groups).filter(([k]) => k !== 'dette').reduce((s, [, v]) => s + Math.max(0, v), 0);
    return assets ? Math.max(0, pt.groups[g] ?? 0) / assets : 0;
  };
  const shifts = ASSET_GROUPS.map((g) => ({ label: g.label, before: share(prev, g.id), after: share(p, g.id) })).filter((s) => s.before > 0.005 || s.after > 0.005);

  const parts: string[] = [];
  parts.push(`Entre le ${fmtDate(prev.date)} et le ${fmtDate(p.date)}, ton patrimoine net a ${delta >= 0 ? 'progressé' : 'reculé'} de ${eurSigned(delta, false)} (${pctSigned(ratio)}) pour atteindre ${eur(p.net, false)}.`);
  if (period) {
    const bits = [`${eurSigned(period.savings, false)} d’épargne`];
    if (Math.abs(period.market) >= 1) bits.push(`${eurSigned(period.market, false)} dus aux marchés`);
    if (period.interest >= 1) bits.push(`${eurSigned(period.interest, false)} d’intérêts`);
    parts.push(`Dans le détail : ${bits.join(', ')}.`);
  }
  if (avg12 !== null) parts.push(`C’est ${delta >= avg12 ? 'au-dessus' : 'en dessous'} de ta moyenne des 12 derniers relevés (${eurSigned(avg12, false)}).`);
  if (movers[0]) parts.push(`Le plus gros mouvement vient de ${movers[0].account.name} (${eurSigned(movers[0].delta, false)}).`);
  const bigShift = shifts.reduce((m, s) => (Math.abs(s.after - s.before) > Math.abs(m.after - m.before) ? s : m), shifts[0]);
  if (bigShift && Math.abs(bigShift.after - bigShift.before) >= 0.01) parts.push(`Part ${bigShift.label.toLowerCase()} : ${pct(bigShift.before, 0)} → ${pct(bigShift.after, 0)}.`);

  return { date: p.date, prevDate: prev.date, net: p.net, delta, ratio, period, rank, count: deltas.length, avg12, movers, events, shifts, summary: parts.join(' ') };
}
