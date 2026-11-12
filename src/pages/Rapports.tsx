import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { useStore } from '../store';
import { go } from '../App';
import { Empty, Stat } from '../components/ui';
import { eur, eurSigned, fmtDate, pct, pctSigned } from '../lib/format';
import { decompose } from '../lib/market';
import { buildReport } from '../lib/report';
import { useMarket } from '../lib/useMarket';

/** Un rapport par relevé de ta feuille : ce qui a bougé, pourquoi, et comment ça se compare. */
export default function Rapports() {
  const { data } = useStore();
  const { series, market, loading } = useMarket(data.accounts);
  const periods = useMemo(() => decompose(data.accounts, series, market), [data.accounts, series, market]);
  const [idx, setIdx] = useState<number | null>(null);
  const index = idx ?? series.length - 1;

  if (series.length < 2) {
    return (
      <div className="card">
        <Empty title="Pas encore de rapport" text="Il faut au moins deux relevés dans ta feuille.">
          <button className="btn btn-primary" onClick={() => go('reglages')}>
            Synchroniser ma feuille
          </button>
        </Empty>
      </div>
    );
  }
  const r = buildReport(index, series, periods, data.accounts)!;
  const maxMove = Math.max(1, ...r.movers.map((m) => Math.abs(m.delta)));

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Rapport du {fmtDate(r.date)}</h1>
          <p className="page-sub">Depuis le relevé du {fmtDate(r.prevDate)} · un rapport par ligne de ta feuille</p>
        </div>
        <div className="row">
          <button className="icon-btn" onClick={() => setIdx(Math.max(1, index - 1))} disabled={index <= 1} aria-label="Relevé précédent">
            <ChevronLeft size={18} />
          </button>
          <select value={index} onChange={(e) => setIdx(Number(e.target.value))} aria-label="Relevé">
            {series
              .map((p, i) => ({ p, i }))
              .slice(1)
              .reverse()
              .map(({ p, i }) => (
                <option key={p.date} value={i}>
                  {fmtDate(p.date)}
                </option>
              ))}
          </select>
          <button className="icon-btn" onClick={() => setIdx(Math.min(series.length - 1, index + 1))} disabled={index >= series.length - 1} aria-label="Relevé suivant">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="card">
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>{r.summary}</p>
        {loading && <p className="muted small">Chargement des cours pour le détail épargne / marchés…</p>}
      </div>

      <div className="grid cols-4 section">
        <Stat label="Variation" value={<span className={r.delta >= 0 ? 'good' : 'bad'}>{eurSigned(r.delta, false)}</span>} sub={`${pctSigned(r.ratio)} · ${r.rank}e sur ${r.count} relevés`} />
        <Stat label="Épargne (estimée)" value={r.period ? eurSigned(r.period.savings, false) : '…'} sub="argent nouveau sur la période" />
        <Stat label="Marchés" value={r.period ? <span className={r.period.market >= 0 ? 'good' : 'bad'}>{eurSigned(r.period.market, false)}</span> : '…'} sub="effet des cours (Amazon, MSCI World, Bitcoin)" />
        <Stat label="Moyenne des 12 relevés précédents" value={r.avg12 !== null ? eurSigned(r.avg12, false) : '—'} sub={r.avg12 !== null ? (r.delta >= r.avg12 ? 'ce relevé fait mieux' : 'ce relevé fait moins bien') : undefined} />
      </div>

      <div className="grid cols-2 section">
        <div className="card">
          <div className="card-head">
            <div className="card-title">Ce qui a bougé</div>
          </div>
          {r.movers.length ? (
            <div className="rank">
              {r.movers.map((m) => (
                <div className="rank-row" key={m.account.id}>
                  <span className="ellipsis">{m.account.name}</span>
                  <div className="rank-track">
                    <div className="rank-fill" style={{ width: `${(Math.abs(m.delta) / maxMove) * 100}%`, background: m.delta >= 0 ? 'var(--accent)' : 'var(--critical)' }} />
                  </div>
                  <span className={`tnum nowrap ${m.delta >= 0 ? 'good' : 'bad'}`}>{eurSigned(m.delta, false)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted small">Aucun mouvement.</div>
          )}
        </div>
        <div className="card">
          <div className="card-head">
            <div className="card-title">Répartition</div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Classe</th>
                  <th className="num">Avant</th>
                  <th className="num">Après</th>
                </tr>
              </thead>
              <tbody>
                {r.shifts.map((s) => (
                  <tr key={s.label}>
                    <td>{s.label}</td>
                    <td className="num muted">{pct(s.before, 0)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>
                      {pct(s.after, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {r.events.length > 0 && (
        <div className="card section">
          <div className="card-head">
            <div className="card-title">À noter</div>
          </div>
          {r.events.map((e) => {
            const Icon = e.tone === 'good' ? CircleCheck : e.tone === 'warn' ? TriangleAlert : Info;
            return (
              <div className="list-row" key={e.text}>
                <Icon size={16} className={e.tone === 'good' ? 'good' : e.tone === 'warn' ? 'warn' : 'muted'} />
                <span>{e.text}</span>
              </div>
            );
          })}
        </div>
      )}

      <p className="muted small section">Patrimoine net à cette date : {eur(r.net, false)}. Le détail épargne / marchés est une estimation à partir des cours publics.</p>
    </>
  );
}
