import { useStore } from '../store';
import { eurCompact } from '../lib/format';

/** Jauge en demi-cercle : position (centile) parmi les ménages. */
export function PercentileGauge({ p, label }: { p: number; label: string }) {
  const { chart } = useStore();
  const W = 260;
  const R = 104;
  const cx = W / 2;
  const cy = 124;
  const pt = (t: number) => [cx - R * Math.cos(Math.PI * t), cy - R * Math.sin(Math.PI * t)];
  const arc = (t: number) => {
    const [x, y] = pt(t);
    return `M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
  };
  const t = Math.max(0.005, Math.min(1, p / 100));
  const [mx, my] = pt(t);
  return (
    <svg viewBox={`0 0 ${W} 150`} width="100%" style={{ maxWidth: 320, display: 'block', margin: '0 auto' }} role="img" aria-label={`${label} : ${Math.round(p)} sur 100`}>
      <path d={arc(1)} fill="none" stroke={chart.grid} strokeWidth={18} strokeLinecap="round" />
      <path d={arc(t)} fill="none" stroke={chart.series[0]} strokeWidth={18} strokeLinecap="round" className="gauge-arc" pathLength={1} />
      {[0.1, 0.5, 0.9].map((m) => {
        const [x1, y1] = [cx - (R - 16) * Math.cos(Math.PI * m), cy - (R - 16) * Math.sin(Math.PI * m)];
        const [x2, y2] = [cx - (R + 16) * Math.cos(Math.PI * m), cy - (R + 16) * Math.sin(Math.PI * m)];
        return <line key={m} x1={x1} y1={y1} x2={x2} y2={y2} stroke={chart.surface} strokeWidth={2} />;
      })}
      <circle cx={mx} cy={my} r={11} fill={chart.series[0]} stroke={chart.surface} strokeWidth={3} />
      <text x={cx} y={cy - 18} textAnchor="middle" fontSize={44} fontWeight={700} fill={chart.text} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {Math.round(p)}
        <tspan fontSize={20} dx={2}>
          %
        </tspan>
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle" fontSize={12} fill={chart.muted}>
        {label}
      </text>
      <text x={cx - R} y={cy + 24} textAnchor="middle" fontSize={11} fill={chart.muted}>
        0
      </text>
      <text x={cx + R} y={cy + 24} textAnchor="middle" fontSize={11} fill={chart.muted}>
        100
      </text>
    </svg>
  );
}

/**
 * Patrimoine par tranche d'âge : trait du 1er au 9e décile, point = médiane, ligne verticale = toi.
 * Échelle logarithmique (les montants vont de quelques milliers à plus d'un million).
 */
export function AgeRanges({ rows, mine, current }: { rows: { id: string; label: string; d1: number; median: number; d9: number }[]; mine: number; current: string }) {
  const { chart } = useStore();
  const W = 340;
  const L = 96; // colonne des libellés
  const R = 12;
  const rowH = 34;
  const top = 24;
  const H = top + rows.length * rowH + 30;
  const lo = Math.min(1000, ...rows.map((r) => r.d1), mine) * 0.8;
  const hi = Math.max(...rows.map((r) => r.d9), mine) * 1.25;
  const x = (v: number) => L + ((Math.log(Math.max(v, lo)) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * (W - L - R);
  const ticks = [1e3, 1e4, 1e5, 1e6].filter((t) => t >= lo && t <= hi);
  const me = x(mine);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Patrimoine des ménages par tranche d’âge, avec ta position">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={top} y2={H - 26} stroke={chart.grid} />
          <text x={x(t)} y={H - 10} textAnchor="middle" fontSize={11} fill={chart.muted}>
            {eurCompact(t)}
          </text>
        </g>
      ))}
      {rows.map((r, k) => {
        const y = top + k * rowH + rowH / 2;
        const on = r.id === current;
        const c = on ? chart.series[0] : chart.neutral;
        return (
          <g key={r.id}>
            <title>{`${r.label} : 10 % sous ${eurCompact(r.d1)}, médiane ${eurCompact(r.median)}, 10 % au-dessus de ${eurCompact(r.d9)}`}</title>
            <text x={0} y={y + 4} fontSize={12} fontWeight={on ? 600 : 400} fill={on ? chart.text : chart.text2}>
              {r.label.replace(' ans ou plus', ' ans +').replace('Moins de ', '< ')}
            </text>
            <line x1={x(r.d1)} x2={x(r.d9)} y1={y} y2={y} stroke={c} strokeOpacity={on ? 0.55 : 0.4} strokeWidth={8} strokeLinecap="round" />
            <circle cx={x(r.median)} cy={y} r={on ? 7 : 6} fill={c} stroke={chart.surface} strokeWidth={2} />
          </g>
        );
      })}
      <line x1={me} x2={me} y1={18} y2={H - 26} stroke={chart.text} strokeWidth={2} strokeDasharray="4 4" />
      <text x={Math.min(W - 16, Math.max(L + 14, me))} y={12} textAnchor="middle" fontSize={11} fontWeight={600} fill={chart.text} style={{ paintOrder: 'stroke', stroke: chart.surface, strokeWidth: 4 }}>
        Toi
      </text>
    </svg>
  );
}
