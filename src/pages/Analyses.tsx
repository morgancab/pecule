import { useMemo, useState } from 'react';
import { CircleCheck, Info, TriangleAlert, TrendingUp } from 'lucide-react';
import { useStore } from '../store';
import { go } from '../App';
import { Empty, Seg, Stat } from '../components/ui';
import { AllocationChart, NetWorthChart, RealChart, SimpleLine, SourcesChart } from '../components/charts';
import { addMonths, eur, eurSigned, fmtDate, monthShort, pct, pctSigned } from '../lib/format';
import { ASSET_GROUPS, ACCOUNT_TYPES } from '../lib/networth';
import { slotColor } from '../lib/theme';
import { avgMonthly, cagr, changeOver, findings, maxDrawdown, pointNear, project, type Finding } from '../lib/analytics';
import { byYear, cashDrag, decompose, impliedShares, livretRate, priceAt, realSeries, referenceLabel, referenceOf, savingsVsInflation, sumPeriods } from '../lib/market';
import { useMarket } from '../lib/useMarket';

type Range = '12' | '36' | 'all';

export default function Analyses() {
  const { data, chart } = useStore();
  const [range, setRange] = useState<Range>('all');
  const [view, setView] = useState<'releve' | 'annee'>('annee');
  const { series, market, error, loading } = useMarket(data.accounts);
  const periods = useMemo(() => decompose(data.accounts, series, market), [data.accounts, series, market]);

  if (series.length < 3) {
    return (
      <>
        <div className="page-header">
          <div>
            <h1 className="page-title">Analyses</h1>
          </div>
        </div>
        <div className="card">
          <Empty title="Pas encore assez d’historique" text="Synchronise ta feuille Google (Réglages) : les analyses se basent sur tes relevés successifs.">
            <button className="btn btn-primary" onClick={() => go('reglages')}>
              Synchroniser ma feuille
            </button>
          </Empty>
        </div>
      </>
    );
  }

  const last = series[series.length - 1];
  const first = series[0];
  const prev = series[series.length - 2];
  const c12 = changeOver(series, 12);
  const growth = cagr(series);
  const avg12 = avgMonthly(c12);
  const ref12 = c12?.from.date ?? first.date;
  const s12 = sumPeriods(periods, ref12);
  const sAll = sumPeriods(periods, '0000');
  const savingsPerMonth = s12.months ? s12.savings / s12.months : null;
  const totalGrowth = sAll.savings + sAll.market + sAll.interest;

  const from = range === 'all' ? '0000' : addMonths(last.date, -Number(range));
  const shown = series.filter((p) => p.date >= from);
  const shownPeriods = periods.filter((p) => p.date > from);
  const sourceRows =
    view === 'annee'
      ? byYear(shownPeriods).map((y) => ({ ...y, x: y.year }))
      : shownPeriods.map((p) => ({ x: p.date, savings: p.savings, market: p.market, interest: p.interest }));

  const real = market?.inflation.length ? realSeries(shown, market.inflation) : null;
  const realAll = market?.inflation.length ? realSeries(series, market.inflation) : null;
  const realGrowth = realAll ? realAll[realAll.length - 1].real / realAll[0].real - 1 : null;

  const groups = ASSET_GROUPS.filter((g) => series.some((p) => (p.groups[g.id] ?? 0) > 0)).map((g) => ({ id: g.id, label: g.label, color: slotColor(chart, g.slot) }));
  const allocRows = shown.map((p) => ({ date: p.date, ...Object.fromEntries(groups.map((g) => [g.id, Math.max(0, p.groups[g.id] ?? 0)])) }));
  const assets = Object.entries(last.groups).filter(([g]) => g !== 'dette').reduce((s, [, v]) => s + Math.max(0, v), 0);

  // placements suivis par une référence de marché
  const tracked = data.accounts
    .filter((a) => !a.archived && referenceOf(a))
    .map((a) => {
      const ref = referenceOf(a)!;
      const pts = market?.prices[ref.ticker]?.points;
      const p0 = c12 ? priceAt(pts, c12.from.date) : null;
      const p1 = priceAt(pts, last.date);
      const acc12 = periods.filter((p) => p.date > ref12).reduce(
        (s, p) => {
          const b = p.byAccount[a.id];
          return b ? { savings: s.savings + b.savings, market: s.market + b.market } : s;
        },
        { savings: 0, market: 0 },
      );
      return { a, ref, value: last.accounts[a.id] ?? 0, refPerf12: p0 && p1 ? p1 / p0 - 1 : null, ...acc12 };
    });

  const single = data.accounts.filter((a) => !a.archived && referenceOf(a)?.exact).map((a) => ({ a, rows: impliedShares(a, series, market) })).filter((x) => x.rows && x.rows.length > 1);

  const inflationRows = market?.inflation.length ? savingsVsInflation(market.inflation, Number(first.date.slice(0, 4)), last.date) : [];
  const drag = cashDrag(data.accounts, series);
  const proj = project(series, avg12);
  const netDD = maxDrawdown(series.map((p) => ({ date: p.date, value: p.net })));
  const riskyDD = maxDrawdown(series.map((p) => ({ date: p.date, value: (p.groups.investissements ?? 0) + (p.groups.crypto ?? 0) })));
  // l'argent qui dort a sa propre carte, chiffrée avec le Livret A
  const notes = findings(data.accounts, series, livretRate(last.date)).filter((n) => n.id !== 'idle-cash');

  const p3 = pointNear(series, addMonths(last.date, -3));
  const p12 = c12?.from ?? null;
  const accountsRows = data.accounts
    .filter((a) => (last.accounts[a.id] ?? 0) !== 0 || (p12?.accounts[a.id] ?? 0) !== 0)
    .map((a) => {
      const v = last.accounts[a.id] ?? 0;
      return { a, v, d3: p3 ? v - (p3.accounts[a.id] ?? 0) : null, d12: p12 ? v - (p12.accounts[a.id] ?? 0) : null };
    })
    .sort((x, y) => y.v - x.v);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Analyses</h1>
          <p className="page-sub">
            {series.length} relevés de ta feuille, du {fmtDate(first.date)} au {fmtDate(last.date)}, croisés avec les cours de marché, l’inflation (Eurostat) et le taux du Livret A.
            {loading && ' Chargement des données de marché…'}
            {error && <span className="bad"> {error}</span>}
          </p>
        </div>
        <Seg<Range>
          value={range}
          onChange={setRange}
          options={[
            { value: '12', label: '12 mois' },
            { value: '36', label: '3 ans' },
            { value: 'all', label: 'Tout' },
          ]}
        />
      </div>

      <div className="grid cols-4">
        <Stat
          label="Patrimoine net"
          value={eur(last.net, false)}
          sub={
            <span className={last.net >= prev.net ? 'good' : 'bad'}>
              {eurSigned(last.net - prev.net, false)} ({pctSigned(prev.net ? (last.net - prev.net) / prev.net : 0)}) depuis le {fmtDate(prev.date, false)}
            </span>
          }
        />
        <Stat
          label="Sur 12 mois"
          value={c12 ? <span className={c12.amount >= 0 ? 'good' : 'bad'}>{eurSigned(c12.amount, false)}</span> : '—'}
          sub={c12 ? `${pctSigned(c12.ratio)} · ${avg12 !== null ? `${eurSigned(avg12, false)}/mois · ` : ''}depuis le ${fmtDate(c12.from.date)}` : undefined}
        />
        <Stat
          label="Épargne estimée par mois"
          value={market && savingsPerMonth !== null ? eur(savingsPerMonth, false) : '…'}
          sub={market ? `${eur(s12.savings, false)} d’argent nouveau sur 12 mois` : 'en attente des cours'}
        />
        <Stat
          label="Marchés et intérêts (12 mois)"
          value={market ? <span className={s12.market + s12.interest >= 0 ? 'good' : 'bad'}>{eurSigned(s12.market + s12.interest, false)}</span> : '…'}
          sub={market ? `marchés ${eurSigned(s12.market, false)} · intérêts ${eurSigned(s12.interest, false)}` : undefined}
        />
      </div>

      <div className="card section">
        <div className="card-head">
          <div>
            <div className="card-title">D’où vient ta progression</div>
            <div className="card-sub">
              {market
                ? `Depuis ${fmtDate(first.date)} : ${eurSigned(sAll.savings, false)} d’épargne, ${eurSigned(sAll.market, false)} grâce aux marchés, ${eurSigned(sAll.interest, false)} d’intérêts. L’épargne fait ${pct(totalGrowth ? sAll.savings / totalGrowth : 0, 0)} de ta progression.`
                : 'Chargement des cours…'}
            </div>
          </div>
          <Seg<'releve' | 'annee'>
            value={view}
            onChange={setView}
            options={[
              { value: 'annee', label: 'Par année' },
              { value: 'releve', label: 'Par relevé' },
            ]}
          />
        </div>
        {market && <SourcesChart rows={sourceRows} xKey="x" xFormat={view === 'annee' ? (y) => y : (d) => `${monthShort(d.slice(0, 7))} ${d.slice(2, 4)}`} />}
        <p className="field-hint" style={{ marginBottom: 0 }}>
          Estimation : pour les comptes liés à une référence (Amazon, MSCI World, Bitcoin), la part due à l’évolution du cours est calculée, le reste est de l’argent ajouté ou retiré. Les intérêts des livrets
          sont repérés à leur versement annuel. Tout le reste compte comme épargne (y compris les actions reçues de ton employeur).
        </p>
      </div>

      <div className="card section">
        <div className="card-head">
          <div>
            <div className="card-title">Patrimoine net</div>
            <div className="card-sub">
              {growth !== null && `Croissance annuelle moyenne ${pctSigned(growth)} (épargne comprise). `}
              {realGrowth !== null && realAll && `En euros d’aujourd’hui, tes ${eur(first.net, false)} de ${monthShort(first.date.slice(0, 7))} ${first.date.slice(0, 4)} valent ${eur(realAll[0].real, false)} : progression réelle ${pctSigned(realGrowth)}.`}
            </div>
          </div>
        </div>
        {real ? <RealChart rows={real} /> : <NetWorthChart series={shown.map((p) => ({ date: p.date, value: p.net }))} />}
      </div>

      {single.map(({ a, rows }) => {
        const r = rows!;
        const now = r[r.length - 1];
        const ref = referenceOf(a)!;
        const old = c12 ? r.reduce((best, x) => (Math.abs(Date.parse(x.date) - Date.parse(c12.from.date)) < Math.abs(Date.parse(best.date) - Date.parse(c12.from.date)) ? x : best), r[0]) : r[0];
        // même décomposition que le tableau « face au marché » : effet du cours relevé après relevé
        const own = periods.filter((p) => p.date > ref12).map((p) => p.byAccount[a.id]).filter(Boolean);
        const priceEffect = own.reduce((s, b) => s + b.market, 0);
        const sharesEffect = own.reduce((s, b) => s + b.savings, 0);
        return (
          <div className="card section" key={a.id}>
            <div className="card-head">
              <div>
                <div className="card-title">{a.name} : cours ou nouvelles actions ?</div>
                <div className="card-sub">
                  Environ {now.shares.toFixed(0)} actions {referenceLabel(ref.ticker).replace('Action ', '')} à {eur(now.price)} (cours au {fmtDate(now.date)}). Sur 12 mois : {eurSigned(priceEffect, false)} dus au cours,{' '}
                  {eurSigned(sharesEffect, false)} dus aux actions reçues ou vendues ({(now.shares - old.shares >= 0 ? '+' : '') + (now.shares - old.shares).toFixed(0)} actions).
                </div>
              </div>
            </div>
            <div className="grid cols-2">
              <div>
                <div className="field-label" style={{ marginBottom: 6 }}>
                  Nombre d’actions détenues (estimé : valeur ÷ cours)
                </div>
                <SimpleLine rows={r.map((x) => ({ date: x.date, value: x.shares }))} valueFormat={(v) => v.toFixed(0)} />
              </div>
              <div>
                <div className="field-label" style={{ marginBottom: 6 }}>
                  Cours de l’action en euros
                </div>
                <SimpleLine rows={r.map((x) => ({ date: x.date, value: x.price }))} valueFormat={(v) => eur(v, false)} />
              </div>
            </div>
          </div>
        );
      })}

      {tracked.length > 0 && market && (
        <div className="card flush section">
          <div style={{ padding: '16px 18px 4px' }}>
            <div className="card-title">Tes placements face au marché (12 mois)</div>
            <div className="card-sub">Ce que le marché a fait et ce que tu as ajouté. Pour un compte suivi par un indice (MSCI World, Bitcoin), c’est une estimation : le compte ne contient pas exactement l’indice.</div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Compte</th>
                  <th>Référence</th>
                  <th className="num">Référence sur 12 mois</th>
                  <th className="num">Effet marché</th>
                  <th className="num">Apports nets</th>
                  <th className="num">Valeur</th>
                </tr>
              </thead>
              <tbody>
                {tracked.map((t) => (
                  <tr key={t.a.id}>
                    <td style={{ fontWeight: 550 }}>{t.a.name}</td>
                    <td className="muted">
                      {referenceLabel(t.ref.ticker)}
                      {t.ref.exact ? '' : ' (indice)'}
                    </td>
                    <td className={`num ${t.refPerf12 === null ? '' : t.refPerf12 >= 0 ? 'good' : 'bad'}`}>{t.refPerf12 === null ? '—' : pctSigned(t.refPerf12)}</td>
                    <td className={`num ${t.market >= 0 ? 'good' : 'bad'}`}>{eurSigned(t.market, false)}</td>
                    <td className="num">{eurSigned(t.savings, false)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>
                      {eur(t.value, false)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {Object.keys(market.errors).length > 0 && <div className="muted small" style={{ padding: '8px 18px' }}>Cours indisponibles : {Object.keys(market.errors).join(', ')}</div>}
        </div>
      )}

      <div className="grid cols-2 section">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Argent qui dort</div>
              <div className="card-sub">Comptes courants au-delà d’un coussin de {eur(drag.buffer, false)}, comparés au Livret A</div>
            </div>
          </div>
          <div className="grid cols-2" style={{ gap: 12 }}>
            <div className="stat">
              <div className="stat-label">Aujourd’hui sur comptes courants</div>
              <div className="stat-value">{eur(drag.cashNow, false)}</div>
              <div className="stat-sub">dont {eur(drag.excessNow, false)} au-delà du coussin</div>
            </div>
            <div className="stat">
              <div className="stat-label">Ce que ça rapporterait au Livret A</div>
              <div className="stat-value warn">{eur(drag.perYearNow, false)}/an</div>
              <div className="stat-sub">au taux actuel de {String(drag.rateNow).replace('.', ',')} %</div>
            </div>
          </div>
          <p className="text-2" style={{ marginBottom: 0 }}>
            Manque à gagner estimé depuis {fmtDate(first.date)} : <strong>{eur(drag.total, false)}</strong>, dont {eur(drag.last12, false)} sur les 12 derniers mois. Si une partie est déjà rémunérée (coffre
            Revolut…), le manque à gagner réel est plus faible.
          </p>
        </div>
        <div className="card flush">
          <div style={{ padding: '16px 18px 4px' }}>
            <div className="card-title">Livrets face à l’inflation</div>
            <div className="card-sub">Rendement réel du Livret A = taux − inflation (prix à la consommation harmonisés, France)</div>
          </div>
          {inflationRows.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Année</th>
                    <th className="num">Inflation</th>
                    <th className="num">Livret A</th>
                    <th className="num">Rendement réel</th>
                  </tr>
                </thead>
                <tbody>
                  {inflationRows.map((r) => (
                    <tr key={r.year}>
                      <td>{r.partial ? `${r.year} (12 derniers mois)` : r.year}</td>
                      <td className="num">{pct(r.inflation / 100)}</td>
                      <td className="num">{pct(r.livretA / 100, 2)}</td>
                      <td className={`num ${r.real >= 0 ? 'good' : 'bad'}`}>{pctSigned(r.real / 100)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="muted small" style={{ padding: 18 }}>
              {loading ? 'Chargement…' : 'Inflation indisponible.'}
            </div>
          )}
        </div>
      </div>

      <div className="grid cols-2 section">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Répartition dans le temps</div>
              <div className="card-sub">
                Aujourd’hui :{' '}
                {groups
                  .map((g) => `${g.label.toLowerCase()} ${pct(Math.max(0, last.groups[g.id] ?? 0) / assets, 0)}`)
                  .join(' · ')}
              </div>
            </div>
          </div>
          <AllocationChart rows={allocRows} groups={groups} height={220} />
        </div>
        <div className="grid" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-head">
              <div className="card-title row">
                <TrendingUp size={16} className="muted" /> Projection au rythme des 12 derniers mois
              </div>
              <button className="btn btn-sm" onClick={() => go('projection')}>
                Simuler
              </button>
            </div>
            {proj ? (
              <>
                <div className="grid cols-3" style={{ gap: 10 }}>
                  <div className="stat">
                    <div className="stat-label">Dans 1 an</div>
                    <div className="stat-value">{eur(proj.in1y, false)}</div>
                  </div>
                  <div className="stat">
                    <div className="stat-label">Dans 3 ans</div>
                    <div className="stat-value">{eur(proj.in3y, false)}</div>
                  </div>
                  <div className="stat">
                    <div className="stat-label">Dans 5 ans</div>
                    <div className="stat-value">{eur(proj.in5y, false)}</div>
                  </div>
                </div>
                <p className="muted small" style={{ marginBottom: 0 }}>
                  {eurSigned(proj.monthly, false)} par mois.{proj.milestone && ` ${eur(proj.milestone.target, false)} vers ${fmtDate(proj.milestone.date)}.`} Projection linéaire, sans aléas de marché.
                </p>
              </>
            ) : (
              <div className="muted small">Pas assez d’historique.</div>
            )}
          </div>
          <div className="card">
            <div className="card-head">
              <div className="card-title row">
                <TriangleAlert size={16} className="muted" /> Plus fortes baisses
              </div>
            </div>
            <div className="grid cols-2" style={{ gap: 12 }}>
              <div className="stat">
                <div className="stat-label">Patrimoine net</div>
                <div className="stat-value">{netDD ? `−${pct(netDD.ratio)}` : 'Aucune'}</div>
                {netDD && (
                  <div className="stat-sub">
                    {fmtDate(netDD.peakDate)} → {fmtDate(netDD.troughDate)} · {netDD.recovered ? 'rattrapée' : 'pas encore rattrapée'}
                  </div>
                )}
              </div>
              <div className="stat">
                <div className="stat-label">Investissements + crypto</div>
                <div className="stat-value">{riskyDD ? `−${pct(riskyDD.ratio)}` : 'Aucune'}</div>
                {riskyDD && (
                  <div className="stat-sub">
                    {fmtDate(riskyDD.peakDate)} → {fmtDate(riskyDD.troughDate)} · {riskyDD.recovered ? 'rattrapée' : 'pas encore rattrapée'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {notes.length > 0 && (
        <div className="section">
          <div className="section-title">
            Points d’attention <span className="muted">{notes.length}</span>
          </div>
          <div className="card flush">
            {notes.map((n) => (
              <FindingRow key={n.id} f={n} />
            ))}
          </div>
        </div>
      )}

      <div className="card flush section">
        <div style={{ padding: '16px 18px 4px' }}>
          <div className="card-title">Détail par compte</div>
          <div className="card-sub">Variations depuis les relevés d’il y a 3 et 12 mois</div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Compte</th>
                <th className="num">Valeur</th>
                <th className="num">Part</th>
                <th className="num">3 mois</th>
                <th className="num">12 mois</th>
              </tr>
            </thead>
            <tbody>
              {accountsRows.map(({ a, v, d3, d12 }) => (
                <tr key={a.id} style={{ opacity: a.archived ? 0.55 : 1 }}>
                  <td>
                    <div style={{ fontWeight: 550 }}>{a.name}</div>
                    <div className="muted small">
                      {ACCOUNT_TYPES[a.type].label}
                      {a.institution && ` · ${a.institution}`}
                      {referenceOf(a) && ` · suivi : ${referenceLabel(referenceOf(a)!.ticker)}`}
                      {a.archived && ' · clôturé'}
                    </div>
                  </td>
                  <td className="num" style={{ fontWeight: 600 }}>
                    {eur(v, false)}
                  </td>
                  <td className="num muted">{v > 0 && assets ? pct(v / assets, 0) : '—'}</td>
                  <td className={`num ${d3 === null ? '' : d3 >= 0 ? 'good' : 'bad'}`}>{d3 === null ? '—' : eurSigned(d3, false)}</td>
                  <td className={`num ${d12 === null ? '' : d12 >= 0 ? 'good' : 'bad'}`}>{d12 === null ? '—' : eurSigned(d12, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function FindingRow({ f }: { f: Finding }) {
  const Icon = f.tone === 'good' ? CircleCheck : f.tone === 'info' ? Info : TriangleAlert;
  return (
    <div className="insight" style={{ gridTemplateColumns: '34px minmax(0, 1fr)' }}>
      <div className={`insight-icon ${f.tone === 'alert' ? 'alert' : f.tone === 'good' ? 'forte' : ''}`}>
        <Icon size={17} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="insight-title">{f.title}</div>
        <div className="insight-detail">{f.detail}</div>
      </div>
    </div>
  );
}
