import { useEffect, useState } from 'react';
import { ChartLine, ChartPie, ChevronRight, Ellipsis, FileText, LayoutDashboard, Lock, PiggyBank, RefreshCw, Settings as SettingsIcon, TrendingUp, Wallet } from 'lucide-react';
import { useStore } from './store';
import { Toasts } from './components/ui';
import Dashboard from './pages/Dashboard';
import Patrimoine from './pages/Patrimoine';
import Analyses from './pages/Analyses';
import Projection from './pages/Projection';
import Diversification from './pages/Diversification';
import Rapports from './pages/Rapports';
import Reglages from './pages/Reglages';

export type Route = 'dashboard' | 'patrimoine' | 'analyses' | 'projection' | 'diversification' | 'rapports' | 'reglages' | 'plus';

const ROUTES: { id: Route; label: string; icon: typeof Wallet }[] = [
  { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { id: 'patrimoine', label: 'Patrimoine', icon: Wallet },
  { id: 'analyses', label: 'Analyses', icon: ChartLine },
  { id: 'projection', label: 'Projection', icon: TrendingUp },
  { id: 'diversification', label: 'Diversification', icon: ChartPie },
  { id: 'rapports', label: 'Rapports', icon: FileText },
  { id: 'reglages', label: 'Réglages', icon: SettingsIcon },
];

// Sur téléphone : 4 onglets principaux + « Plus » pour le reste
const TABS: { id: Route; label: string; icon: typeof Wallet }[] = [
  { id: 'dashboard', label: 'Accueil', icon: LayoutDashboard },
  { id: 'patrimoine', label: 'Patrimoine', icon: Wallet },
  { id: 'analyses', label: 'Analyses', icon: ChartLine },
  { id: 'projection', label: 'Projection', icon: TrendingUp },
  { id: 'plus', label: 'Plus', icon: Ellipsis },
];
const MORE: Route[] = ['diversification', 'rapports', 'reglages'];

function parse(hash: string): Route {
  const id = hash.replace(/^#\/?/, '').split('?')[0];
  if (id === 'plus') return 'plus';
  return (ROUTES.find((r) => r.id === id)?.id ?? 'dashboard') as Route;
}

export function go(route: Route) {
  window.location.hash = `/${route}`;
}

export default function App() {
  const { auth, authError, sync, syncing, notify } = useStore();
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
    plus: <More />,
  }[route];
  const title = route === 'plus' ? 'Plus' : ROUTES.find((r) => r.id === route)?.label ?? 'Pécule';
  const activeTab = MORE.includes(route) ? 'plus' : route;
  const doSync = () =>
    sync()
      .then(notify)
      .catch((e) => notify(`Feuille Google : ${(e as Error).message}`));

  return (
    <div className="app">
      <header className="mobile-top">
        {MORE.includes(route) ? (
          <a href="#/plus" className="mobile-back" aria-label="Retour">
            ‹
          </a>
        ) : (
          <span className="mobile-back" />
        )}
        <span className="mobile-title">{title}</span>
        <button className="mobile-action" onClick={doSync} disabled={syncing} aria-label="Synchroniser la feuille">
          <RefreshCw size={19} className={syncing ? 'spin' : ''} />
        </button>
      </header>
      <main className="main">{page}</main>
      <nav className="tabbar" aria-label="Navigation">
        {TABS.map(({ id, label, icon: Icon }) => (
          <a key={id} href={`#/${id}`} className={`tab${activeTab === id ? ' active' : ''}`}>
            <Icon size={22} strokeWidth={activeTab === id ? 2.2 : 1.8} />
            <span>{label}</span>
          </a>
        ))}
      </nav>
      <Toasts />
    </div>
  );
}

/** Page « Plus » (téléphone) : liste à la iOS des pages secondaires. */
function More() {
  const { saveState } = useStore();
  const items = ROUTES.filter((r) => MORE.includes(r.id));
  return (
    <>
      <div className="ios-list">
        {items.map(({ id, label, icon: Icon }) => (
          <a key={id} href={`#/${id}`} className="ios-row">
            <span className="ios-icon">
              <Icon size={18} />
            </span>
            <span className="grow">{label}</span>
            <ChevronRight size={18} className="muted" />
          </a>
        ))}
      </div>
      <p className="muted small" style={{ textAlign: 'center', marginTop: 20 }}>
        {saveState === 'offline' ? 'Hors ligne : dernières données connues' : 'Données à jour avec ta feuille Google'}
      </p>
    </>
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
