import { useMemo } from 'react';
import { useStore } from '../store';
import { go } from '../App';
import { Empty, Seg, Stat } from '../components/ui';
import { ProjectionScenarioChart } from '../components/charts';
import { eur, eurSigned, fmtDate } from '../lib/format';
import { ACCOUNT_TYPES, ASSET_GROUPS, totals } from '../lib/networth';
import { avgMonthly, changeOver } from '../lib/analytics';
import { cashDrag, decompose, livretRate, sumPeriods } from '../lib/market';
import { useMarket } from '../lib/useMarket';
import { CLASS_IDS, SCENARIOS, milestonesAbove, reachDate, simulate, type ClassId, type ProjectionInput } from '../lib/projection';
import type { Settings } from '../types';

type SplitMode = 'historique' | 'epargne' | 'investissements' | 'liquidites';
type Prefs = NonNullable<Settings['projection']>;

const LABELS: Record<ClassId, string> = Object.fromEntries(ASSET_GROUPS.map((g) => [g.id, g.label])) as Record<ClassId, string>;

export default function Projection() {
  const { data, update } = useStore();
  const { series, market } = useMarket(data.accounts);
  const periods = useMemo(() => decompose(data.accounts, series, market), [data.accounts, series, market]);
  const prefs: Prefs = data.settings.projection ?? {};
  const setPrefs = (p: Partial<Prefs>) => update((d) => ({ ...d, settings: { ...d.settings, projection: { ...(d.settings.projection ?? {}), ...p } } }));

  if (series.length < 3) {
    return (
      <div className="card">
        <Empty title="Pas encore assez d’historique" text="Synchronise ta feuille Google : la projection part de ton patrimoine actuel et de ton rythme d’épargne.">
          <button className="btn btn-primary" onClick={() => go('reglages')}>
            Synchroniser ma feuille
          </button>
        </Empty>
      </div>
    );
  }

  const last = series[series.length - 1];
  const t = totals(data.accounts);
  const c12 = changeOver(series, 12);
  const linear = avgMonthly(c12);
  const s12 = sumPeriods(periods, c12?.from.date ?? series[0].date);
  const estimatedSavings = market && s12.months ? Math.round(s12.savings / s12.months / 10) * 10 : linear !== null ? Math.round(linear / 10) * 10 : 500;

  // Où est allée l'épargne des 12 derniers mois (par classe d'actifs)
  const histSplit: Record<ClassId, number> = Object.fromEntries(CLASS_IDS.map((c) => [c, 0])) as Record<ClassId, number>;
  for (const p of periods.filter((x) => x.date > (c12?.from.date ?? '0000'))) {
    for (const [id, b] of Object.entries(p.byAccount)) {
      const a = data.accounts.find((x) => x.id === id);
      const g = a ? ACCOUNT_TYPES[a.type].group : 'autres';
      if (g !== 'dette' && b.savings > 0) histSplit[g as ClassId] += b.savings;
    }
  }
  const histTotal = CLASS_IDS.reduce((s, c) => s + histSplit[c], 0);

  const monthly = prefs.monthly ?? estimatedSavings;
  const years = prefs.years ?? 10;
  const splitMode: SplitMode = prefs.split ?? 'historique';
  const real = prefs.real ?? false;
  const inflation = prefs.inflation ?? 2;
  const returns: Record<ClassId, number> = {
    liquidites: 0,
    epargne: livretRate(last.date),
    investissements: 6,
    crypto: 0,
    immobilier: 2,
    autres: 0,
    ...(prefs.returns ?? {}),
  };
  const split: Record<ClassId, number> = Object.fromEntries(CLASS_IDS.map((c) => [c, 0])) as Record<ClassId, number>;
  if (splitMode === 'historique' && histTotal > 0) for (const c of CLASS_IDS) split[c] = histSplit[c] / histTotal;
  else split[splitMode === 'historique' ? 'epargne' : splitMode] = 1;

  const start = Object.fromEntries(CLASS_IDS.map((c) => [c, Math.max(0, t.byGroup[c] ?? 0)])) as Record<ClassId, number>;
  const input: ProjectionInput = { start, debts: t.debts, monthly, split, returns, years, startDate: last.date };
  const deflate = (v: number, month: number) => (real ? v / Math.pow(1 + inflation / 100, month / 12) : v);
  const sim = (shift = {}, inp: ProjectionInput = input) => simulate(inp, shift).map((p) => ({ ...p, net: deflate(p.net, p.month) }));
  const runs = { prudent: sim(SCENARIOS.prudent.shift), central: sim(), favorable: sim(SCENARIOS.favorable.shift) };
  const end = runs.central[runs.central.length - 1];
  const at = (y: number) => runs.central[Math.min(runs.central.length - 1, y * 12)];

  // Graphique : historique puis scénarios, sur un pas mensuel
  const rows: { date: string; history?: number; prudent?: number; central?: number; favorable?: number }[] = series.map((p) => ({ date: p.date, history: p.net }));
  runs.central.forEach((p, i) => {
    const row = { date: p.date, prudent: runs.prudent[i].net, central: p.net, favorable: runs.favorable[i].net };
    if (i === 0) Object.assign(rows[rows.length - 1], row);
    else rows.push(row);
  });

  const milestones = milestonesAbove(last.net);
  const gains = end.net - deflate(last.net, 0) - (real ? 0 : end.contributed);

  // « Et si… » (scénario central, à l'horizon choisi)
  const drag = cashDrag(data.accounts, series);
  const variant = (patch: Partial<ProjectionInput>) => {
    const r = sim({}, { ...input, ...patch });
    return r[r.length - 1].net - end.net;
  };
  const moveCash = (to: ClassId) => {
    const s = { ...start };
    s.liquidites -= drag.excessNow;
    s[to] += drag.excessNow;
    return variant({ start: s });
  };
  const nextMilestone = milestones[0];
  const whatIf = [
    { label: '+100 € d’épargne par mois', delta: variant({ monthly: monthly + 100 }), date: nextMilestone ? reachDate(sim({}, { ...input, monthly: monthly + 100 }), nextMilestone) : null },
    { label: '+300 € d’épargne par mois', delta: variant({ monthly: monthly + 300 }), date: nextMilestone ? reachDate(sim({}, { ...input, monthly: monthly + 300 }), nextMilestone) : null },
    ...(drag.excessNow > 1000
      ? [
          { label: `Placer l’argent qui dort (${eur(drag.excessNow, false)}) sur des livrets`, delta: moveCash('epargne'), date: null },
          { label: `Investir l’argent qui dort (${eur(drag.excessNow, false)}) à ${String(returns.investissements).replace('.', ',')} %/an`, delta: moveCash('investissements'), date: null },
        ]
      : []),
    { label: '+1 point de rendement sur tes investissements', delta: variant({ returns: { ...returns, investissements: returns.investissements + 1 } }), date: null },
  ];

  const numberInput = (value: number, onChange: (v: number) => void, step: number, label: string, suffix: string, width = 80) => (
    <label className="row small text-2" style={{ gap: 6 }}>
      {label}
      <input
        type="number"
        className="input-sm"
        style={{ width, textAlign: 'right' }}
        value={value}
        step={step}
        onChange={(e) => onChange(Number(e.target.value.replace(',', '.')) || 0)}
      />
      {suffix}
    </label>
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Projection</h1>
          <p className="page-sub">
            Part de ton patrimoine au {fmtDate(last.date)} ({eur(last.net, false)}). Chaque mois : tes placements rapportent leur rendement, et ton épargne s’ajoute.
          </p>
        </div>
        <Seg<'nominal' | 'reel'>
          value={real ? 'reel' : 'nominal'}
          onChange={(v) => setPrefs({ real: v === 'reel' })}
          options={[
            { value: 'nominal', label: 'Euros courants' },
            { value: 'reel', label: 'Euros d’aujourd’hui' },
          ]}
        />
      </div>

      <div className="card">
        <div className="row wrap" style={{ gap: 18, alignItems: 'flex-end' }}>
          <div className="field" style={{ minWidth: 220 }}>
            <label htmlFor="pj-monthly">
              Épargne par mois : <strong>{eur(monthly, false)}</strong>
            </label>
            <input id="pj-monthly" type="range" min={0} max={5000} step={50} value={monthly} onChange={(e) => setPrefs({ monthly: Number(e.target.value) })} />
            <span className="field-hint">
              Estimée sur 12 mois : {eur(estimatedSavings, false)}
              {prefs.monthly !== undefined && (
                <button type="button" className="btn btn-sm btn-ghost" style={{ height: 20, padding: '0 6px', marginLeft: 4 }} onClick={() => setPrefs({ monthly: undefined })}>
                  revenir
                </button>
              )}
            </span>
          </div>
          <div className="field" style={{ minWidth: 200 }}>
            <label htmlFor="pj-years">
              Horizon : <strong>{years} ans</strong>
            </label>
            <input id="pj-years" type="range" min={1} max={30} step={1} value={years} onChange={(e) => setPrefs({ years: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label htmlFor="pj-split">Où va ton épargne</label>
            <select id="pj-split" value={splitMode} onChange={(e) => setPrefs({ split: e.target.value as SplitMode })}>
              <option value="historique">Comme sur les 12 derniers mois</option>
              <option value="liquidites">Sur les comptes courants</option>
              <option value="epargne">Sur les livrets</option>
              <option value="investissements">Investie</option>
            </select>
          </div>
          {real && numberInput(inflation, (v) => setPrefs({ inflation: v }), 0.5, 'Inflation', '%/an', 60)}
        </div>
        <div className="row wrap" style={{ gap: 14, marginTop: 14 }}>
          <span className="small muted">Rendement annuel attendu :</span>
          {CLASS_IDS.filter((c) => start[c] > 0 || split[c] > 0).map((c) => (
            <span key={c}>{numberInput(returns[c], (v) => setPrefs({ returns: { ...(prefs.returns ?? {}), [c]: v } }), 0.5, LABELS[c], '%', 64)}</span>
          ))}
        </div>
        {splitMode === 'historique' && histTotal > 0 && (
          <div className="muted small" style={{ marginTop: 8 }}>
            Sur 12 mois, ton épargne est allée :{' '}
            {CLASS_IDS.filter((c) => split[c] > 0.01)
              .map((c) => `${LABELS[c].toLowerCase()} ${Math.round(split[c] * 100)} %`)
              .join(' · ')}
            .
          </div>
        )}
      </div>

      <div className="grid cols-4 section">
        <Stat label="Dans 1 an" value={eur(at(1).net, false)} sub={`scénario central${real ? ', euros d’aujourd’hui' : ''}`} />
        <Stat label="Dans 5 ans" value={eur(at(Math.min(5, years)).net, false)} sub={years < 5 ? `(horizon ${years} ans)` : 'scénario central'} />
        <Stat
          label={`Dans ${years} ans`}
          value={eur(end.net, false)}
          sub={`entre ${eur(runs.prudent[runs.prudent.length - 1].net, false)} et ${eur(runs.favorable[runs.favorable.length - 1].net, false)}`}
        />
        <Stat
          label={`D’ici ${years} ans`}
          value={real ? eur(end.contributed, false) : eurSigned(gains, false)}
          sub={real ? 'd’épargne versée (euros courants)' : `de rendement, en plus de ${eur(end.contributed, false)} d’épargne versée`}
        />
      </div>

      <div className="card section">
        <div className="card-head">
          <div>
            <div className="card-title">Ton patrimoine, passé et à venir</div>
            <div className="card-sub">
              Prudent : investissements −4 pts, crypto −15 pts · Favorable : investissements +3 pts, crypto +10 pts.
              {linear !== null && ` Pour comparaison, au rythme linéaire des 12 derniers mois (${eurSigned(linear, false)}/mois) : ${eur(last.net + linear * 12 * years, false)} dans ${years} ans.`}
            </div>
          </div>
        </div>
        <ProjectionScenarioChart rows={rows} />
      </div>

      <div className="grid cols-2 section">
        <div className="card flush">
          <div style={{ padding: '16px 18px 4px' }}>
            <div className="card-title">Prochains paliers</div>
            <div className="card-sub">Date à laquelle chaque montant serait atteint{real ? ' (en euros d’aujourd’hui)' : ''}</div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Palier</th>
                  <th className="num">Prudent</th>
                  <th className="num">Central</th>
                  <th className="num">Favorable</th>
                </tr>
              </thead>
              <tbody>
                {milestones.map((m) => (
                  <tr key={m}>
                    <td style={{ fontWeight: 550 }}>{eur(m, false)}</td>
                    {(['prudent', 'central', 'favorable'] as const).map((k) => {
                      const d = reachDate(runs[k], m);
                      return (
                        <td key={k} className={`num ${k === 'central' ? '' : 'muted'}`} style={k === 'central' ? { fontWeight: 600 } : undefined}>
                          {d ? fmtDate(d, true).replace(/^\d+ /, '') : `> ${years} ans`}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card flush">
          <div style={{ padding: '16px 18px 4px' }}>
            <div className="card-title">Et si…</div>
            <div className="card-sub">Écart avec le scénario central dans {years} ans</div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {whatIf.map((w) => (
                  <tr key={w.label}>
                    <td>
                      {w.label}
                      {w.date && nextMilestone && (
                        <div className="muted small">
                          {eur(nextMilestone, false)} atteints en {fmtDate(w.date).replace(/^\d+ /, '')}
                        </div>
                      )}
                    </td>
                    <td className={`num ${w.delta >= 0 ? 'good' : 'bad'}`} style={{ fontWeight: 600 }}>
                      {eurSigned(w.delta, false)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <p className="muted small section">
        Simulation indicative : rendements constants, dettes constantes, sans impôts ni frais. Les marchés ne montent pas en ligne droite : la plus forte baisse de ton historique (onglet Analyses) donne un ordre
        d’idée des à-coups. Ce n’est pas un conseil en investissement.
      </p>
    </>
  );
}
