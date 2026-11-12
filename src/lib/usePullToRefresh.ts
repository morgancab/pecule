import { useEffect, useRef, useState } from 'react';

const TRIGGER = 72; // px à tirer pour déclencher

/**
 * « Tirer pour actualiser » façon iPhone : en haut de la page, glisser vers le bas puis relâcher.
 * Renvoie la distance tirée (pour l'indicateur) ; `onRefresh` est appelé au relâchement au-delà du seuil.
 */
export function usePullToRefresh(onRefresh: () => void, disabled = false) {
  const [pull, setPull] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const pullRef = useRef(0);
  const cb = useRef(onRefresh);
  cb.current = onRefresh;

  useEffect(() => {
    if (disabled) return;
    const set = (v: number) => {
      pullRef.current = v;
      setPull(v);
    };
    const down = (e: TouchEvent) => {
      // seulement tout en haut de la page, et pas dans une fenêtre ouverte
      if (window.scrollY > 0 || e.touches.length !== 1 || document.querySelector('.backdrop')) return;
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const move = (e: TouchEvent) => {
      if (!start.current) return;
      const dy = e.touches[0].clientY - start.current.y;
      const dx = e.touches[0].clientX - start.current.x;
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || window.scrollY > 0) {
        if (pullRef.current) set(0);
        if (dy < 0 || Math.abs(dx) > Math.abs(dy)) start.current = null;
        return;
      }
      set(Math.min(110, dy * 0.5)); // résistance, comme sur iOS
    };
    const up = () => {
      if (start.current && pullRef.current >= TRIGGER) cb.current();
      start.current = null;
      set(0);
    };
    window.addEventListener('touchstart', down, { passive: true });
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', up);
    window.addEventListener('touchcancel', up);
    return () => {
      window.removeEventListener('touchstart', down);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
      window.removeEventListener('touchcancel', up);
    };
  }, [disabled]);

  return { pull, ready: pull >= TRIGGER };
}
