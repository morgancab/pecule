import { useState } from 'react';
import { useStore } from '../store';
import { KeyRows, Note, RankBars } from '../components/ui';
import { AgeRanges, PercentileGauge } from '../components/compare';
import { amountsHidden, eur } from '../lib/format';
import { totals } from '../lib/networth';
import { INSEE_2024, percentileIn } from '../lib/insights';

/** Ton patrimoine face à celui des ménages de ton âge (INSEE, début 2024). */
export default function Comparaison() {
  const { data, update } = useStore();
  const [editing, setEditing] = useState(false);
  const thisYear = new Date().getFullYear();
  const birthYear = data.settings.birthYear;

  if (!birthYear || editing) {
    return <BirthYear initial={birthYear ?? thisYear - 30} onSave={(v) => (update((d) => ({ ...d, settings: { ...d.settings, birthYear: v } })), setEditing(false))} />;
  }

  const age = thisYear - birthYear;
  const b = INSEE_2024.rows.find((r) => age >= r.min && age <= r.max) ?? INSEE_2024.rows[0];
  const mine = totals(data.accounts).assets; // l'INSEE mesure le patrimoine BRUT (dettes non déduites)
  const pos = percentileIn(mine, b);
  const posAll = percentileIn(mine, INSEE_2024.all);
  const headline = pos.above9 ? 'Dans les 10 % les plus aisés' : pos.below1 ? 'Parmi les 10 % les plus modestes' : `Devant ${Math.round(pos.p)} % des ménages`;
  const byBracket = INSEE_2024.rows.map((r) => ({ r, pos: percentileIn(mine, r) }));

  return (
    <>
      <div className="card">
        <div className="hero-label">
          Ménages de {b.label.toLowerCase()} · tu as {age} ans
        </div>
        <div style={{ margin: '12px 0 4px' }}>
          <PercentileGauge p={pos.above9 ? 95 : pos.p} label={pos.above9 ? 'au-delà du 9e décile' : 'des ménages de ton âge ont moins'} />
        </div>
        {(pos.above9 || pos.below1) && (
          <div className="stat-value" style={{ textAlign: 'center' }}>
            {headline}
          </div>
        )}
        <p className="muted small" style={{ margin: '4px 0 0', textAlign: 'center' }}>
          Estimation d’après l’INSEE
        </p>
      </div>

      <div className="card section">
        <div className="card-head">
          <div>
            <div className="card-title">Toi face à chaque âge</div>
            <div className="card-sub">Trait : du 1er au 9e décile · point : médiane</div>
          </div>
        </div>
        <AgeRanges rows={INSEE_2024.rows} mine={mine} current={b.id} />
      </div>

      <div className="card section">
        <div className="card-head">
          <div>
            <div className="card-title">Ta position dans chaque tranche</div>
            <div className="card-sub">Part des ménages qui ont moins que toi</div>
          </div>
        </div>
        <RankBars
          rows={byBracket.map(({ r, pos: p }) => ({
            id: r.id,
            label: r.id === b.id ? <strong>{r.label}</strong> : r.label,
            value: p.above9 ? 90 : p.p,
            dim: r.id !== b.id,
            display: p.above9 ? '> 90 %' : p.below1 ? '< 10 %' : `${Math.round(p.p)} %`,
          }))}
          max={100}
        />
      </div>

      <div className="card section">
        <div className="card-head">
          <div className="card-title">Repères de ta tranche</div>
        </div>
        <KeyRows
          rows={[
            { label: 'Patrimoine médian', sub: 'la moitié des ménages a moins', value: eur(b.median, false), valueSub: amountsHidden() ? undefined : `toi : ${(mine / b.median).toFixed(1).replace('.', ',')} × la médiane` },
            { label: 'Patrimoine moyen', sub: 'tiré vers le haut par les plus aisés', value: eur(b.mean, false) },
            { label: '10 % les plus aisés', sub: 'à partir de', value: eur(b.d9, false) },
            {
              label: 'Tous âges confondus',
              sub: `médiane : ${eur(INSEE_2024.all.median, false)}`,
              value: posAll.above9 ? '> 90 %' : `${Math.round(posAll.p)} %`,
              valueSub: 'ont moins que toi',
            },
          ]}
        />
      </div>

      <Note title="Source et limites">
        <p>
          INSEE, enquête Histoire de vie et Patrimoine, début 2024 :{' '}
          <a href={INSEE_2024.source} target="_blank" rel="noreferrer noopener">
            montants de patrimoine brut des ménages
          </a>
          . Ménage classé selon l’âge de la personne qui apporte le plus de revenus.
        </p>
        <p>
          C’est le patrimoine de tout le ménage, immobilier compris, dettes non déduites. Le tien est celui de ta feuille ({eur(mine, false)} d’actifs). Ta position est estimée en
          interpolant entre les déciles publiés : c’est un ordre de grandeur.
        </p>
        <button className="btn btn-sm" style={{ marginTop: 12 }} onClick={() => setEditing(true)}>
          Modifier mon année de naissance ({birthYear})
        </button>
      </Note>
    </>
  );
}

function BirthYear({ initial, onSave }: { initial: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(initial);
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 80 }, (_, i) => thisYear - 16 - i);
  return (
    <div className="card">
      <div className="card-title">Ton année de naissance</div>
      <p className="muted small">Pour te comparer aux ménages de ton âge. Elle reste dans tes réglages, avec le reste de tes données.</p>
      <div className="field">
        <select value={v} onChange={(e) => setV(Number(e.target.value))} aria-label="Année de naissance">
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <button className="btn btn-primary" style={{ marginTop: 12, width: '100%' }} onClick={() => onSave(v)}>
        Comparer
      </button>
    </div>
  );
}
