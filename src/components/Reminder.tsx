import { useEffect, useState } from 'react';
import { Bell, BellOff, Send } from 'lucide-react';
import { useStore } from '../store';
import { getSession, pushTest } from '../lib/api';

type Status = 'loading' | 'unsupported' | 'install' | 'unconfigured' | 'denied' | 'off' | 'on';

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

function keyBytes(b64url: string): Uint8Array {
  const s = atob(b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

/** Rappel mensuel par notification sur cet appareil. */
export function Reminder() {
  const { data, update, notify, saveState } = useStore();
  const [status, setStatus] = useState<Status>('loading');
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reminder = data.settings.reminder;
  const day = reminder?.day ?? 7;

  useEffect(() => {
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setStatus(isIOS() && !standalone() ? 'install' : 'unsupported');
        return;
      }
      const s = await getSession().catch(() => null);
      if (!s?.push) return setStatus('unconfigured');
      setPublicKey(s.push);
      if (Notification.permission === 'denied') return setStatus('denied');
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setEndpoint(sub?.endpoint ?? null);
      setStatus(sub && reminder?.subs.some((x) => x.endpoint === sub.endpoint) ? 'on' : 'off');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setSubs = (fn: (subs: { endpoint: string }[]) => { endpoint: string }[], newDay = day) =>
    update((d) => ({ ...d, settings: { ...d.settings, reminder: { day: newDay, subs: fn(d.settings.reminder?.subs ?? []) } } }));

  async function enable() {
    setBusy(true);
    try {
      if ((await Notification.requestPermission()) !== 'granted') return setStatus('denied');
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey!) as BufferSource }));
      setEndpoint(sub.endpoint);
      setSubs((subs) => [...subs.filter((x) => x.endpoint !== sub.endpoint), { endpoint: sub.endpoint }]);
      setStatus('on');
      notify('Rappel activé sur cet appareil');
    } catch (e) {
      notify(`Notifications : ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      await sub?.unsubscribe();
      setSubs((subs) => subs.filter((x) => x.endpoint !== (sub?.endpoint ?? endpoint)));
      setStatus('off');
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (!endpoint) return;
    setBusy(true);
    try {
      await pushTest(endpoint);
      notify('Notification de test envoyée');
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const message: Partial<Record<Status, string>> = {
    loading: 'Vérification…',
    install: 'Sur iPhone, les notifications ne marchent que dans l’app ajoutée à l’écran d’accueil : ouvre Pécule depuis son icône.',
    unsupported: 'Ce navigateur ne gère pas les notifications.',
    unconfigured: 'Notifications pas encore configurées sur le serveur (clés VAPID dans Vercel).',
    denied: 'Notifications refusées : autorise-les pour Pécule dans les réglages de l’iPhone (Notifications).',
  };

  return (
    <div className="card">
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="card-title">Rappel mensuel</div>
          <div className="card-sub">Une notification pour remplir ton relevé</div>
        </div>
        {(status === 'on' || status === 'off') && (
          <select
            value={day}
            onChange={(e) => setSubs((subs) => subs, Number(e.target.value))}
            aria-label="Jour du rappel"
            style={{ width: 'auto' }}
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                le {d}
              </option>
            ))}
          </select>
        )}
      </div>

      {message[status] && <p className="muted small" style={{ margin: '12px 0 0' }}>{message[status]}</p>}

      {status === 'off' && (
        <button className="btn btn-primary" style={{ marginTop: 12, width: '100%' }} onClick={enable} disabled={busy}>
          <Bell size={16} /> Activer sur cet appareil
        </button>
      )}
      {status === 'on' && (
        <>
          <p className="muted small" style={{ margin: '12px 0 0' }}>
            Activé : le {day} de chaque mois, vers 8 h.
            {saveState === 'error' && <span className="bad"> Tes réglages ne sont pas enregistrés dans ton compte Google : le rappel ne partira pas tant que le script n’est pas à jour.</span>}
          </p>
          <div className="row" style={{ marginTop: 12, gap: 8 }}>
            <button className="btn grow" onClick={test} disabled={busy}>
              <Send size={15} /> Tester
            </button>
            <button className="btn grow" onClick={disable} disabled={busy}>
              <BellOff size={15} /> Désactiver
            </button>
          </div>
        </>
      )}
    </div>
  );
}
