import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { useStore } from '../store';
import { MASK, amountsHidden, eur, eurCompact, eurSigned, monthLabel, pctSigned } from '../lib/format';

// ---------- Mosaïque des comptes (treemap « squarified », taille = montant, couleur = variation 12 mois) ----------

export interface Tile {
  id: string;
  label: string;
  value: number;
  change: number | null; // variation sur 12 mois (ratio)
}

interface Rect {
  tile: Tile;
  x: number;
  y: number;
  w: number;
  h: number;
}

function squarify(tiles: Tile[], W: number, H: number): Rect[] {
  const total = tiles.reduce((s, t) => s + t.value, 0);
  if (!total || W <= 0 || H <= 0) return [];
  const items = [...tiles].sort((a, b) => b.value - a.value).map((t) => ({ t, area: (t.value / total) * W * H }));
  const out: Rect[] = [];
  const worst = (row: typeof items, side: number) => {
    const s = row.reduce((a, r) => a + r.area, 0);
    return Math.max(...row.map((r) => Math.max((side * side * r.area) / (s * s), (s * s) / (side * side * r.area))));
  };
  let x = 0;
  let y = 0;
  let w = W;
  let h = H;
  let i = 0;
  while (i < items.length) {
    const side = Math.min(w, h);
    const row = [items[i++]];
    while (i < items.length && worst([...row, items[i]], side) <= worst(row, side)) row.push(items[i++]);
    const s = row.reduce((a, r) => a + r.area, 0);
    if (w >= h) {
      const cw = s / h;
      let cy = y;
      for (const r of row) {
        const rh = r.area / cw;
        out.push({ tile: r.t, x, y: cy, w: cw, h: rh });
        cy += rh;
      }
      x += cw;
      w -= cw;
    } else {
      const rh = s / w;
      let cx = x;
      for (const r of row) {
        const rw = r.area / rh;
        out.push({ tile: r.t, x: cx, y, w: rw, h: rh });
        cx += rw;
      }
      y += rh;
      h -= rh;
    }
  }
  return out;
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

export function AccountMosaic({ tiles, height = 260, onSelect }: { tiles: Tile[]; height?: number; onSelect?: (id: string) => void }) {
  const { chart } = useStore();
  const { ref, width } = useWidth();
  const [up, down] = [chart.series[0], chart.series[7]];
  const rects = squarify(
    tiles.filter((t) => t.value > 0),
    width,
    height,
  );
  const fillOf = (c: number | null) => {
    if (c === null || Math.abs(c) < 0.005) return { fill: chart.neutral, opacity: 0.35 };
    const strength = Math.min(1, Math.abs(c) / 0.25);
    return { fill: c > 0 ? up : down, opacity: 0.2 + 0.45 * strength };
  };
  return (
    <div>
      <div ref={ref} style={{ width: '100%' }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label="Mosaïque des comptes : taille selon le montant, couleur selon la variation sur 12 mois">
            {rects.map(({ tile, x, y, w, h }) => {
              const f = fillOf(tile.change);
              const big = w > 44 && h > 34;
              const tall = w > 44 && h > 54;
              return (
                <g key={tile.id} onClick={() => onSelect?.(tile.id)} style={{ cursor: onSelect ? 'pointer' : undefined }}>
                  <title>{`${tile.label} : ${eur(tile.value, false)}${tile.change !== null ? ` · ${pctSigned(tile.change)} sur 12 mois` : ''}`}</title>
                  <rect x={x + 1} y={y + 1} width={Math.max(0, w - 2)} height={Math.max(0, h - 2)} rx={4} fill={chart.surface} />
                  <rect x={x + 1} y={y + 1} width={Math.max(0, w - 2)} height={Math.max(0, h - 2)} rx={4} fill={f.fill} fillOpacity={f.opacity} />
                  {big && (
                    <>
                      <text x={x + 8} y={y + 18} fontSize={12} fontWeight={500} fill={chart.text}>
                        {clip(tile.label, w - 14)}
                      </text>
                      <text x={x + 8} y={y + 33} fontSize={11} fill={chart.text2} style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {eurCompact(tile.value)}
                      </text>
                      {tall && tile.change !== null && (
                        <text x={x + 8} y={y + 48} fontSize={11} fill={chart.text2} style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {pctSigned(tile.change)}
                        </text>
                      )}
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>
      <div className="legend-inline" style={{ marginTop: 10 }}>
        <span>
          <span className="swatch" style={{ background: up }} /> En hausse
        </span>
        <span>
          <span className="swatch" style={{ background: down }} /> En baisse
        </span>
        <span className="muted">Taille : montant · couleur : 12 mois</span>
      </div>
    </div>
  );
}

/** Coupe un libellé pour qu'il tienne dans la tuile (≈ 6,5 px par caractère à 12 px). */
function clip(s: string, px: number) {
  const max = Math.max(3, Math.floor(px / 6.5));
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// ---------- Calendrier des mois ----------

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

/** +15,2 k€ : montant court pour la colonne des totaux annuels. */
function kSigned(n: number) {
  if (amountsHidden()) return `${n > 0 ? '+' : n < 0 ? '−' : ''}${MASK} €`;
  const s = Math.abs(n) < 1000 ? `${Math.round(Math.abs(n))} €` : `${(Math.abs(n) / 1000).toFixed(1).replace('.', ',')} k€`;
  return (n > 0 ? '+' : n < 0 ? '−' : '') + s;
}

export function MonthCalendar({ cells, years, yearTotals }: { cells: Map<string, number>; years: string[]; yearTotals: Map<string, { amount: number; ratio: number }> }) {
  const { chart } = useStore();
  const [up, down] = [chart.series[0], chart.series[7]];
  const keys = [...cells.keys()].sort();
  const [selected, setSelected] = useState<string>(keys[keys.length - 1]);
  const abs = [...cells.values()].map(Math.abs).sort((a, b) => a - b);
  const cap = abs[Math.floor(abs.length * 0.9)] || 1;
  const sel = cells.get(selected);
  return (
    <div>
      <div className="cal" role="grid">
        <span />
        {MONTHS.map((m, i) => (
          <span key={i} className="cal-head">
            {m}
          </span>
        ))}
        <span className="cal-head cal-total">Année</span>
        {years.map((y) => (
          <Row key={y} year={y}>
            {MONTHS.map((_, i) => {
              const key = `${y}-${String(i + 1).padStart(2, '0')}`;
              const v = cells.get(key);
              const style =
                v === undefined
                  ? undefined
                  : { background: `color-mix(in srgb, ${v >= 0 ? up : down} ${Math.round(25 + 75 * Math.min(1, Math.abs(v) / cap))}%, var(--surface-2))` };
              return (
                <button
                  key={key}
                  className={`cal-cell${v === undefined ? ' empty' : ''}${key === selected ? ' on' : ''}`}
                  style={style}
                  disabled={v === undefined}
                  onClick={() => setSelected(key)}
                  aria-label={v === undefined ? monthLabel(key) : `${monthLabel(key)} : ${eurSigned(v, false)}`}
                />
              );
            })}
            {(() => {
              const t = yearTotals.get(y);
              if (!t) return <span />;
              return (
                <span className="cal-total" title={`${y} : ${eurSigned(t.amount, false)} (${pctSigned(t.ratio)})`}>
                  <span className={t.amount >= 0 ? 'good' : 'bad'}>{kSigned(t.amount)}</span>
                  <span className="muted">{pctSigned(t.ratio, 0)}</span>
                </span>
              );
            })()}
          </Row>
        ))}
      </div>
      <div className="row between small" style={{ marginTop: 12 }}>
        <span className="text-2">{monthLabel(selected, true)}</span>
        {sel !== undefined && <strong className={`tnum ${sel >= 0 ? 'good' : 'bad'}`}>{eurSigned(sel, false)}</strong>}
      </div>
    </div>
  );
}

function Row({ year, children }: { year: string; children: ReactNode }) {
  return (
    <>
      <span className="cal-year">{year}</span>
      {children}
    </>
  );
}

// ---------- Cascade ----------

export function BridgeChart({ savings, market, interest, height = 220 }: { savings: number; market: number; interest: number; height?: number }) {
  const { chart } = useStore();
  const steps = [
    { label: 'Épargne', value: savings, color: chart.series[0] },
    { label: 'Marchés', value: market, color: chart.series[1] },
    { label: 'Intérêts', value: interest, color: chart.series[2] },
  ];
  let run = 0;
  const rows = steps.map((s) => {
    const a = run;
    run += s.value;
    return { label: s.label, range: [Math.min(a, run), Math.max(a, run)], value: s.value, color: s.color };
  });
  rows.push({ label: 'Variation', range: [Math.min(0, run), Math.max(0, run)], value: run, color: chart.neutral });
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 22, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={chart.grid} />
        <XAxis dataKey="label" tick={{ fill: chart.muted, fontSize: 12 }} axisLine={{ stroke: chart.axis }} tickLine={false} />
        <YAxis tick={{ fill: chart.muted, fontSize: 12 }} axisLine={false} tickLine={false} width={56} tickFormatter={eurCompact} />
        <ReferenceLine y={0} stroke={chart.axis} />
        <Bar
          dataKey="range"
          isAnimationActive={false}
          radius={[4, 4, 4, 4]}
          maxBarSize={56}
          label={(p: any) => {
            const r = rows[p.index];
            return (
              <text x={p.x + p.width / 2} y={p.y - 6} textAnchor="middle" fontSize={12} fill={chart.text2} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {eurSigned(r.value, false)}
              </text>
            );
          }}
        >
          {rows.map((r) => (
            <Cell key={r.label} fill={r.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
