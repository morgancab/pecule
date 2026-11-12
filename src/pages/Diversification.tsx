import { useStore } from '../store';
import { go } from '../App';
import { Empty, Note, RankBars, ScoreRing } from '../components/ui';
import { eur, pct } from '../lib/format';
import { diversification, scoreLabel, type Dimension } from '../lib/diversification';

export default function Diversification() {
  const { data } = useStore();
  const { dimensions, global, unknownEquity } = diversification(data.accounts);
  if (!data.accounts.length) {
    return (
      <div className="card">
        <Empty title="Aucun compte" text="Synchronise ta feuille Google pour mesurer ta diversification.">
          <button className="btn btn-primary" onClick={() => go('reglages')}>
            Synchroniser ma feuille
          </button>
        </Empty>
      </div>
    );
  }
  const geo = dimensions.find((d) => d.id === 'geo')!;
  const sector = dimensions.find((d) => d.id === 'sector')!;
  const conc = dimensions.find((d) => d.id === 'concentration')!;
  const tips: string[] = [];
  if (geo.base && geo.parts[0]?.share > 0.6)
    tips.push(`Ta partie actions (${eur(geo.base, false)}) est à ${pct(geo.parts[0].share, 0)} sur un seul pays : ${geo.parts[0].label}. Une partie en Europe, en Asie ou dans les pays émergents réduirait cette dépendance.`);
  if (sector.base && sector.parts[0]?.share > 0.4)
    tips.push(`${pct(sector.parts[0].share, 0)} de tes actions sont dans un seul secteur (${sector.parts[0].label.toLowerCase()}). Un fonds large (type MSCI World) en couvre une dizaine.`);
  if (conc.parts[0]?.share > 0.2) tips.push(`${conc.parts[0].label} représente ${pct(conc.parts[0].share, 0)} de ton patrimoine : c’est ta plus grosse exposition à un seul placement.`);
  if (unknownEquity > 0) tips.push(`${eur(unknownEquity, false)} d’actions sans référence de marché : choisis-en une dans la fiche du compte (Patrimoine) pour affiner le score.`);

  return (
    <>
      <div className="card">
        <div className="row" style={{ gap: 16 }}>
          <ScoreRing score={global} size={72} />
          <div className="grow">
            <div className="hero-label">Score global</div>
            <div className="stat-value">
              {scoreLabel(global)} · {global}/10
            </div>
          </div>
        </div>
        {tips.length > 0 && (
          <div className="kv" style={{ marginTop: 16 }}>
            {tips.map((t) => (
              <div className="kv-row text-2 small" key={t}>
                {t}
              </div>
            ))}
          </div>
        )}
      </div>

      {dimensions.map((d) => (
        <DimensionCard key={d.id} d={d} />
      ))}

      <Note>
        <p>Estimée d’après le type et la référence de marché de chaque compte. Un ETF monde est réparti selon la composition approximative de son indice.</p>
        <p>Score global : classes d’actifs 30 %, géographie 25 %, secteurs 25 %, concentration 20 %.</p>
        {dimensions.map((d) => (
          <p key={d.id}>
            {d.title} : {d.explain}
          </p>
        ))}
        <p>Ce score décrit la répartition, pas la qualité des placements. Ce n’est pas un conseil en investissement.</p>
      </Note>
    </>
  );
}

function DimensionCard({ d }: { d: Dimension }) {
  return (
    <div className="card section">
      <div className="row" style={{ gap: 12, marginBottom: 16 }}>
        <ScoreRing score={d.score} size={44} />
        <div className="grow">
          <div className="card-title">{d.title}</div>
          <div className="muted small">
            {d.label} · {d.base ? `sur ${eur(d.base, false)}` : 'aucune action suivie'}
          </div>
        </div>
      </div>
      {d.parts.length > 0 && (
        <RankBars
          rows={d.parts.slice(0, 5).map((p) => ({
            id: p.label,
            label: p.label,
            value: p.share,
            display: (
              <>
                {pct(p.share, 0)} <span className="muted small">{eur(p.value, false)}</span>
              </>
            ),
          }))}
          max={1}
        />
      )}
    </div>
  );
}
