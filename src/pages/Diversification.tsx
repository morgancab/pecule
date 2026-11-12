import { useStore } from '../store';
import { go } from '../App';
import { Empty, RankBars, ScoreRing } from '../components/ui';
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
      <div className="page-header">
        <div>
          <h1 className="page-title">Diversification</h1>
          <p className="page-sub">Estimée d’après le type et la référence de marché de chaque compte. Un ETF monde est réparti selon la composition approximative de son indice.</p>
        </div>
      </div>

      <div className="card">
        <div className="row wrap" style={{ gap: 20 }}>
          <ScoreRing score={global} size={92} />
          <div className="grow">
            <div className="hero-label">Score de diversification</div>
            <div className="stat-value" style={{ fontSize: 28 }}>
              {scoreLabel(global)} · {global}/10
            </div>
            <div className="muted small" style={{ marginTop: 4 }}>
              Moyenne pondérée : classes d’actifs 30 %, géographie 25 %, secteurs 25 %, concentration 20 %.
            </div>
          </div>
        </div>
        {tips.length > 0 && (
          <ul className="text-2" style={{ margin: '16px 0 0', paddingLeft: 18, display: 'grid', gap: 6 }}>
            {tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid cols-2 section">
        {dimensions.map((d) => (
          <DimensionCard key={d.id} d={d} />
        ))}
      </div>

      <p className="muted small section">
        Ce score décrit la répartition, pas la qualité des placements. Les compositions d’indices sont des ordres de grandeur. Ce n’est pas un conseil en investissement.
      </p>
    </>
  );
}

function DimensionCard({ d }: { d: Dimension }) {
  return (
    <div className="card">
      <div className="row" style={{ gap: 14, marginBottom: 14 }}>
        <ScoreRing score={d.score} />
        <div className="grow">
          <div className="card-title">{d.title}</div>
          <div className="text-2">
            {d.label} · {d.score}/10
          </div>
          <div className="muted small">{d.base ? `sur ${eur(d.base, false)}` : 'aucune action suivie'}</div>
        </div>
      </div>
      {d.parts.length > 0 && (
        <RankBars
          rows={d.parts.slice(0, 7).map((p) => ({
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
      <p className="field-hint" style={{ marginBottom: 0 }}>
        {d.explain}
      </p>
    </div>
  );
}
