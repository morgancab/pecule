import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../store';
import { eur, eurCompact, eurSigned, fmtDate, monthLabel, monthShort, pct, pctSigned } from '../lib/format';

interface TipRow {
  label: string;
  value: string;
  color?: string;
}

function Tip({ title, rows }: { title: string; rows: TipRow[] }) {
  return (
    <div className="chart-tip">
      <div className="tip-title">{title}</div>
      {rows.map((r) => (
        <div className="tip-row" key={r.label}>
          <span>
            {r.color && <span className="swatch" style={{ background: r.color }} />}
            {r.label}
          </span>
          <strong>{r.value}</strong>
        </div>
      ))}
    </div>
  );
}

function useAxis() {
  const { chart } = useStore();
  return {
    tick: { fill: chart.muted, fontSize: 12 },
    axisLine: { stroke: chart.axis },
    grid: chart.grid,
  };
}

export function NetWorthChart({ series, height = 260 }: { series: { date: string; value: number }[]; height?: number }) {
  const { chart } = useStore();
  const ax = useAxis();
  const color = chart.series[0];
  const spanDays = series.length > 1 ? (Date.parse(series[series.length - 1].date) - Date.parse(series[0].date)) / 86400000 : 0;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={ax.grid} />
        <XAxis
          dataKey="date"
          tick={ax.tick}
          axisLine={ax.axisLine}
          tickLine={false}
          minTickGap={48}
          tickFormatter={(d: string) => (spanDays > 400 ? `${monthShort(d.slice(0, 7))} ${d.slice(2, 4)}` : spanDays > 200 ? monthShort(d.slice(0, 7)) : fmtDate(d, false))}
        />
        <YAxis tick={ax.tick} axisLine={false} tickLine={false} width={68} tickFormatter={eurCompact} domain={['auto', 'auto']} />
        <Tooltip
          cursor={{ stroke: chart.muted, strokeWidth: 1 }}
          content={(p: any) =>
            p.active && p.payload?.length ? (
              <Tip title={fmtDate(p.payload[0].payload.date)} rows={[{ label: 'Patrimoine net', value: eur(p.payload[0].value), color }]} />
            ) : null
          }
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={color}
          fillOpacity={0.1}
          dot={false}
          activeDot={{ r: 5, stroke: chart.surface, strokeWidth: 2, fill: color }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CashflowChart({ rows, height = 240 }: { rows: { month: string; income: number; expenses: number }[]; height?: number }) {
  const { chart } = useStore();
  const ax = useAxis();
  const [cIn, cOut] = [chart.series[0], chart.series[1]];
  return (
    <div>
      <div className="legend-inline" style={{ marginBottom: 10 }}>
        <span>
          <span className="swatch" style={{ background: cIn }} /> Revenus
        </span>
        <span>
          <span className="swatch" style={{ background: cOut }} /> Dépenses
        </span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={ax.grid} />
          <XAxis dataKey="month" tick={ax.tick} axisLine={ax.axisLine} tickLine={false} tickFormatter={(m: string) => monthShort(m)} />
          <YAxis tick={ax.tick} axisLine={false} tickLine={false} width={64} tickFormatter={eurCompact} />
          <Tooltip
            cursor={{ fill: chart.grid, fillOpacity: 0.5 }}
            content={(p: any) => {
              if (!p.active || !p.payload?.length) return null;
              const r = p.payload[0].payload;
              return (
                <Tip
                  title={monthLabel(r.month, true)}
                  rows={[
                    { label: 'Revenus', value: eur(r.income), color: cIn },
                    { label: 'Dépenses', value: eur(r.expenses), color: cOut },
                    { label: 'Solde', value: eur(r.income - r.expenses) },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="income" fill={cIn} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          <Bar dataKey="expenses" fill={cOut} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProjectionChart({ rows, rate, height = 240 }: { rows: { year: number; saved: number; invested: number }[]; rate: number; height?: number }) {
  const { chart } = useStore();
  const ax = useAxis();
  const [cInv, cSaved] = [chart.series[0], chart.series[1]];
  const invLabel = `Placé à ${String(rate).replace('.', ',')} %/an`;
  return (
    <div>
      <div className="legend-inline" style={{ marginBottom: 10 }}>
        <span>
          <span className="swatch" style={{ background: cInv }} /> {invLabel}
        </span>
        <span>
          <span className="swatch" style={{ background: cSaved }} /> Mis de côté sans placement
        </span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={ax.grid} />
          <XAxis dataKey="year" tick={ax.tick} axisLine={ax.axisLine} tickLine={false} tickFormatter={(y: number) => (y === 0 ? "Auj." : `${y} an${y > 1 ? 's' : ''}`)} minTickGap={24} />
          <YAxis tick={ax.tick} axisLine={false} tickLine={false} width={64} tickFormatter={eurCompact} />
          <Tooltip
            cursor={{ stroke: chart.muted, strokeWidth: 1 }}
            content={(p: any) => {
              if (!p.active || !p.payload?.length) return null;
              const r = p.payload[0].payload;
              return (
                <Tip
                  title={r.year === 0 ? "Aujourd'hui" : `Dans ${r.year} an${r.year > 1 ? 's' : ''}`}
                  rows={[
                    { label: invLabel, value: eur(r.invested, false), color: cInv },
                    { label: 'Sans placement', value: eur(r.saved, false), color: cSaved },
                  ]}
                />
              );
            }}
          />
          <Line type="monotone" dataKey="invested" stroke={cInv} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: chart.surface, strokeWidth: 2 }} isAnimationActive={false} />
          <Line type="monotone" dataKey="saved" stroke={cSaved} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: chart.surface, strokeWidth: 2 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Valeur future de versements mensuels constants. */
export function futureValue(monthlyAmount: number, ratePct: number, months: number): number {
  const i = ratePct / 100 / 12;
  if (i === 0) return monthlyAmount * months;
  return monthlyAmount * ((Math.pow(1 + i, months) - 1) / i);
}

export function projection(monthlyAmount: number, ratePct: number, years: number) {
  return Array.from({ length: years + 1 }, (_, y) => ({
    year: y,
    saved: monthlyAmount * 12 * y,
    invested: futureValue(monthlyAmount, ratePct, y * 12),
  }));
}

/** Variation du patrimoine entre deux relevés : hausse et baisse en deux teintes opposées. */
export function DeltaChart({ rows, height = 240 }: { rows: { date: string; amount: number; ratio: number }[]; height?: number }) {
  const { chart } = useStore();
  const ax = useAxis();
  const [up, down] = [chart.series[0], chart.series[7]];
  const long = rows.length > 24;
  return (
    <div>
      <div className="legend-inline" style={{ marginBottom: 10 }}>
        <span>
          <span className="swatch" style={{ background: up }} /> Hausse
        </span>
        <span>
          <span className="swatch" style={{ background: down }} /> Baisse
        </span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap={long ? '15%' : '25%'}>
          <CartesianGrid vertical={false} stroke={ax.grid} />
          <XAxis dataKey="date" tick={ax.tick} axisLine={ax.axisLine} tickLine={false} minTickGap={24} tickFormatter={(d: string) => (long ? monthShort(d.slice(0, 7)) + ' ' + d.slice(2, 4) : monthShort(d.slice(0, 7)))} />
          <YAxis tick={ax.tick} axisLine={false} tickLine={false} width={64} tickFormatter={eurCompact} />
          <ReferenceLine y={0} stroke={chart.axis} />
          <Tooltip
            cursor={{ fill: chart.grid, fillOpacity: 0.5 }}
            content={(p: any) => {
              if (!p.active || !p.payload?.length) return null;
              const r = p.payload[0].payload;
              return <Tip title={`Relevé du ${fmtDate(r.date)}`} rows={[{ label: 'Variation', value: `${eurSigned(r.amount, false)} (${pctSigned(r.ratio)})`, color: r.amount >= 0 ? up : down }]} />;
            }}
          />
          <Bar dataKey="amount" maxBarSize={24} isAnimationActive={false} radius={[4, 4, 4, 4]}>
            {rows.map((r) => (
              <Cell key={r.date} fill={r.amount >= 0 ? up : down} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Valeur de chaque grande classe d'actifs dans le temps (aires empilées). */
export function AllocationChart({ rows, groups, height = 260 }: { rows: Record<string, number | string>[]; groups: { id: string; label: string; color: string }[]; height?: number }) {
  const { chart } = useStore();
  const ax = useAxis();
  return (
    <div>
      <div className="legend-inline" style={{ marginBottom: 10 }}>
        {groups.map((g) => (
          <span key={g.id}>
            <span className="swatch" style={{ background: g.color }} /> {g.label}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={ax.grid} />
          <XAxis dataKey="date" tick={ax.tick} axisLine={ax.axisLine} tickLine={false} minTickGap={40} tickFormatter={(d: string) => monthShort(d.slice(0, 7)) + ' ' + d.slice(2, 4)} />
          <YAxis tick={ax.tick} axisLine={false} tickLine={false} width={64} tickFormatter={eurCompact} />
          <Tooltip
            cursor={{ stroke: chart.muted, strokeWidth: 1 }}
            content={(p: any) => {
              if (!p.active || !p.payload?.length) return null;
              const r = p.payload[0].payload;
              const total = groups.reduce((s, g) => s + Math.max(0, Number(r[g.id] ?? 0)), 0);
              return (
                <Tip
                  title={fmtDate(r.date)}
                  rows={[...groups]
                    .reverse()
                    .filter((g) => Number(r[g.id] ?? 0) > 0)
                    .map((g) => ({ label: g.label, value: `${eur(Number(r[g.id]), false)} · ${pct(Number(r[g.id]) / total, 0)}`, color: g.color }))}
                />
              );
            }}
          />
          {groups.map((g) => (
            <Area key={g.id} type="monotone" dataKey={g.id} stackId="1" stroke={g.color} strokeWidth={1.5} fill={g.color} fillOpacity={0.55} isAnimationActive={false} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Variation décomposée : épargne, effet des marchés, intérêts (barres empilées, négatif sous l'axe). */
export function SourcesChart({ rows, xKey, height = 240, xFormat }: { rows: Record<string, number | string>[]; xKey: string; height?: number; xFormat?: (v: string) => string }) {
  const { chart } = useStore();
  const ax = useAxis();
  const keys = [
    { key: 'savings', label: 'Épargne (argent nouveau)', color: chart.series[0] },
    { key: 'market', label: 'Marchés', color: chart.series[1] },
    { key: 'interest', label: 'Intérêts', color: chart.series[2] },
  ];
  return (
    <div>
      <div className="legend-inline" style={{ marginBottom: 10 }}>
        {keys.map((k) => (
          <span key={k.key}>
            <span className="swatch" style={{ background: k.color }} /> {k.label}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} stackOffset="sign" barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke={ax.grid} />
          <XAxis dataKey={xKey} tick={ax.tick} axisLine={ax.axisLine} tickLine={false} minTickGap={16} tickFormatter={xFormat} />
          <YAxis tick={ax.tick} axisLine={false} tickLine={false} width={64} tickFormatter={eurCompact} />
          <ReferenceLine y={0} stroke={chart.axis} />
          <Tooltip
            cursor={{ fill: chart.grid, fillOpacity: 0.5 }}
            content={(p: any) => {
              if (!p.active || !p.payload?.length) return null;
              const r = p.payload[0].payload;
              const total = Number(r.savings) + Number(r.market) + Number(r.interest);
              return (
                <Tip
                  title={xFormat ? xFormat(String(r[xKey])) : String(r[xKey])}
                  rows={[...keys.map((k) => ({ label: k.label, value: eurSigned(Number(r[k.key]), false), color: k.color })), { label: 'Variation totale', value: eurSigned(total, false) }]}
                />
              );
            }}
          />
          {keys.map((k) => (
            <Bar key={k.key} dataKey={k.key} stackId="s" fill={k.color} maxBarSize={28} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Patrimoine en euros courants et en euros d'aujourd'hui (corrigé de l'inflation). */
export function RealChart({ rows, height = 240 }: { rows: { date: string; nominal: number; real: number }[]; height?: number }) {
  const { chart } = useStore();
  const ax = useAxis();
  const [cN, cR] = [chart.series[0], chart.series[1]];
  return (
    <div>
      <div className="legend-inline" style={{ marginBottom: 10 }}>
        <span>
          <span className="swatch" style={{ background: cN }} /> Euros de l’époque
        </span>
        <span>
          <span className="swatch" style={{ background: cR }} /> Euros d’aujourd’hui (inflation déduite)
        </span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={ax.grid} />
          <XAxis dataKey="date" tick={ax.tick} axisLine={ax.axisLine} tickLine={false} minTickGap={40} tickFormatter={(d: string) => `${monthShort(d.slice(0, 7))} ${d.slice(2, 4)}`} />
          <YAxis tick={ax.tick} axisLine={false} tickLine={false} width={64} tickFormatter={eurCompact} domain={['auto', 'auto']} />
          <Tooltip
            cursor={{ stroke: chart.muted, strokeWidth: 1 }}
            content={(p: any) =>
              p.active && p.payload?.length ? (
                <Tip
                  title={fmtDate(p.payload[0].payload.date)}
                  rows={[
                    { label: 'Euros de l’époque', value: eur(p.payload[0].payload.nominal, false), color: cN },
                    { label: 'Euros d’aujourd’hui', value: eur(p.payload[0].payload.real, false), color: cR },
                  ]}
                />
              ) : null
            }
          />
          <Line type="monotone" dataKey="nominal" stroke={cN} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: chart.surface, strokeWidth: 2 }} isAnimationActive={false} />
          <Line type="monotone" dataKey="real" stroke={cR} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: chart.surface, strokeWidth: 2 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Courbe simple (une série) : le titre de la carte dit ce qui est tracé. */
export function SimpleLine({ rows, valueFormat, height = 180 }: { rows: { date: string; value: number }[]; valueFormat: (v: number) => string; height?: number }) {
  const { chart } = useStore();
  const ax = useAxis();
  const c = chart.series[0];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={ax.grid} />
        <XAxis dataKey="date" tick={ax.tick} axisLine={ax.axisLine} tickLine={false} minTickGap={40} tickFormatter={(d: string) => `${monthShort(d.slice(0, 7))} ${d.slice(2, 4)}`} />
        <YAxis tick={ax.tick} axisLine={false} tickLine={false} width={56} tickFormatter={(v: number) => valueFormat(v)} domain={['auto', 'auto']} />
        <Tooltip
          cursor={{ stroke: chart.muted, strokeWidth: 1 }}
          content={(p: any) => (p.active && p.payload?.length ? <Tip title={fmtDate(p.payload[0].payload.date)} rows={[{ label: 'Valeur', value: valueFormat(p.payload[0].value), color: c }]} /> : null)}
        />
        <Line type="monotone" dataKey="value" stroke={c} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: chart.surface, strokeWidth: 2 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}


/** Historique du patrimoine puis trois scénarios de projection (une seule échelle). */
export function ProjectionScenarioChart({
  rows,
  height = 300,
}: {
  rows: { date: string; history?: number; prudent?: number; central?: number; favorable?: number }[];
  height?: number;
}) {
  const { chart } = useStore();
  const ax = useAxis();
  const lines = [
    { key: 'history', label: 'Historique (ta feuille)', color: chart.neutral },
    { key: 'favorable', label: 'Favorable', color: chart.series[2] },
    { key: 'central', label: 'Central', color: chart.series[0] },
    { key: 'prudent', label: 'Prudent', color: chart.series[1] },
  ];
  return (
    <div>
      <div className="legend-inline" style={{ marginBottom: 10 }}>
        {lines.map((l) => (
          <span key={l.key}>
            <span className="swatch" style={{ background: l.color }} /> {l.label}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={ax.grid} />
          <XAxis dataKey="date" tick={ax.tick} axisLine={ax.axisLine} tickLine={false} minTickGap={48} tickFormatter={(d: string) => d.slice(0, 4)} />
          <YAxis tick={ax.tick} axisLine={false} tickLine={false} width={64} tickFormatter={eurCompact} domain={['auto', 'auto']} />
          <Tooltip
            cursor={{ stroke: chart.muted, strokeWidth: 1 }}
            content={(p: any) => {
              if (!p.active || !p.payload?.length) return null;
              const r = p.payload[0].payload;
              return (
                <Tip
                  title={fmtDate(r.date)}
                  rows={lines.filter((l) => typeof r[l.key] === 'number').map((l) => ({ label: l.label, value: eur(r[l.key], false), color: l.color }))}
                />
              );
            }}
          />
          {lines.map((l) => (
            <Line
              key={l.key}
              type="monotone"
              dataKey={l.key}
              stroke={l.color}
              strokeWidth={2}
              strokeDasharray={l.key === 'history' ? undefined : l.key === 'central' ? undefined : '5 4'}
              dot={false}
              connectNulls={false}
              activeDot={{ r: 4, stroke: chart.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
