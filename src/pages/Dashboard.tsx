import { useMemo, useState } from 'react';
import { ArrowRight, ChartPie, ChevronRight, FileText } from 'lucide-react';
import { useStore } from '../store';
import { go } from '../App';
import { Delta, FindingList, KeyRows, Seg, SegmentedBar } from '../components/ui';
import { NetWorthChart } from '../components/charts';
import { addMonths, eur, eurSigned, fmtDate } from '../lib/format';
import { ASSET_GROUPS, totals } from '../lib/networth';
import { slotColor } from '../lib/theme';
import { changeOver, findings } from '../lib/analytics';
import { cashDrag, decompose, livretRate, sumPeriods } from '../lib/market';
import { useMarket } from '../lib/useMarket';
import { diversification, scoreLabel } from '../lib/diversification';
import { buildReport } from '../lib/report';

type Range = '1a' | '3a' | 'tout';

export default function Dashboard() {
  const { data, chart } = useStore();
  const [range, setRange] = useState<Range>('tout');
  const { series, market } = useMarket(data.accounts);
  const periods = useMemo(() => decompose(data.accounts, series, market), [data.accounts, series, market]);

  if (!data.accounts.length) return <Onboarding />;

  const t = totals(data.accounts);
  const last = series[series.length - 1];
  const ch = changeOver(series, range === '1a' ? 12 : range === '3a' ? 36 : 'all');
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
      <div className="card">
        <div className="hero-label">Patrimoine net · {fmtDate(last.date)}</div>
        <div className="hero-value">{eur(t.net, false)}</div>
        {ch && (
          <div style={{ marginTop: 4 }}>
            <Delta value={ch.amount} ratio={ch.ratio} suffix={`depuis ${fmtDate(ch.from.date)}`} />
          </div>
        )}
        <div style={{ marginTop: 16 }}>
          <NetWorthChart series={shown} />
        </div>
        <div style={{ marginTop: 12 }}>
          <Seg<Range>
            value={range}
            onChange={setRange}
            options={[
              { value: '1a', label: '1 an' },
              { value: '3a', label: '3 ans' },
              { value: 'tout', label: 'Tout' },
            ]}
          />
        </div>
      </div>

      <div className="card section">
        <div className="card-head">
          <div className="card-title">Répartition</div>
          <button className="icon-btn" onClick={() => go('patrimoine')} aria-label="Voir le patrimoine">
            <ArrowRight size={16} />
          </button>
        </div>
        <SegmentedBar parts={parts} />
      </div>

      <div className="card section">
        <div className="card-head">
          <div className="card-title">12 derniers mois</div>
        </div>
        <KeyRows
          rows={[
            {
              label: 'Épargne par mois',
              sub: 'argent nouveau, hors marchés',
              value: market && s12.months ? eur(s12.savings / s12.months, false) : '…',
            },
            {
              label: 'Marchés et intérêts',
              value: market ? eurSigned(s12.market + s12.interest, false) : '…',
              tone: market ? (s12.market + s12.interest >= 0 ? 'good' : 'bad') : '',
            },
            {
              label: 'Argent qui dort',
              sub: `au-delà de ${eur(drag.buffer, false)} sur comptes courants`,
              value: eur(drag.excessNow, false),
              valueSub: `≈ ${eur(drag.perYearNow, false)}/an au Livret A`,
              tone: 'warn',
            },
          ]}
        />
      </div>

      {notes.length > 0 && (
        <div className="card section">
          <div className="card-head">
            <div className="card-title">À surveiller</div>
          </div>
          <FindingList items={notes.slice(0, 4)} />
        </div>
      )}

      <div className="ios-list section">
        <a href="#/rapports" className="ios-row">
          <span className="ios-icon">
            <FileText size={18} />
          </span>
          <span className="grow">Dernier rapport</span>
          {report && <span className={`tnum ${report.delta >= 0 ? 'good' : 'bad'}`}>{eurSigned(report.delta, false)}</span>}
          <ChevronRight size={18} className="muted" />
        </a>
        <a href="#/diversification" className="ios-row">
          <span className="ios-icon">
            <ChartPie size={18} />
          </span>
          <span className="grow">Diversification</span>
          <span className="muted">
            {scoreLabel(div.global)} · {div.global}/10
          </span>
          <ChevronRight size={18} className="muted" />
        </a>
      </div>
    </>
  );
}

function Onboarding() {
  const { sync, syncing, notify } = useStore();
  return (
    <div className="card" style={{ padding: 24 }}>
      <div className="card-title">Bienvenue sur Pécule</div>
      <p className="text-2">Chaque colonne de ta feuille Google devient un compte, chaque ligne datée un relevé.</p>
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
  );
}
