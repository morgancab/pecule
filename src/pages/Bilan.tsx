import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { go } from '../App';
import { Empty, KeyRows, Seg } from '../components/ui';
import { eur, eurSigned, fmtDate, monthLabel, pct, pctSigned } from '../lib/format';
import { decompose } from '../lib/market';
import { useMarket } from '../lib/useMarket';
import { yearReview } from '../lib/insights';

/** « Ton année en résumé » : une série d'écrans à faire défiler. */
export default function Bilan() {
  const { data } = useStore();
  const { series, market } = useMarket(data.accounts);
  const periods = useMemo(() => decompose(data.accounts, series, market), [data.accounts, series, market]);
  const years = [...new Set(series.map((p) => p.date.slice(0, 4)))].sort();
  const [year, setYear] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);
  const track = useRef<HTMLDivElement>(null);

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
  const parts = [
    { label: 'Épargne', value: r.savings },
    { label: 'Marchés', value: r.market },
    { label: 'Intérêts', value: r.interest },
  ];
  const tone = (v: number) => (v >= 0 ? 'good' : 'bad');

  const slides: { key: string; label: string; body: ReactNode }[] = [
    {
      key: 'annee',
      label: `Ton année ${y}${r.partial ? ` · jusqu’au ${fmtDate(r.end.date, false)}` : ''}`,
      body: (
        <>
          <div className={`story-big ${tone(r.total)}`}>{pctSigned(r.ratio)}</div>
          <p className="story-text">
            {eurSigned(r.total, false)} : de {eur(r.start.net, false)} à {eur(r.end.net, false)}
          </p>
        </>
      ),
    },
    {
      key: 'sources',
      label: 'D’où ça vient',
      body: (
        <KeyRows
          rows={parts.map((p) => ({
            label: p.label,
            value: eurSigned(p.value, false),
            valueSub: r.total > 0 ? `${pct(p.value / r.total, 0)} de la hausse` : undefined,
            tone: tone(p.value),
          }))}
        />
      ),
    },
    {
      key: 'mois',
      label: 'Mois par mois',
      body: (
        <>
          <div className="story-big">
            {r.upMonths}
            <span className="story-unit"> / {r.monthCount} mois en hausse</span>
          </div>
          {r.best && (
            <p className="story-text">
              Meilleur : {monthLabel(r.best[0], true)} ({eurSigned(r.best[1], false)})
              {r.worst && r.worst[1] < 0 && (
                <>
                  <br />
                  Plus dur : {monthLabel(r.worst[0], true)} ({eurSigned(r.worst[1], false)})
                </>
              )}
            </p>
          )}
        </>
      ),
    },
    {
      key: 'records',
      label: 'Records',
      body: (
        <>
          <div className="story-big">{r.records === 0 ? 'Aucun' : r.records}</div>
          <p className="story-text">
            {r.records === 0 ? 'nouveau record cette année' : `nouveau${r.records > 1 ? 'x' : ''} record${r.records > 1 ? 's' : ''} de patrimoine`}
            <br />
            Plus haut de l’année : {eur(high.net, false)} le {fmtDate(high.date)}
          </p>
        </>
      ),
    },
    ...(r.top
      ? [
          {
            key: 'compte',
            label: 'Le compte de l’année',
            body: (
              <>
                <div className="story-big story-name">{r.top.a.name}</div>
                <p className="story-text">
                  <span className={tone(r.top.delta)}>{eurSigned(r.top.delta, false)}</span> sur l’année
                  {r.bottom && (
                    <>
                      <br />
                      Celui qui a pesé : {r.bottom.a.name} (<span className="bad">{eurSigned(r.bottom.delta, false)}</span>)
                    </>
                  )}
                </p>
              </>
            ),
          },
        ]
      : []),
    ...(r.perMonth !== null
      ? [
          {
            key: 'rythme',
            label: 'Ton rythme d’épargne',
            body: (
              <>
                <div className="story-big">
                  {eur(r.perMonth, false)}
                  <span className="story-unit"> /mois</span>
                </div>
                {r.prevPerMonth !== null && r.prevPerMonth > 0 && (
                  <p className="story-text">
                    <span className={tone(r.perMonth - r.prevPerMonth)}>{pctSigned(r.perMonth / r.prevPerMonth - 1)}</span> par rapport à {Number(y) - 1} ({eur(r.prevPerMonth, false)}/mois)
                  </p>
                )}
              </>
            ),
          },
        ]
      : []),
    {
      key: 'repartition',
      label: 'Ta répartition',
      body: (
        <KeyRows
          rows={r.sharesEnd.map((g) => {
            const before = r.sharesStart.find((s) => s.id === g.id)?.value ?? 0;
            return { label: g.label, value: pct(g.value, 0), valueSub: `${pct(before, 0)} au début` };
          })}
        />
      ),
    },
  ];

  const goTo = (i: number) => {
    const el = track.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  return (
    <>
      {years.length > 1 && (
        <div className="seg-full" style={{ marginBottom: 16 }}>
          <Seg<string>
            value={y}
            onChange={(v) => {
              setYear(v);
              setSlide(0);
              track.current?.scrollTo({ left: 0 });
            }}
            options={years.slice(-5).map((v) => ({ value: v, label: v }))}
          />
        </div>
      )}
      <div
        className="story"
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget;
          setSlide(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
        {slides.map((s, i) => (
          <section className="story-slide card" key={s.key} aria-label={s.label} onClick={() => goTo(Math.min(slides.length - 1, i + 1))}>
            <div className="story-label">{s.label}</div>
            <div className="story-body">{s.body}</div>
            <div className="story-count">
              {i + 1} / {slides.length}
            </div>
          </section>
        ))}
      </div>
      <div className="story-dots">
        {slides.map((s, i) => (
          <button key={s.key} className={i === slide ? 'on' : ''} onClick={() => goTo(i)} aria-label={`Écran ${i + 1}`} />
        ))}
      </div>
      <p className="muted small" style={{ textAlign: 'center', marginTop: 8 }}>
        Fais glisser ou touche l’écran pour passer au suivant
      </p>
    </>
  );
}
