import { useEffect, useState } from 'react';
import { ChartLine, ChartPie, FileText, LayoutDashboard, Lock, PiggyBank, Settings as SettingsIcon, TrendingUp, Wallet } from 'lucide-react';
import { useStore } from './store';
import { Toasts } from './components/ui';
import Dashboard from './pages/Dashboard';
import Patrimoine from './pages/Patrimoine';
import Analyses from './pages/Analyses';
import Projection from './pages/Projection';
import Diversification from './pages/Diversification';
import Rapports from './pages/Rapports';
import Reglages from './pages/Reglages';

export type Route = 'dashboard' | 'patrimoine' | 'analyses' | 'projection' | 'diversification' | 'rapports' | 'reglages';

const ROUTES: { id: Route; label: string; icon: typeof Wallet }[] = [
  { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { id: 'patrimoine', label: 'Patrimoine', icon: Wallet },
  { id: 'analyses', label: 'Analyses', icon: ChartLine },
  { id: 'projection', label: 'Projection', icon: TrendingUp },
  { id: 'diversification', label: 'Diversification', icon: ChartPie },
  { id: 'rapports', label: 'Rapports', icon: FileText },
  { id: 'reglages', label: 'Réglages', icon: SettingsIcon },
];

function parse(hash: string): Route {
  const id = hash.replace(/^#\/?/, '').split('?')[0];
  return (ROUTES.find((r) => r.id === id)?.id ?? 'dashboard') as Route;
}

export function go(route: Route) {
  window.location.hash = `/${route}`;
}

export default function App() {
  const { auth, authError, saveState } = useStore();
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));

  useEffect(() => {
    const h = () => {
      setRoute(parse(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);

  if (auth === 'checking') return <div className="boot">Chargement…</div>;
  if (auth === 'login') return <Login />;
  if (auth === 'misconfigured') return <Misconfigured error={authError} />;

  const page = {
    dashboard: <Dashboard />,
    patrimoine: <Patrimoine />,
    analyses: <Analyses />,
    projection: <Projection />,
    diversification: <Diversification />,
    rapports: <Rapports />,
    reglages: <Reglages />,
  }[route];

  const saveLabel = {
    saved: 'À jour avec ta feuille',
    saving: 'Enregistrement des réglages…',
    error: 'Réglages non enregistrés',
    offline: 'Hors ligne : dernières données connues',
  }[saveState];

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Navigation principale">
        <div className="brand">
          <span className="brand-mark">
            <PiggyBank size={16} />
          </span>
          Pécule
        </div>
        {ROUTES.map(({ id, label, icon: Icon }) => (
          <a key={id} href={`#/${id}`} className={`nav-link${route === id ? ' active' : ''}`}>
            <Icon size={17} />
            {label}
          </a>
        ))}
        <div className="sidebar-foot">
          <span className={`dot ${saveState === 'offline' ? 'local' : saveState}`} />
          {saveLabel}
        </div>
      </nav>
      <main className="main">{page}</main>
      <Toasts />
    </div>
  );
}

function Login() {
  const { login } = useStore();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="boot" style={{ padding: 16 }}>
      <form
        className="card"
        style={{ width: '100%', maxWidth: 380, padding: 28 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await login(password);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="brand" style={{ padding: '0 0 18px' }}>
          <span className="brand-mark">
            <PiggyBank size={16} />
          </span>
          Pécule
        </div>
        <div className="field">
          <label htmlFor="pw">Mot de passe</label>
          <input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </div>
        {error && (
          <div className="bad small" style={{ marginTop: 10 }}>
            {error}
          </div>
        )}
        <button className="btn btn-primary" type="submit" disabled={busy || !password} style={{ width: '100%', marginTop: 16 }}>
          <Lock size={15} /> {busy ? 'Vérification…' : 'Se connecter'}
        </button>
        <p className="muted small" style={{ margin: '14px 0 0' }}>
          Session mémorisée 6 mois sur cet appareil.
        </p>
      </form>
    </div>
  );
}

function Misconfigured({ error }: { error: string }) {
  return (
    <div className="boot" style={{ padding: 16 }}>
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card-title" style={{ marginBottom: 8 }}>
          Configuration incomplète
        </div>
        <p className="text-2" style={{ marginTop: 0 }}>
          {error}
        </p>
        <p className="muted small" style={{ marginBottom: 0 }}>
          En local : fichier <code>.env.local</code>. Sur Vercel : Settings → Environment Variables (APP_PASSWORD, SESSION_SECRET, GSHEET_URL, GSHEET_TOKEN), puis redéploie.
        </p>
      </div>
    </div>
  );
}
