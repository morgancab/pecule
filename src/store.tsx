import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppData } from './types';
import { emptyData, ensureShape } from './lib/data';
import { CHART, type ChartTheme } from './lib/theme';
import { AuthError, getSession, getSheet, login as apiLogin, logout as apiLogout, putPrefs } from './lib/api';
import { buildFromSheet, prefsOf, type Prefs } from './lib/sheetData';
import { fmtDate, setAmountsHidden } from './lib/format';

/**
 * État de l'app :
 * - source : la feuille Google (relue à l'ouverture et à la demande) ;
 * - réglages (noms, types, références, préférences) : enregistrés dans le compte Google via le script ;
 * - cache local sur l'appareil pour un affichage immédiat (effacé à la déconnexion).
 */

const CACHE_KEY = 'pecule-cache';
const LS_THEME = 'pecule-theme';
const LS_HIDDEN = 'pecule-hide-amounts';

export type SaveState = 'saved' | 'saving' | 'error' | 'offline';
export type AuthState = 'checking' | 'login' | 'misconfigured' | 'ready';

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; onClick: () => void };
}

interface Store {
  data: AppData;
  update: (fn: (d: AppData) => AppData) => void;
  sync: () => Promise<string>;
  syncing: boolean;
  saveState: SaveState;
  auth: AuthState;
  authError: string;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  theme: 'dark' | 'light';
  chart: ChartTheme;
  notify: (message: string, action?: Toast['action']) => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;
  /** Mode discret : montants en euros masqués (les % restent visibles). Mémorisé sur cet appareil. */
  hidden: boolean;
  toggleHidden: () => void;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore hors du StoreProvider');
  return s;
}

function readCache(): AppData | null {
  try {
    const s = localStorage.getItem(CACHE_KEY);
    return s ? ensureShape(JSON.parse(s)) : null;
  } catch {
    return null;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => readCache() ?? emptyData());
  const [auth, setAuth] = useState<AuthState>('checking');
  const [authError, setAuthError] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [syncing, setSyncing] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [systemLight, setSystemLight] = useState(() => window.matchMedia('(prefers-color-scheme: light)').matches);
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(LS_HIDDEN) === '1';
    } catch {
      return false;
    }
  });
  setAmountsHidden(hidden); // avant le rendu des pages : tous les montants passent par lib/format
  const toggleHidden = useCallback(() => {
    setHidden((h) => {
      try {
        localStorage.setItem(LS_HIDDEN, h ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !h;
    });
  }, []);
  const savedPrefs = useRef<string | null>(null); // réglages tels qu'enregistrés côté Google
  const dataRef = useRef(data);
  dataRef.current = data;

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const notify = useCallback(
    (message: string, action?: Toast['action']) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.slice(-2), { id, message, action }]);
      setTimeout(() => dismissToast(id), action ? 9000 : 4500);
    },
    [dismissToast],
  );

  const onAuthError = useCallback((e: unknown) => {
    if (e instanceof AuthError) {
      setAuth('login');
      return true;
    }
    return false;
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const r = await getSheet();
      const { data: next, parsed } = buildFromSheet(r.values, (r.prefs as Prefs) ?? null, dataRef.current);
      savedPrefs.current = r.prefs ? JSON.stringify(prefsOf(next)) : null;
      setData(next);
      setSaveState('saved');
      const last = parsed.dates[parsed.dates.length - 1];
      return `Feuille synchronisée : ${parsed.columns.length} comptes, dernier relevé le ${last ? fmtDate(last) : '?'}.`;
    } catch (e) {
      if (!onAuthError(e)) setSaveState('offline');
      throw e;
    } finally {
      setSyncing(false);
    }
  }, [onAuthError]);

  // Démarrage : session, puis lecture de la feuille
  useEffect(() => {
    (async () => {
      try {
        const s = await getSession();
        if (!s.configured) {
          setAuthError(s.error ?? 'Configuration incomplète.');
          setAuth('misconfigured');
          return;
        }
        if (!s.authenticated) {
          setAuth('login');
          return;
        }
        setAuth('ready');
        sync().catch((e) => !(e instanceof AuthError) && notify(`Feuille Google : ${(e as Error).message}`));
      } catch {
        // hors ligne : on affiche le cache de l'appareil s'il existe
        if (readCache()) {
          setAuth('ready');
          setSaveState('offline');
        } else setAuth('login');
      }
    })();
  }, [sync, notify]);

  // Cache de l'appareil + enregistrement des réglages (différé d'une seconde)
  useEffect(() => {
    if (auth !== 'ready') return;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch {
      /* stockage plein ou indisponible */
    }
    const prefs = JSON.stringify(prefsOf(data));
    if (!data.accounts.length || prefs === savedPrefs.current) return;
    setSaveState('saving');
    const t = setTimeout(async () => {
      try {
        await putPrefs(JSON.parse(prefs));
        savedPrefs.current = prefs;
        setSaveState('saved');
      } catch (e) {
        if (!onAuthError(e)) setSaveState('error');
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [data, auth, onAuthError]);

  const login = useCallback(
    async (password: string) => {
      await apiLogin(password);
      setAuth('ready');
      await sync().catch((e) => notify(`Feuille Google : ${(e as Error).message}`));
    },
    [sync, notify],
  );

  const logout = useCallback(async () => {
    await apiLogout().catch(() => undefined);
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      /* ignore */
    }
    savedPrefs.current = null;
    setData(emptyData());
    setAuth('login');
  }, []);

  // Thème
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const h = () => setSystemLight(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  const pref = data.settings.theme ?? 'dark';
  const theme: 'dark' | 'light' = pref === 'system' ? (systemLight ? 'light' : 'dark') : pref;
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0d0d0d' : '#f3f3f0');
    try {
      localStorage.setItem(LS_THEME, pref);
    } catch {
      /* ignore */
    }
  }, [theme, pref]);

  const update = useCallback((fn: (d: AppData) => AppData) => {
    setData((d) => ({ ...fn(d), updatedAt: new Date().toISOString() }));
  }, []);

  const value = useMemo<Store>(
    () => ({ data, update, sync, syncing, saveState, auth, authError, login, logout, theme, chart: CHART[theme], notify, toasts, dismissToast, hidden, toggleHidden }),
    [data, update, sync, syncing, saveState, auth, authError, login, logout, theme, notify, toasts, dismissToast, hidden, toggleHidden],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
