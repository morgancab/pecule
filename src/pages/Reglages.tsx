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
      <div className="section-title">Apparence</div>
      <Seg<ThemePref>
        value={data.settings.theme}
        onChange={(theme) => update((d) => ({ ...d, settings: { ...d.settings, theme } }))}
        options={[
          { value: 'dark', label: 'Sombre' },
          { value: 'light', label: 'Clair' },
          { value: 'system', label: 'Système' },
        ]}
      />

      <div className="section-title section">Données</div>
      <div className="ios-list">
        <button
          className="ios-row"
          disabled={syncing}
          onClick={() =>
            sync()
              .then(notify)
              .catch((e) => notify(`Feuille Google : ${(e as Error).message}`))
          }
        >
          <span className="ios-icon">
            <RefreshCw size={18} className={syncing ? 'spin' : ''} />
          </span>
          <span className="grow">
            Synchroniser la feuille
            <span className="kv-sub">
              Dernière fois : {lastSync}
              {saveState === 'error' && <span className="bad"> · réglages non enregistrés</span>}
            </span>
          </span>
        </button>
        <button className="ios-row" onClick={exportJSON}>
          <span className="ios-icon">
            <Download size={18} />
          </span>
          <span className="grow">
            Exporter mes données
            <span className="kv-sub">Comptes, historique et réglages en JSON</span>
          </span>
        </button>
      </div>

      <div className="ios-list section">
        <button className="ios-row bad" onClick={() => confirm('Se déconnecter de cet appareil ?') && logout()}>
          <span className="ios-icon danger">
            <LogOut size={18} />
          </span>
          <span className="grow">
            Se déconnecter
            <span className="kv-sub">Efface aussi la copie gardée sur cet appareil</span>
          </span>
        </button>
      </div>
    </>
  );
}
