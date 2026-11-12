import { useState } from 'react';
import { useStore } from '../store';
import { KeyRows, Note } from '../components/ui';
import { amountsHidden, eur, eurCompact } from '../lib/format';
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
  const t = totals(data.accounts);
  const mine = t.assets; // l'INSEE mesure le patrimoine BRUT (dettes non déduites)
  const pos = percentileIn(mine, b);
  const posAll = percentileIn(mine, INSEE_2024.all);
  const headline = pos.above9 ? 'Dans les 10 % les plus aisés' : pos.below1 ? 'Parmi les 10 % les plus modestes' : `Devant ${Math.round(pos.p)} % des ménages`;

  // échelle logarithmique pour placer « toi » entre les déciles
  const lo = Math.min(b.d1, mine) / 1.6;
  const hi = Math.max(b.d9, mine) * 1.6;
  const x = (v: number) => `${(100 * Math.log(Math.max(v, lo) / lo)) / Math.log(hi / lo)}%`;

  return (
    <>
      <div className="card">
        <div className="hero-label">
          Ménages de {b.label.toLowerCase()} · tu as {age} ans
        </div>
        <div className="stat-value" style={{ fontSize: 28, marginTop: 4 }}>
          {headline}
        </div>
        <p className="muted small" style={{ margin: '4px 0 0' }}>
          {pos.above9 || pos.below1 ? 'de ta tranche d’âge, d’après l’INSEE' : 'de ta tranche d’âge ont un patrimoine plus faible que le tien (estimation)'}
        </p>

        <div className="scale" aria-hidden="true">
          <div className="scale-track" />
          {[
            { v: b.d1, l: '10 %' },
            { v: b.median, l: 'Médiane' },
            { v: b.d9, l: '90 %' },
          ].map((m) => (
            <div className="scale-mark" key={m.l} style={{ left: x(m.v) }}>
              <span className="scale-tick" />
              <span className="scale-label">
                {m.l}
                <br />
                {eurCompact(m.v)}
              </span>
            </div>
          ))}
          <div className="scale-me" style={{ left: x(mine) }}>
            <span>Toi</span>
          </div>
        </div>
      </div>

      <div className="card section">
        <div className="card-head">
          <div className="card-title">Ta tranche d’âge</div>
        </div>
        <KeyRows
          rows={[
            { label: 'Patrimoine médian', sub: 'la moitié des ménages a moins', value: eur(b.median, false), valueSub: amountsHidden() ? undefined : `toi : ${(mine / b.median).toFixed(1).replace('.', ',')} × la médiane` },
            { label: 'Patrimoine moyen', sub: 'tiré vers le haut par les plus aisés', value: eur(b.mean, false) },
            { label: '10 % les plus aisés', sub: 'à partir de', value: eur(b.d9, false) },
            {
              label: 'Tous âges confondus',
              sub: 'médiane de l’ensemble des ménages',
              value: eur(INSEE_2024.all.median, false),
              valueSub: posAll.above9 ? 'tu es dans les 10 % du haut' : `tu es devant ~${Math.round(posAll.p)} %`,
            },
          ]}
        />
      </div>

      <div className="card flush section">
        <div style={{ padding: '16px 16px 4px' }}>
          <div className="card-title">Selon l’âge</div>
          <div className="card-sub">Patrimoine brut des ménages, début 2024</div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Âge</th>
                <th className="num">Médiane</th>
                <th className="num">10 % du haut</th>
              </tr>
            </thead>
            <tbody>
              {INSEE_2024.rows.map((r) => (
                <tr key={r.id} style={r.id === b.id ? { fontWeight: 600 } : undefined}>
                  <td>
                    {r.label}
                    {r.id === b.id && <span className="muted"> · toi</span>}
                  </td>
                  <td className="num">{eur(r.median, false)}</td>
                  <td className="num">{eur(r.d9, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
