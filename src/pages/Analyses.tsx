import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { go } from '../App';
import { Empty, KeyRows, Note, Seg } from '../components/ui';
import { AllocationChart, NetWorthChart, RealChart, SimpleLine, SourcesChart } from '../components/charts';
import { eur, eurSigned, fmtDate, monthShort, pct, pctSigned } from '../lib/format';
import { ASSET_GROUPS } from '../lib/networth';
import { slotColor } from '../lib/theme';
import { changeOver, maxDrawdown, type Point } from '../lib/analytics';
import { byYear, cashDrag, decompose, impliedShares, priceAt, realSeries, referenceLabel, referenceOf, savingsVsInflation, sumPeriods } from '../lib/market';
import { useMarket } from '../lib/useMarket';

type View = 'evolution' | 'placements' | 'epargne';

let lastView: View = 'evolution'; // garde l'onglet choisi en revenant sur la page

export default function Analyses() {
  const { data } = useStore();
  const [view, setViewState] = useState<View>(lastView);
  const setView = (v: View) => {
    lastView = v;
    setViewState(v);
  };
  const { series, market, error, loading } = useMarket(data.accounts);
  const periods = useMemo(() => decompose(data.accounts, series, market), [data.accounts, series, market]);

  if (series.length < 3) {
    return (
      <div className="card">
        <Empty title="Pas encore assez d’historique" text="Les analyses se basent sur tes relevés successifs.">
          <button className="btn btn-primary" onClick={() => go('reglages')}>
            Synchroniser ma feuille
          </button>
        </Empty>
      </div>
    );
  }

  return (
    <>
      <div className="seg-full">
        <Seg<View>
          value={view}
          onChange={setView}
          options={[
            { value: 'evolution', label: 'Évolution' },
            { value: 'placements', label: 'Placements' },
            { value: 'epargne', label: 'Épargne' },
          ]}
        />
      </div>
      {(loading || error) && <p className={`small ${error ? 'bad' : 'muted'}`}>{error || 'Chargement des cours…'}</p>}
      {view === 'evolution' && <Evolution series={series} periods={periods} market={market} />}
      {view === 'placements' && <Placements series={series} periods={periods} market={market} />}
      {view === 'epargne' && <Epargne series={series} market={market} />}
    </>
  );
}

type Periods = ReturnType<typeof decompose>;
type Market = ReturnType<typeof useMarket>['market'];

function Evolution({ series, periods, market }: { series: Point[]; periods: Periods; market: Market }) {
  const { chart } = useStore();
  const [byStatement, setByStatement] = useState(false);
  const last = series[series.length - 1];
  const first = series[0];
  const c12 = changeOver(series, 12);
  const s12 = sumPeriods(periods, c12?.from.date ?? first.date);
  const sAll = sumPeriods(periods, '0000');
  const totalGrowth = sAll.savings + sAll.market + sAll.interest;

  const sourceRows = byStatement
    ? periods.map((p) => ({ x: p.date, savings: p.savings, market: p.market, interest: p.interest }))
    : byYear(periods).map((y) => ({ ...y, x: y.year }));
  const real = market?.inflation.length ? realSeries(series, market.inflation) : null;
  const realGrowth = real ? real[real.length - 1].real / real[0].real - 1 : null;

  const groups = ASSET_GROUPS.filter((g) => series.some((p) => (p.groups[g.id] ?? 0) > 0)).map((g) => ({ id: g.id, label: g.label, color: slotColor(chart, g.slot) }));
  const allocRows = series.map((p) => ({ date: p.date, ...Object.fromEntries(groups.map((g) => [g.id, Math.max(0, p.groups[g.id] ?? 0)])) }));

  const netDD = maxDrawdown(series.map((p) => ({ date: p.date, value: p.net })));
  const riskyDD = maxDrawdown(series.map((p) => ({ date: p.date, value: (p.groups.investissements ?? 0) + (p.groups.crypto ?? 0) })));
  const ddSub = (dd: NonNullable<typeof netDD>) => `${fmtDate(dd.peakDate)} → ${fmtDate(dd.troughDate)} · ${dd.recovered ? 'rattrapée' : 'pas encore rattrapée'}`;

  return (
    <>
      <div className="card section">
        <div className="card-head">
          <div className="card-title">12 derniers mois</div>
        </div>
        <KeyRows
          rows={[
            {
              label: 'Variation',
              sub: c12 ? `depuis ${fmtDate(c12.from.date)}` : undefined,
              value: c12 ? eurSigned(c12.amount, false) : '—',
              valueSub: c12 ? pctSigned(c12.ratio) : undefined,
              tone: c12 ? (c12.amount >= 0 ? 'good' : 'bad') : '',
            },
            { label: 'Épargne nouvelle', value: market ? eur(s12.savings, false) : '…', valueSub: market && s12.months ? `${eur(s12.savings / s12.months, false)}/mois` : undefined },
            { label: 'Effet des marchés', value: market ? eurSigned(s12.market, false) : '…', tone: market ? (s12.market >= 0 ? 'good' : 'bad') : '' },
            { label: 'Intérêts', value: market ? eurSigned(s12.interest, false) : '…' },
          ]}
        />
      </div>

      <div className="card section">
        <div className="card-head">
          <div>
            <div className="card-title">D’où vient ta progression</div>
            {market && totalGrowth > 0 && <div className="card-sub">L’épargne fait {pct(sAll.savings / totalGrowth, 0)} de ta progression depuis {fmtDate(first.date)}</div>}
          </div>
        </div>
        {market && <SourcesChart rows={sourceRows} xKey="x" xFormat={byStatement ? (d) => `${monthShort(d.slice(0, 7))} ${d.slice(2, 4)}` : (y) => y} />}
        <div style={{ marginTop: 12 }}>
          <Seg<'annee' | 'releve'>
            value={byStatement ? 'releve' : 'annee'}
            onChange={(v) => setByStatement(v === 'releve')}
            options={[
              { value: 'annee', label: 'Par année' },
              { value: 'releve', label: 'Par relevé' },
            ]}
          />
        </div>
      </div>

      <div className="card section">
        <div className="card-head">
          <div>
            <div className="card-title">Corrigé de l’inflation</div>
            {realGrowth !== null && <div className="card-sub">Progression réelle {pctSigned(realGrowth)} depuis {fmtDate(first.date)}</div>}
          </div>
        </div>
        {real ? <RealChart rows={real} /> : <NetWorthChart series={series.map((p) => ({ date: p.date, value: p.net }))} />}
      </div>

      <div className="card section">
        <div className="card-head">
          <div className="card-title">Répartition dans le temps</div>
        </div>
        <AllocationChart rows={allocRows} groups={groups} height={220} />
      </div>

      <div className="card section">
        <div className="card-head">
          <div className="card-title">Plus fortes baisses</div>
        </div>
        <KeyRows
          rows={[
            { label: 'Patrimoine net', sub: netDD ? ddSub(netDD) : undefined, value: netDD ? `−${pct(netDD.ratio)}` : 'Aucune' },
            { label: 'Investissements + crypto', sub: riskyDD ? ddSub(riskyDD) : undefined, value: riskyDD ? `−${pct(riskyDD.ratio)}` : 'Aucune' },
          ]}
        />
      </div>

      <Note>
        <p>
          Pour les comptes liés à une référence de marché (Amazon, MSCI World, Bitcoin), la part due au cours est calculée, le reste est de l’argent ajouté ou retiré. Les intérêts des livrets sont repérés à
          leur versement annuel. Tout le reste compte comme épargne, y compris les actions reçues de ton employeur.
        </p>
        <p>Corrigé de l’inflation : indice des prix harmonisé France (Eurostat), en euros d’aujourd’hui.</p>
      </Note>
    </>
  );
}

