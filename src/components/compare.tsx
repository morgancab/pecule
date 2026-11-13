import { useStore } from '../store';
import { eurCompact } from '../lib/format';
import { wealthModel } from '../lib/insights';

/**
 * Courbe en cloche (barres) des ménages, en échelle logarithmique : chaque barre = part des ménages
 * dans cette tranche de patrimoine. En couleur : ceux qui ont moins que toi ; en plein : ta barre.
 */
export function BellChart({ bracket: b, mine }: { bracket: { d1: number; median: number; d9: number }; mine: number }) {
  const { chart } = useStore();
  const m = wealthModel(b);
  const W = 340;
  const H = 190;
  const base = H - 30;
  const N = 30;
  let x0 = m.mu - 2.4 * m.sLow;
  let x1 = m.mu + 2.6 * m.sHigh;
  const xm = Math.log(Math.max(1, mine));
  x0 = Math.min(x0, xm - 0.3);
  x1 = Math.max(x1, xm + 0.3);
  const step = (x1 - x0) / N;
  const raw = Array.from({ length: N }, (_, k) => {
    const a = x0 + k * step;
    return m.cdf(Math.exp(a + step)) - m.cdf(Math.exp(a));
  });
  // lissage léger (noyau gaussien) : le modèle a une cassure à la médiane, la vraie distribution non
  const kernel = [0.06, 0.12, 0.2, 0.24, 0.2, 0.12, 0.06];
  const bins = raw.map((_, k) => ({
    mass: kernel.reduce((s, w, j) => {
      const i = k + j - 3;
      return i >= 0 && i < N ? s + w * raw[i] : s;
    }, 0),
  }));
  const peak = Math.max(...bins.map((x) => x.mass));
  const px = (x: number) => ((x - x0) / (x1 - x0)) * W;
  const bw = W / N;
  const meIdx = Math.min(N - 1, Math.max(0, Math.floor((xm - x0) / step)));
  const ticks = [1e3, 1e4, 1e5, 1e6, 1e7].filter((t) => Math.log(t) > x0 + step && Math.log(t) < x1 - step);
  const meX = px(xm);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Répartition des ménages selon leur patrimoine, avec ta position">
      {bins.map((bin, k) => {
        const h = (bin.mass / peak) * (base - 28);
        const below = k < meIdx;
        const me = k === meIdx;
        return (
          <rect
            key={k}
            className="bell-bar"
            style={{ animationDelay: `${k * 0.02}s` }}
            x={k * bw + 1}
            y={base - h}
            width={bw - 2}
            height={Math.max(1, h)}
            rx={2}
            fill={me ? chart.series[0] : below ? chart.series[0] : chart.neutral}
            fillOpacity={me ? 1 : below ? 0.45 : 0.35}
          />
        );
      })}
      <line x1={0} x2={W} y1={base} y2={base} stroke={chart.axis} />
      {/* repère médiane */}
      <line x1={px(m.mu)} x2={px(m.mu)} y1={base} y2={base + 5} stroke={chart.muted} />
      {ticks.map((t) => (
        <text key={t} x={px(Math.log(t))} y={base + 18} textAnchor="middle" fontSize={11} fill={chart.muted}>
          {eurCompact(t)}
        </text>
      ))}
      {/* toi */}
      <line x1={meX} x2={meX} y1={14} y2={base} stroke={chart.text} strokeWidth={1.5} strokeDasharray="3 3" />
      <text x={Math.min(W - 14, Math.max(14, meX))} y={10} textAnchor="middle" fontSize={12} fontWeight={600} fill={chart.text}>
        Toi
      </text>
    </svg>
  );
}
