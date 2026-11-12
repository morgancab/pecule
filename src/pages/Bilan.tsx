import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Play } from 'lucide-react';
import { useStore } from '../store';
import { go } from '../App';
import { Empty, KeyRows, Seg } from '../components/ui';
import { MonthBars, Spark, StoryViewer, type StorySlide } from '../components/Story';
import { eur, eurSigned, fmtDate, monthLabel, pct, pctSigned } from '../lib/format';
import { decompose } from '../lib/market';
import { useMarket } from '../lib/useMarket';
import { monthlyGrid, yearReview } from '../lib/insights';

// Couleurs franches, une par écran (fond, texte) : c'est le moment « fête » de l'app
const C = {
  orange: ['#ff5a1f', '#1a0b02'],
  blue: ['#1f3dff', '#f6f3ec'],
  lime: ['#c8f031', '#141410'],
  pink: ['#ff4f9a', '#1c0612'],
  yellow: ['#ffd02e', '#1a1402'],
  violet: ['#7a2ff5', '#f7f2ff'],
  green: ['#00a77e', '#03130e'],
  ink: ['#141414', '#f4f1ea'],
} as const;

const delay = (k: number): CSSProperties => ({ animationDelay: `${0.12 + k * 0.14}s` });

/** « Ton année » : une couverture, puis des écrans plein format à faire défiler. */
export default function Bilan() {
  const { data } = useStore();
  const { series, market } = useMarket(data.accounts);
  const periods = useMemo(() => decompose(data.accounts, series, market), [data.accounts, series, market]);
  const years = [...new Set(series.map((p) => p.date.slice(0, 4)))].sort();
  const [year, setYear] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  if (series.length < 3) {
    return (
      <div className="card">
        <Empty title="Pas encore assez d’historique" text="Le résumé se base sur tes relevés de l’année.">
          <button className="btn btn-primary" onClick={() => go('reglages')}>
            Synchroniser ma feuille
          </button>
        </Empty>
      </div>
    );
  }

  const y = year ?? years[years.length - 1];
  const r = yearReview(series, periods, data.accounts, y)!;
  const inYear = series.filter((p) => p.date.startsWith(y));
  const high = inYear.reduce((m, p) => (p.net > m.net ? p : m), inYear[0]);
  const grid = monthlyGrid(series);
  const months = Array.from({ length: 12 }, (_, k) => grid.cells.get(`${y}-${String(k + 1).padStart(2, '0')}`) ?? null);
  const bestIdx = r.best ? Number(r.best[0].slice(5, 7)) - 1 : -1;
  const sources = [
    { label: 'Épargne', value: r.savings },
    { label: 'Marchés', value: r.market },
    { label: 'Intérêts', value: r.interest },
  ];
  const maxSource = Math.max(1, ...sources.map((s) => Math.abs(s.value)));

  const slide = (key: string, color: readonly [string, string], deco: StorySlide['deco'], body: (fg: string) => ReactNode): StorySlide => ({
    key,
    bg: color[0],
    fg: color[1],
    deco,
    body: body(color[1]),
  });

  const slides: StorySlide[] = [
    slide('intro', C.orange, 'circles', () => (
      <>
        <div className="wrap-kicker wrap-in" style={delay(0)}>
          Pécule · rétro
        </div>
        <div className="wrap-huge wrap-in" style={delay(1)}>
          Ton année
          <br />
          {y}
        </div>
        <div className="wrap-sub wrap-in" style={delay(2)}>
          {r.partial ? `Du 1er janvier au ${fmtDate(r.end.date, false).replace(/\.$/, '')}. ` : ''}On regarde ce qu’elle a donné ?
        </div>
      </>
    )),
    slide('variation', C.blue, 'stripes', (fg) => (
      <>
        <div className="wrap-kicker wrap-in" style={delay(0)}>
          Ton patrimoine a {r.total >= 0 ? 'pris' : 'perdu'}
        </div>
        <div className="wrap-huge wrap-in" style={delay(1)}>
          {pctSigned(r.ratio)}
        </div>
        <div className="wrap-sub wrap-in" style={delay(2)}>
          {eurSigned(r.total, false)}, de {eur(r.start.net, false)} à {eur(r.end.net, false)}
        </div>
        <div className="wrap-in" style={{ ...delay(3), marginTop: 24 }}>
          <Spark values={[r.start.net, ...inYear.map((p) => p.net)]} color={fg} />
        </div>
      </>
    )),
    slide('sources', C.lime, 'half', (fg) => (
      <>
        <div className="wrap-kicker wrap-in" style={delay(0)}>
          D’où ça vient
        </div>
        <div className="wrap-big wrap-in" style={delay(1)}>
          {r.total > 0 && r.savings > 0 ? `${pct(r.savings / r.total, 0)} grâce à ton épargne` : 'Épargne, marchés, intérêts'}
        </div>
        <div style={{ marginTop: 28, display: 'grid', gap: 18 }}>
          {sources.map((s, k) => (
            <div key={s.label} className="wrap-in" style={delay(2 + k)}>
              <div className="row between wrap-row">
                <span>{s.label}</span>
                <strong>{eurSigned(s.value, false)}</strong>
              </div>
              <div className="wrap-track" style={{ background: `color-mix(in srgb, ${fg} 18%, transparent)` }}>
                <div className="wrap-grow-x" style={{ width: `${Math.max(2, (Math.abs(s.value) / maxSource) * 100)}%`, background: fg, opacity: s.value < 0 ? 0.45 : 1, animationDelay: `${0.4 + k * 0.15}s` }} />
              </div>
            </div>
          ))}
        </div>
      </>
    )),
    slide('mois', C.pink, 'grid', (fg) => (
      <>
        <div className="wrap-kicker wrap-in" style={delay(0)}>
          Mois par mois
        </div>
        <div className="wrap-huge wrap-in" style={delay(1)}>
          {r.upMonths}
          <span className="wrap-unit">/{r.monthCount}</span>
        </div>
        <div className="wrap-sub wrap-in" style={delay(2)}>
          mois en hausse
        </div>
        <div className="wrap-in" style={{ ...delay(3), marginTop: 20 }}>
          <MonthBars values={months} color={fg} best={bestIdx} />
        </div>
        {r.best && (
          <div className="wrap-sub wrap-in" style={delay(4)}>
            Meilleur : {monthLabel(r.best[0], true).replace(/ \d{4}$/, '')} ({eurSigned(r.best[1], false)})
          </div>
        )}
      </>
    )),
    slide('records', C.yellow, 'burst', () => (
      <>
        <div className="wrap-kicker wrap-in" style={delay(0)}>
          Records battus
        </div>
        <div className="wrap-mega wrap-in" style={delay(1)}>
          {r.records}
        </div>
        <div className="wrap-sub wrap-in" style={delay(2)}>
          {r.records === 0 ? 'Pas de nouveau record cette année, le prochain arrive.' : `fois, ton patrimoine a atteint un nouveau sommet.`}
          <br />
          Plus haut : {eur(high.net, false)} le {fmtDate(high.date)}
        </div>
      </>
    )),
    ...(r.top
      ? [
          slide('compte', C.violet, 'rings', () => (
            <>
              <div className="wrap-kicker wrap-in" style={delay(0)}>
                Le compte de l’année
              </div>
              <div className="wrap-huge wrap-in" style={{ ...delay(1), fontSize: r.top!.a.name.length > 12 ? 52 : 72 }}>
                {r.top!.a.name}
              </div>
              <div className="wrap-sub wrap-in" style={delay(2)}>
                {eurSigned(r.top!.delta, false)} sur l’année
              </div>
              {r.bottom && (
                <div className="wrap-note wrap-in" style={delay(3)}>
                  Celui qui a pesé : {r.bottom.a.name} ({eurSigned(r.bottom.delta, false)})
                </div>
              )}
            </>
          )),
        ]
      : []),
    ...(r.perMonth !== null
      ? [
          slide('rythme', C.green, 'circles', (fg) => {
            const prev = r.prevPerMonth && r.prevPerMonth > 0 ? r.prevPerMonth : null;
            const top = Math.max(r.perMonth!, prev ?? 0, 1);
            return (
              <>
                <div className="wrap-kicker wrap-in" style={delay(0)}>
                  Tu as mis de côté
                </div>
                <div className="wrap-huge wrap-in" style={delay(1)}>
                  {eur(r.perMonth!, false)}
                </div>
                <div className="wrap-sub wrap-in" style={delay(2)}>
                  par mois en moyenne{prev ? `, ${pctSigned(r.perMonth! / prev - 1, 0)} par rapport à ${Number(y) - 1}` : ''}
                </div>
                {prev && (
                  <div className="wrap-cols wrap-in" style={delay(3)}>
                    {[
                      { l: String(Number(y) - 1), v: prev, o: 0.45 },
                      { l: y, v: r.perMonth!, o: 1 },
                    ].map((b, k) => (
                      <div key={b.l} className="wrap-col">
                        <div className="wrap-col-bar wrap-grow" style={{ height: `${(b.v / top) * 100}%`, background: fg, opacity: b.o, animationDelay: `${0.5 + k * 0.15}s` }} />
                        <span>{b.l}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            );
          }),
        ]
      : []),
    slide('repartition', C.ink, 'stripes', (fg) => (
      <>
        <div className="wrap-kicker wrap-in" style={delay(0)}>
          Ta répartition
        </div>
        <div className="wrap-big wrap-in" style={delay(1)}>
          Début et fin d’année
        </div>
        {[
          { l: 'Janvier', parts: r.sharesStart },
          { l: r.partial ? 'Aujourd’hui' : 'Décembre', parts: r.sharesEnd },
        ].map((row, k) => (
          <div key={row.l} className="wrap-in" style={{ ...delay(2 + k), marginTop: 22 }}>
            <div className="wrap-row" style={{ marginBottom: 8 }}>
              {row.l}
            </div>
            <div className="wrap-stack">
              {row.parts.map((g, j) => (
                <div key={g.id} style={{ width: `${g.value * 100}%`, background: fg, opacity: [1, 0.7, 0.45, 0.25, 0.15][j] ?? 0.15 }} />
              ))}
            </div>
          </div>
        ))}
        <div className="wrap-legend wrap-in" style={delay(4)}>
          {r.sharesEnd.map((g, j) => (
            <span key={g.id}>
              <i style={{ background: fg, opacity: [1, 0.7, 0.45, 0.25, 0.15][j] ?? 0.15 }} />
              {g.label} {pct(g.value, 0)}
            </span>
          ))}
        </div>
      </>
    )),
    slide('fin', C.orange, 'half', () => (
      <>
        <div className="wrap-kicker wrap-in" style={delay(0)}>
          {y} en trois chiffres
        </div>
        <div className="wrap-list">
          {[
            { v: pctSigned(r.ratio), l: 'de patrimoine' },
            ...(r.perMonth !== null ? [{ v: eur(r.perMonth, false), l: 'épargnés par mois' }] : []),
            { v: `${r.upMonths}/${r.monthCount}`, l: 'mois en hausse' },
          ].map((x, k) => (
            <div key={x.l} className="wrap-in" style={delay(1 + k)}>
              <div className="wrap-big">{x.v}</div>
              <div className="wrap-row">{x.l}</div>
            </div>
          ))}
        </div>
        <div className="wrap-note wrap-in" style={delay(5)}>
          Touche pour fermer
        </div>
      </>
    )),
  ];

  return (
    <>
      {years.length > 1 && (
        <div className="seg-full" style={{ marginBottom: 16 }}>
          <Seg<string> value={y} onChange={setYear} options={years.slice(-5).map((v) => ({ value: v, label: v }))} />
        </div>
      )}

      <button className="wrap-cover" style={{ background: C.orange[0], color: C.orange[1] }} onClick={() => setOpen(true)}>
        <svg className="wrap-deco" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <circle cx="350" cy="40" r="120" fill={C.orange[1]} fillOpacity={0.1} />
          <circle cx="40" cy="300" r="90" fill={C.orange[1]} fillOpacity={0.08} />
        </svg>
        <span className="wrap-kicker">Pécule · rétro</span>
        <span className="wrap-huge" style={{ fontSize: 56 }}>
          Ton année {y}
        </span>
        <span className="wrap-cover-cta" style={{ background: C.orange[1], color: C.orange[0] }}>
          <Play size={16} fill="currentColor" /> Lancer · {slides.length} écrans
        </span>
      </button>

      <div className="card section">
        <div className="card-head">
          <div className="card-title">En bref</div>
        </div>
        <KeyRows
          rows={[
            { label: 'Variation', value: pctSigned(r.ratio), valueSub: eurSigned(r.total, false), tone: r.total >= 0 ? 'good' : 'bad' },
            ...(r.perMonth !== null ? [{ label: 'Épargne par mois', value: eur(r.perMonth, false) }] : []),
            { label: 'Mois en hausse', value: `${r.upMonths} / ${r.monthCount}` },
            { label: 'Nouveaux records', value: String(r.records) },
            ...(r.top ? [{ label: 'Compte de l’année', value: r.top.a.name, valueSub: eurSigned(r.top.delta, false) }] : []),
          ]}
        />
      </div>

      {open && <StoryViewer slides={slides} onClose={() => setOpen(false)} />}
    </>
  );
}