function Placements({ series, periods, market }: { series: Point[]; periods: Periods; market: Market }) {
  const { data } = useStore();
  const last = series[series.length - 1];
  const c12 = changeOver(series, 12);
  const ref12 = c12?.from.date ?? series[0].date;

  const tracked = data.accounts
    .filter((a) => !a.archived && referenceOf(a))
    .map((a) => {
      const ref = referenceOf(a)!;
      const pts = market?.prices[ref.ticker]?.points;
      const p0 = c12 ? priceAt(pts, c12.from.date) : null;
      const p1 = priceAt(pts, last.date);
      const acc12 = periods
        .filter((p) => p.date > ref12)
        .reduce(
          (s, p) => {
            const b = p.byAccount[a.id];
            return b ? { savings: s.savings + b.savings, market: s.market + b.market } : s;
          },
          { savings: 0, market: 0 },
        );
      return { a, ref, refPerf12: p0 && p1 ? p1 / p0 - 1 : null, ...acc12 };
    });

  const single = data.accounts
    .filter((a) => !a.archived && referenceOf(a)?.exact)
    .map((a) => ({ a, rows: impliedShares(a, series, market) }))
    .filter((x) => x.rows && x.rows.length > 1);

  if (!market) return <p className="muted small section">Chargement des cours…</p>;
  if (!tracked.length) return <p className="muted small section">Aucun compte lié à une référence de marché. Choisis-en une dans la fiche d’un compte (Patrimoine).</p>;

  return (
    <>
      <div className="card flush section">
        <div style={{ padding: '16px 16px 4px' }}>
          <div className="card-title">Face au marché, sur 12 mois</div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Compte</th>
                <th className="num">Indice</th>
                <th className="num">Marché</th>
                <th className="num">Apports</th>
              </tr>
            </thead>
            <tbody>
              {tracked.map((t) => (
                <tr key={t.a.id}>
                  <td style={{ fontWeight: 500 }}>{t.a.name}</td>
                  <td className={`num ${t.refPerf12 === null ? '' : t.refPerf12 >= 0 ? 'good' : 'bad'}`}>{t.refPerf12 === null ? '—' : pctSigned(t.refPerf12)}</td>
                  <td className={`num ${t.market >= 0 ? 'good' : 'bad'}`}>{eurSigned(t.market, false)}</td>
                  <td className="num">{eurSigned(t.savings, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {Object.keys(market.errors).length > 0 && <div className="muted small" style={{ padding: '8px 16px' }}>Cours indisponibles : {Object.keys(market.errors).join(', ')}</div>}
      </div>

      {single.map(({ a, rows }) => {
        const r = rows!;
        const now = r[r.length - 1];
        const old = c12 ? r.reduce((best, x) => (Math.abs(Date.parse(x.date) - Date.parse(c12.from.date)) < Math.abs(Date.parse(best.date) - Date.parse(c12.from.date)) ? x : best), r[0]) : r[0];
        const own = periods
          .filter((p) => p.date > ref12)
          .map((p) => p.byAccount[a.id])
          .filter(Boolean);
        const priceEffect = own.reduce((s, b) => s + b.market, 0);
        const sharesEffect = own.reduce((s, b) => s + b.savings, 0);
        const dShares = now.shares - old.shares;
        return (
          <div className="card section" key={a.id}>
            <div className="card-head">
              <div>
                <div className="card-title">{a.name}</div>
                <div className="card-sub">
                  ≈ {now.shares.toFixed(0)} actions à {eur(now.price)}
                </div>
              </div>
            </div>
            <KeyRows
              rows={[
                { label: 'Effet du cours', sub: '12 derniers mois', value: eurSigned(priceEffect, false), tone: priceEffect >= 0 ? 'good' : 'bad' },
                { label: 'Actions reçues ou vendues', sub: `${dShares >= 0 ? '+' : ''}${dShares.toFixed(0)} actions`, value: eurSigned(sharesEffect, false) },
              ]}
            />
            <div className="field-label" style={{ margin: '16px 0 4px' }}>
              Nombre d’actions
            </div>
            <SimpleLine rows={r.map((x) => ({ date: x.date, value: x.shares }))} valueFormat={(v) => v.toFixed(0)} />
            <div className="field-label" style={{ margin: '16px 0 4px' }}>
              Cours en euros
            </div>
            <SimpleLine rows={r.map((x) => ({ date: x.date, value: x.price }))} valueFormat={(v) => eur(v, false)} />
          </div>
        );
      })}

      <Note>
        <p>Indice : évolution de la référence de marché du compte sur 12 mois. Marché : ce que cette évolution a fait gagner ou perdre au compte. Apports : le reste de la variation, argent ajouté ou retiré.</p>
        <p>Pour un compte suivi par un indice (MSCI World, Bitcoin), c’est une estimation : le compte ne contient pas exactement l’indice. Le nombre d’actions est estimé par valeur ÷ cours.</p>
      </Note>
    </>
  );
}

function Epargne({ series, market }: { series: Point[]; market: Market }) {
  const { data } = useStore();
  const first = series[0];
  const last = series[series.length - 1];
  const drag = cashDrag(data.accounts, series);
  const inflationRows = market?.inflation.length ? savingsVsInflation(market.inflation, Number(first.date.slice(0, 4)), last.date) : [];

  return (
    <>
      <div className="card section">
        <div className="card-head">
          <div className="card-title">Argent qui dort</div>
        </div>
        <KeyRows
          rows={[
            { label: 'Sur comptes courants', value: eur(drag.cashNow, false) },
            { label: `Au-delà d’un coussin de ${eur(drag.buffer, false)}`, value: eur(drag.excessNow, false) },
            { label: 'Au Livret A, ça rapporterait', sub: `taux actuel ${String(drag.rateNow).replace('.', ',')} %`, value: `${eur(drag.perYearNow, false)}/an`, tone: 'warn' },
            { label: 'Manque à gagner', sub: `depuis ${fmtDate(first.date)}`, value: eur(drag.total, false), valueSub: `dont ${eur(drag.last12, false)} sur 12 mois` },
          ]}
        />
        <p className="muted small" style={{ margin: '12px 0 0' }}>
          Moins si une partie est déjà rémunérée (coffre Revolut…)
        </p>
      </div>

      <div className="card flush section">
        <div style={{ padding: '16px 16px 4px' }}>
          <div className="card-title">Livret A face à l’inflation</div>
        </div>
        {inflationRows.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Année</th>
                  <th className="num">Inflation</th>
                  <th className="num">Livret A</th>
                  <th className="num">Réel</th>
                </tr>
              </thead>
              <tbody>
                {inflationRows.map((r) => (
                  <tr key={r.year}>
                    <td>{r.partial ? `${r.year} (12 mois)` : r.year}</td>
                    <td className="num">{pct(r.inflation / 100)}</td>
                    <td className="num">{pct(r.livretA / 100, 2)}</td>
                    <td className={`num ${r.real >= 0 ? 'good' : 'bad'}`}>{pctSigned(r.real / 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="muted small" style={{ padding: 16 }}>
            Inflation indisponible
          </div>
        )}
      </div>

      <Note>
        <p>Argent qui dort : solde des comptes courants au-delà du coussin, comparé à ce qu’il aurait rapporté au taux du Livret A de chaque période.</p>
        <p>Rendement réel = taux du Livret A − inflation (indice des prix harmonisé France, Eurostat). L’année en cours est calculée sur les 12 derniers mois.</p>
      </Note>
    </>
  );
}
