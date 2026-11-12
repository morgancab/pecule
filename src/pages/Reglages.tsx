import { Download, LogOut, RefreshCw } from 'lucide-react';
import { useStore } from '../store';
import type { ThemePref } from '../types';
import { Seg } from '../components/ui';
import { todayISO } from '../lib/format';

export default function Reglages() {
  const { data, update, notify, sync, syncing, logout, saveState } = useStore();
  const lastSync = data.settings.lastSync
    ? new Date(data.settings.lastSync).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    : 'jamais';

  function exportJSON() {
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pecule-${todayISO()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Réglages</h1>
          <p className="page-sub">Tes soldes viennent de ta feuille Google ; tes réglages (noms, types, références, préférences) sont enregistrés dans ton compte Google par ton script.</p>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>
            Apparence
          </div>
          <Seg<ThemePref>
            value={data.settings.theme}
            onChange={(theme) => update((d) => ({ ...d, settings: { ...d.settings, theme } }))}
            options={[
              { value: 'dark', label: 'Sombre' },
              { value: 'light', label: 'Clair' },
              { value: 'system', label: 'Système' },
            ]}
          />
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 6 }}>
            Feuille Google
          </div>
          <p className="muted small" style={{ marginTop: 0 }}>
            Dernière synchronisation : {lastSync}
            {saveState === 'error' && <span className="bad"> · réglages non enregistrés</span>}
          </p>
          <button
            className="btn"
            disabled={syncing}
            onClick={() =>
              sync()
                .then(notify)
                .catch((e) => notify(`Feuille Google : ${(e as Error).message}`))
            }
          >
            <RefreshCw size={15} className={syncing ? 'spin' : ''} /> Synchroniser
          </button>
        </div>
      </div>

      <div className="grid cols-2 section">
        <div className="card">
          <div className="card-title" style={{ marginBottom: 6 }}>
            Sécurité
          </div>
          <p className="muted small" style={{ marginTop: 0 }}>
            Accès protégé par mot de passe. Se déconnecter efface aussi la copie des données gardée sur cet appareil.
          </p>
          <button className="btn btn-danger" onClick={() => confirm('Se déconnecter de cet appareil ?') && logout()}>
            <LogOut size={15} /> Se déconnecter
          </button>
        </div>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 6 }}>
            Sauvegarde
          </div>
          <p className="muted small" style={{ marginTop: 0 }}>
            Ta feuille reste la source. L’export contient les comptes, l’historique et tes réglages au format JSON.
          </p>
          <button className="btn" onClick={exportJSON}>
            <Download size={15} /> Exporter (JSON)
          </button>
        </div>
      </div>
    </>
  );
}
