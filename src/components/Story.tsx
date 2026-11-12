import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { X } from 'lucide-react';

export interface StorySlide {
  key: string;
  bg: string; // fond de l'écran
  fg: string; // texte et graphiques
  deco?: 'circles' | 'rings' | 'stripes' | 'half' | 'grid' | 'burst';
  body: ReactNode;
}

const DURATION = 7; // secondes par écran

/** Lecteur plein écran façon « stories » : barres de progression, touche à droite/gauche, maintien pour mettre en pause. */
export function StoryViewer({ slides, onClose }: { slides: StorySlide[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const s = slides[i];
  const next = () => (i < slides.length - 1 ? setI(i + 1) : onClose());
  const prev = () => setI(Math.max(0, i - 1));

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === ' ') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', h);
      document.body.style.overflow = '';
    };
  });

  return (
    <div className="wrap-story" style={{ background: s.bg, color: s.fg } as CSSProperties} role="dialog" aria-modal="true" aria-label="Ton année">
      <Deco kind={s.deco} color={s.fg} key={`d-${s.key}`} />
      <div className="wrap-bars">
        {slides.map((x, k) => (
          <span key={x.key} className="wrap-bar" style={{ background: `color-mix(in srgb, ${s.fg} 28%, transparent)` }}>
            <span
              className={`wrap-fill${k === i ? ' run' : ''}`}
              style={{
                background: s.fg,
                width: k < i ? '100%' : k > i ? '0%' : undefined,
                animationDuration: `${DURATION}s`,
                animationPlayState: paused ? 'paused' : 'running',
              }}
              onAnimationEnd={k === i ? next : undefined}
            />
          </span>
        ))}
      </div>
      <button className="wrap-close" onClick={onClose} aria-label="Fermer" style={{ color: s.fg }}>
        <X size={24} />
      </button>
      <div
        className="wrap-tap"
        onPointerDown={() => setPaused(true)}
        onPointerUp={(e) => {
          setPaused(false);
          const r = e.currentTarget.getBoundingClientRect();
          if (e.clientX - r.left < r.width * 0.3) prev();
          else next();
        }}
        onPointerLeave={() => setPaused(false)}
      />
      <div className="wrap-body" key={s.key}>
        {s.body}
      </div>
    </div>
  );
}

/** Formes géométriques de fond, dans la couleur du texte, très transparentes. */
function Deco({ kind, color }: { kind?: StorySlide['deco']; color: string }) {
  const c = { fill: 'none', stroke: color, strokeOpacity: 0.22 };
  return (
    <svg className="wrap-deco" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {kind === 'circles' && (
        <>
          <circle cx="360" cy="120" r="150" fill={color} fillOpacity={0.12} />
          <circle cx="40" cy="700" r="110" fill={color} fillOpacity={0.1} />
        </>
      )}
      {kind === 'rings' &&
        [60, 110, 160, 210, 260].map((r) => <circle key={r} cx="330" cy="660" r={r} {...c} strokeWidth={14} />)}
      {kind === 'stripes' &&
        [0, 1, 2, 3, 4, 5].map((k) => <rect key={k} x={-100 + k * 90} y="-50" width="40" height="1000" fill={color} fillOpacity={0.08} transform="rotate(25 200 400)" />)}
      {kind === 'half' && (
        <>
          <path d="M 0 800 A 200 200 0 0 1 400 800 Z" fill={color} fillOpacity={0.12} />
          <circle cx="330" cy="140" r="46" fill={color} fillOpacity={0.18} />
        </>
      )}
      {kind === 'grid' &&
        Array.from({ length: 8 }, (_, r) => Array.from({ length: 5 }, (_, k) => <circle key={`${r}-${k}`} cx={40 + k * 80} cy={80 + r * 95} r="5" fill={color} fillOpacity={0.25} />))}
      {kind === 'burst' &&
        Array.from({ length: 16 }, (_, k) => {
          const a = (k / 16) * Math.PI * 2;
          return <line key={k} x1={200 + Math.cos(a) * 120} y1={400 + Math.sin(a) * 120} x2={200 + Math.cos(a) * 420} y2={400 + Math.sin(a) * 420} stroke={color} strokeOpacity={0.12} strokeWidth={18} />;
        })}
    </svg>
  );
}

/** Petite courbe (patrimoine de l'année). */
export function Spark({ values, color, height = 120 }: { values: number[]; color: string; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const W = 320;
  const pts = values.map((v, k) => [(k / (values.length - 1)) * (W - 12) + 6, height - 8 - ((v - min) / (max - min || 1)) * (height - 16)]);
  const d = pts.map((p, k) => `${k ? 'L' : 'M'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} className="wrap-draw" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" pathLength={1} />
      <circle cx={last[0]} cy={last[1]} r={8} fill={color} />
    </svg>
  );
}

/** 12 barres : variation de chaque mois (le meilleur en plein, les autres atténués). */
export function MonthBars({ values, color, best }: { values: (number | null)[]; color: string; best: number }) {
  const max = Math.max(1, ...values.map((v) => Math.abs(v ?? 0)));
  const H = 150;
  const mid = H * 0.62; // plus de place pour les hausses
  const letters = 'JFMAMJJASOND';
  return (
    <svg viewBox={`0 0 320 ${H + 22}`} width="100%" aria-hidden="true">
      <line x1="0" x2="320" y1={mid} y2={mid} stroke={color} strokeOpacity={0.4} strokeWidth={2} />
      {values.map((v, k) => {
        const x = 6 + k * 26;
        const h = v === null ? 0 : (Math.abs(v) / max) * (v >= 0 ? mid - 6 : H - mid - 6);
        return (
          <g key={k}>
            {v !== null && (
              <rect className="wrap-grow" style={{ animationDelay: `${0.15 + k * 0.04}s`, transformOrigin: `${x + 9}px ${mid}px` }} x={x} y={v >= 0 ? mid - h : mid} width={18} height={Math.max(2, h)} rx={4} fill={color} fillOpacity={k === best ? 1 : 0.45} />
            )}
            <text x={x + 9} y={H + 18} textAnchor="middle" fontSize={12} fontWeight={600} fill={color} fillOpacity={k === best ? 1 : 0.6}>
              {letters[k]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
