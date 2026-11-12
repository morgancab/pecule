import { useEffect, type ReactNode } from 'react';
import { TrendingDown, TrendingUp, X } from 'lucide-react';
import { eur, eurSigned, pct, pctSigned } from '../lib/format';
import { inkOn } from '../lib/theme';
import { useStore } from '../store';

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, icon }: { label: ReactNode; value: ReactNode; sub?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="card tight stat">
      <div className="stat-label">
        {icon}
        {label}
      </div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

/** Variation : couleur = sens × « est-ce une bonne nouvelle ». Toujours accompagnée d'une flèche. */
export function Delta({ value, ratio, upIsGood = true, suffix }: { value: number; ratio?: number; upIsGood?: boolean; suffix?: ReactNode }) {
  const up = value > 0.005;
  const down = value < -0.005;
  const good = (up && upIsGood) || (down && !upIsGood);
  const cls = up || down ? (good ? 'good' : 'bad') : 'muted';
  return (
    <span className={`delta ${cls}`}>
      {up ? <TrendingUp size={15} /> : down ? <TrendingDown size={15} /> : null}
      {eurSigned(value)}
      {ratio !== undefined && Number.isFinite(ratio) && <span>({pctSigned(ratio)})</span>}
      {suffix && <span className="muted" style={{ fontWeight: 400 }}>{suffix}</span>}
    </span>
  );
}

export function Empty({ title, text, children }: { title: string; text?: ReactNode; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}

export function Avatar({ name }: { name: string }) {
  const letters = name
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return <span className="avatar">{letters || '•'}</span>;
}

export interface Part {
  id: string;
  label: string;
  value: number;
  color: string;
}

/** Barre segmentée (un tout découpé en parts) + légende chiffrée qui sert aussi de tableau. */
export function SegmentedBar({ parts, showLegend = true, legendExtra }: { parts: Part[]; showLegend?: boolean; legendExtra?: (p: Part) => ReactNode }) {
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0);
  const visible = parts.filter((p) => p.value > 0);
  if (!total) return null;
  return (
    <div>
      <div className="segbar" role="img" aria-label={visible.map((p) => `${p.label} ${pct(p.value / total, 0)}`).join(', ')}>
        {visible.map((p) => {
          const share = p.value / total;
          return (
            <div
              key={p.id}
              style={{ width: `${share * 100}%`, background: p.color, color: inkOn(p.color) }}
              title={`${p.label} : ${eur(p.value)} (${pct(share)})`}
            >
              {share >= 0.09 ? pct(share, 0) : ''}
            </div>
          );
        })}
      </div>
      {showLegend && (
        <div className="legend">
          {visible.map((p) => (
            <div className="legend-row" key={p.id}>
              <span className="swatch" style={{ background: p.color }} />
              <span className="ellipsis">{p.label}</span>
              <span className="tnum">{legendExtra ? legendExtra(p) : eur(p.value, false)}</span>
              <span className="share">{pct(p.value / total, 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export interface RankRow {
  id: string;
  label: ReactNode;
  value: number;
  display?: ReactNode;
  dim?: boolean;
  title?: string;
}

/** Barres horizontales classées (une seule teinte : on compare des grandeurs). */
export function RankBars({ rows, max }: { rows: RankRow[]; max?: number }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="rank">
      {rows.map((r) => (
        <div className="rank-row" key={r.id} title={r.title}>
          <span className="ellipsis">{r.label}</span>
          <div className="rank-track">
            <div className={`rank-fill${r.dim ? ' dim' : ''}`} style={{ width: `${Math.max(0, (r.value / top) * 100)}%` }} />
          </div>
          <span className="tnum nowrap">{r.display ?? eur(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)} role="tab" aria-selected={o.value === value}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useStore();
  if (!toasts.length) return null;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div className="toast" key={t.id}>
          <span className="grow">{t.message}</span>
          {t.action && (
            <button
              className="btn btn-sm btn-primary"
              onClick={() => {
                t.action!.onClick();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="icon-btn" onClick={() => dismissToast(t.id)} aria-label="Fermer">
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Champ numérique qui accepte la virgule française. */
export function MoneyInput({ value, onChange, placeholder, autoFocus, id }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; id?: string }) {
  return (
    <input
      id={id}
      inputMode="decimal"
      value={value}
      placeholder={placeholder ?? '0,00'}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9,.\-\s]/g, ''))}
    />
  );
}

export function toNumber(s: string): number {
  const n = parseFloat(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export function fromNumber(n: number | undefined): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '';
  return String(Math.round(n * 1e8) / 1e8).replace('.', ',');
}

/** Score sur 10 en anneau (couleur selon le niveau, libellé à côté : jamais la couleur seule). */
export function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 6 ? 'var(--good)' : score >= 4 ? 'var(--warning)' : 'var(--critical)';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${score} sur 10`} style={{ flex: 'none' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={6} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={`${(c * Math.max(0, Math.min(10, score))) / 10} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size * 0.28} fontWeight={650} fill="var(--text)">
        {score}
      </text>
    </svg>
  );
}

