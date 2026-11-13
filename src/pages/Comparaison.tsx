import { useState } from 'react';
import { useStore } from '../store';
import { KeyRows, Note, Seg } from '../components/ui';
import { BellChart } from '../components/compare';
import { eur } from '../lib/format';
import { totals } from '../lib/networth';
import { INSEE_2024, percentileIn } from '../lib/insights';

/** Ton patrimoine face à celui des ménages de ton âge (INSEE, début 2024). */
export default function Comparaison() {
  const { data, update } = useStore();
  const [editing, setEditing] = useState(false);
  const [scope, setScope] = useState<'age' | 'tous'>('age');
  const thisYear = new Date().getFullYear();
  const birthYear = data.settings.birthYear;

  if (!birthYear || editing) {
    return <BirthYear initial={birthYear ?? thisYear - 30} onSave={(v) => (update((d) => ({ ...d, settings: { ...d.settings, birthYear: v } })), setEditing(false))} />;
  }

  const age = thisYear - birthYear;
  const bracket = INSEE_2024.rows.find((r) => age >= r.min && age <= r.max) ?? INSEE_2024.rows[0];
  const ref = scope === 'age' ? bracket : INSEE_2024.all;
  const mine = totals(data.accounts).assets; // l'INSEE mesure le patrimoine BRUT (dettes non déduites)
  const p = Math.round(percentileIn(mine, ref).p);
  const who = scope === 'age' ? `des ménages de ${bracket.label.toLowerCase()}` : 'des ménages français';

  return (
    <>
      <div className="seg-full" style={{ marginBottom: 16 }}>
        <Seg<'age' | 'tous'>
          value={scope}
          onChange={setScope}
          options={[
            { value: 'age', label: `Ton âge (${age} ans)` },
            { value: 'tous', label: 'Tous âges' },
          ]}
        />
      </div>

      <div className="card">
        <div className="hero-label">Tu as plus que</div>
        <div className="hero-value">{p} %</div>
        <div className="muted small" style={{ marginTop: 4 }}>
          {who}
        </div>
        <div style={{ marginTop: 20 }}>
          <BellChart bracket={ref} mine={mine} />
        </div>
        <div className="legend-inline" style={{ marginTop: 8 }}>
          <span>
            <span className="swatch" style={{ background: 'var(--accent)', opacity: 0.5 }} /> Ont moins que toi
          </span>
          <span>
            <span className="swatch" style={{ background: 'var(--muted)', opacity: 0.5 }} /> Ont plus
          </span>
        </div>
      </div>

      <div className="card section">
        <KeyRows
          rows={[
            { label: 'Patrimoine médian', sub: 'la moitié des ménages a moins', value: eur(ref.median, false) },
            { label: '10 % les plus aisés', sub: 'à partir de', value: eur(ref.d9, false) },
            { label: '10 % les plus modestes', sub: 'en dessous de', value: eur(ref.d1, false) },
          ]}
        />
      </div>

      <Note title="Source et méthode">
        <p>
          INSEE, enquête Histoire de vie et Patrimoine, début 2024 :{' '}
          <a href={INSEE_2024.source} target="_blank" rel="noreferrer noopener">
            montants de patrimoine brut des ménages
          </a>
          . Ménage classé selon l’âge de la personne qui apporte le plus de revenus.
        </p>
        <p>
          L’INSEE publie trois repères par tranche (1er décile, médiane, 9e décile). La courbe en est déduite, en échelle logarithmique, et passe exactement par ces repères : c’est une
          estimation de la forme réelle.
        </p>
        <p>
          C’est le patrimoine de tout le ménage, immobilier compris, dettes non déduites. Le tien est celui de ta feuille ({eur(mine, false)} d’actifs).
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
