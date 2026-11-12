import { useMemo, useState } from 'react';
import { ArrowRight, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { useStore } from '../store';
import { go } from '../App';
import { Delta, Seg, SegmentedBar } from '../components/ui';
import { NetWorthChart } from '../components/charts';
import { addMonths, eur, eurSigned, fmtDate } from '../lib/format';
import { ASSET_GROUPS, totals } from '../lib/networth';
import { slotColor } from '../lib/theme';
import { changeOver, findings } from '../lib/analytics';
import { cashDrag, decompose, livretRate, sumPeriods } from '../lib/market';
import { useMarket } from '../lib/useMarket';
import { diversification } from '../lib/diversification';
import { buildReport } from '../lib/report';
import { ScoreRing } from '../components/ui';

type Range = '1a' | '3a' | 'tout';

export default function Dashboard() {
  const { data, chart } = useStore();
  const [range, setRange] = useState<Range>('tout');
  const { series, market } = useMarket(data.accounts);
  const periods = useMemo(() => decompose(data.accounts, series, market), [data.accounts, series, market]);

  if (!data.accounts.length) return <Onboarding />;

  const t = totals(data.accounts);
  const last = series[series.length - 1];
  const changeKey = range === '1a' ? 12 : range === '3a' ? 36 : 'all';
  const ch = changeOver(series, changeKey);
  const from = range === 'tout' ? '0000' : addMonths(last.date, range === '1a' ? -12 : -36);
  const shown = series.filter((p) => p.date >= from).map((p) => ({ date: p.date, value: p.net }));
  const c12 = changeOver(series, 12);
  const s12 = sumPeriods(periods, c12?.from.date ?? series[0].date);
  const drag = cashDrag(data.accounts, series);
  const notes = findings(data.accounts, series, livretRate(last.date)).filter((n) => n.id !== 'idle-cash');
  const parts = ASSET_GROUPS.map((g) => ({ id: g.id, label: g.label, value: t.byGroup[g.id] ?? 0, color: slotColor(chart, g.slot) }));
  const div = diversification(data.accounts);
  const report = buildReport(series.length - 1, series, periods, data.accounts);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Tableau de bord</h1>
          <p className="page-sub">Dernier relevé de ta feuille : {fmtDate(last.date)}</p>
        </div>
      </div>

      <div className="grid cols-3">
        <div className="card span-2">
          <div className="row between wrap" style={{ alignItems: 'flex-start' }}>
            <div>
              <div className="hero-label">Patrimoine net</div>
              <div className="hero-value">{eur(t.net, false)}</div>
              <div style={{ marginTop: 8 }}>
                {ch && <Delta value={ch.amount} ratio={ch.ratio} suffix={range === 'tout' ? `depuis le ${fmtDate(ch.from.date)}` : `depuis le ${fmtDate(ch.from.date)}`} />}
              </div>
            </div>
            <Seg<Range>
              value={range}
              onChange={setRange}
              options={[
                { value: '1a', label: '1A' },
                { value: '3a', label: '3A' },
                { value: 'tout', label: 'Tout' },
              ]}
            />
          </div>
          <div style={{ marginTop: 16 }}>
            <NetWorthChart series={shown} />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Répartition</div>
              <div className="card-sub">
                {eur(t.assets, false)} d’actifs{t.debts > 0 && <> · {eur(t.debts, false)} de dettes</>}
              </div>
            </div>
            <button className="icon-btn" onClick={() => go('patrimoine')} aria-label="Voir le patrimoine">
              <ArrowRight size={16} />
            </button>
          </div>
          <SegmentedBar parts={parts} />
        </div>
      </div>

      <div className="grid cols-3 section">
        <div className="card">
          <div className="stat-label">Épargne estimée par mois (12 mois)</div>
          <div className="stat-value" style={{ marginTop: 6 }}>
            {market && s12.months ? eur(s12.savings / s12.months, false) : '…'}
          </div>
          <div className="stat-sub" style={{ marginTop: 4 }}>
            {market ? `${eur(s12.savings, false)} d’argent nouveau, hors effet des marchés` : 'chargement des cours…'}
          </div>
        </div>
        <div className="card">
          <div className="stat-label">Marchés et intérêts (12 mois)</div>
          <div className={`stat-value ${s12.market + s12.interest >= 0 ? 'good' : 'bad'}`} style={{ marginTop: 6 }}>
            {market ? eurSigned(s12.market + s12.interest, false) : '…'}
          </div>
          <div className="stat-sub" style={{ marginTop: 4 }}>
            {market ? `marchés ${eurSigned(s12.market, false)} · intérêts ${eurSigned(s12.interest, false)}` : ''}
          </div>
        </div>
        <div className="card">
          <div className="stat-label">Argent qui dort</div>
          <div className="stat-value warn" style={{ marginTop: 6 }}>
            {eur(drag.excessNow, false)}
          </div>
          <div className="stat-sub" style={{ marginTop: 4 }}>
            sur comptes courants au-delà de {eur(drag.buffer, false)} : ~{eur(drag.perYearNow, false)}/an au Livret A ({String(drag.rateNow).replace('.', ',')} %)
          </div>
        </div>
      </div>

      <div className="grid cols-2 section">
        <div className="card">
          <div className="card-head">
            <div className="card-title">Dernier rapport</div>
            <button className="icon-btn" onClick={() => go('rapports')} aria-label="Voir les rapports">
              <ArrowRight size={16} />
            </button>
          </div>
          <p className="text-2 small" style={{ margin: 0, lineHeight: 1.6 }}>
            {report ? report.summary : 'Il faut au moins deux relevés.'}
          </p>
        </div>
        <div className="card">
          <div className="card-head">
            <div className="card-title">Diversification</div>
            <button className="icon-btn" onClick={() => go('diversification')} aria-label="Voir la diversification">
              <ArrowRight size={16} />
            </button>
          </div>
          <div className="row" style={{ gap: 14 }}>
            <ScoreRing score={div.global} />
            <div className="small" style={{ display: 'grid', gap: 3 }}>
              {div.dimensions.map((d) => (
                <span key={d.id}>
                  <span className="muted">{d.title} :</span> {d.label} ({d.score}/10)
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {notes.length > 0 && (
        <div className="card section">
          <div className="card-head">
            <div className="card-title">Points d’attention</div>
            <button className="btn btn-sm" onClick={() => go('analyses')}>
              Toutes les analyses <ArrowRight size={14} />
            </button>
          </div>
          {notes.slice(0, 4).map((n) => {
            const Icon = n.tone === 'good' ? CircleCheck : n.tone === 'info' ? Info : TriangleAlert;
            return (
              <div className="list-row" key={n.id} style={{ alignItems: 'flex-start' }}>
                <Icon size={16} className={n.tone === 'alert' ? 'bad' : n.tone === 'good' ? 'good' : n.tone === 'warn' ? 'warn' : 'muted'} style={{ marginTop: 2, flex: 'none' }} />
                <div className="grow">
                  <div style={{ fontWeight: 550 }}>{n.title}</div>
                  <div className="muted small">{n.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </>
  );
}

function Onboarding() {
  const { sync, syncing, notify } = useStore();
  return (
    <div className="card" style={{ padding: 32 }}>
      <h1 className="page-title">Bienvenue sur Pécule</h1>
      <p className="page-sub" style={{ maxWidth: '62ch' }}>
        Ton patrimoine vient de ton tableau de suivi Google Sheets : chaque colonne devient un compte, chaque ligne datée un relevé. Pécule le croise ensuite avec les cours de marché, l’inflation et le Livret A
        pour l’analyser.
      </p>
      <div className="row wrap" style={{ marginTop: 20 }}>
        <button
          className="btn btn-primary"
          disabled={syncing}
          onClick={() =>
            sync()
              .then(notify)
              .catch((e) => notify(`Feuille Google : ${(e as Error).message}`))
          }
        >
          {syncing ? 'Synchronisation…' : 'Synchroniser ma feuille'}
        </button>
      </div>
    </div>
  );
}
