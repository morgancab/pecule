import { useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import type { Account, AccountType } from '../types';
import { Delta, Empty, Modal, MoneyInput, Stat, fromNumber, toNumber } from '../components/ui';
import { eur, fmtDate, pct, todayISO } from '../lib/format';
import { ACCOUNT_TYPES, ASSET_GROUPS, TYPE_GROUPS, accountValue, isDebt, totals } from '../lib/networth';
import { buildSeries, changeOver } from '../lib/analytics';
import { REFERENCES, referenceLabel, referenceOf } from '../lib/market';
import { slotColor } from '../lib/theme';

/** Patrimoine : lecture de ton tableau de suivi (Google Sheet). Les soldes se modifient dans la feuille. */
export default function Patrimoine() {
  const { data, update, notify, chart, sync: syncSheet, syncing } = useStore();
  const [editing, setEditing] = useState<Account | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const t = totals(data.accounts);
  const archived = data.accounts.filter((a) => a.archived);
  const lastDate = data.accounts.reduce((m, a) => (a.history.length && a.history[a.history.length - 1].date > m ? a.history[a.history.length - 1].date : m), '');
  // même référence que la page Analyses : le relevé le plus proche d'il y a 12 mois
  const c12 = changeOver(buildSeries(data.accounts), 12);
  const yearAgo = c12 ? c12.from.net : null;
  const syncLabel = data.settings.lastSync
    ? new Date(data.settings.lastSync).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';

  const groups = [
    ...ASSET_GROUPS.map((g) => ({ id: g.id as string, label: g.label, color: slotColor(chart, g.slot) })),
    { id: 'dette', label: 'Dettes', color: chart.neutral },
  ]
    .map((g) => ({ ...g, accounts: data.accounts.filter((a) => !a.archived && ACCOUNT_TYPES[a.type].group === g.id) }))
    .filter((g) => g.accounts.length);

  async function sync() {
    try {
      notify(await syncSheet());
    } catch (e) {
      notify(`Feuille Google : ${(e as Error).message}`);
    }
  }

  /** Valeur d'un compte au relevé d'il y a ~12 mois (pour la colonne de variation). */
  const valueYearAgo = (a: Account) => {
    if (!c12) return null;
    const v = c12.from.accounts[a.id];
    return v === undefined ? null : Math.abs(v);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Patrimoine</h1>
          <p className="page-sub">
            {`Lu depuis ta feuille Google${lastDate ? ` · dernier relevé le ${fmtDate(lastDate)}` : ''}${syncLabel ? ` · synchronisé le ${syncLabel}` : ''}. Pour changer un solde, modifie la feuille.`}
          </p>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={sync} disabled={syncing}>
            <RefreshCw size={15} className={syncing ? 'spin' : ''} /> {syncing ? 'Synchronisation…' : 'Synchroniser'}
          </button>
        </div>
      </div>

      <div className="grid cols-4">
        <Stat label="Patrimoine net" value={eur(t.net, false)} sub={yearAgo !== null ? <Delta value={t.net - yearAgo} ratio={yearAgo ? (t.net - yearAgo) / yearAgo : undefined} suffix={`depuis le ${fmtDate(c12!.from.date)}`} /> : undefined} />
        <Stat label="Actifs" value={eur(t.assets, false)} />
        <Stat label="Dettes" value={eur(t.debts, false)} />
        <Stat label="Comptes suivis" value={String(data.accounts.length - archived.length)} sub={archived.length ? `+ ${archived.length} clôturé${archived.length > 1 ? 's' : ''}` : undefined} />
      </div>

      {!groups.length && !archived.length && (
        <div className="card section">
          <Empty title="Aucun compte pour l’instant" text="Chaque colonne de ton tableau de suivi devient un compte, avec tout son historique. Synchronise la feuille pour les charger.">
            <button className="btn btn-primary" onClick={sync} disabled={syncing}>
              Synchroniser
            </button>
          </Empty>
        </div>
      )}

      {groups.map((g) => {
        const total = g.accounts.reduce((s, a) => s + accountValue(a), 0);
        return (
          <div className="section" key={g.id}>
            <div className="section-title">
              <span className="swatch" style={{ background: g.color }} />
              {g.label}
              <span className="muted tnum">
                {eur(total, false)}
                {g.id !== 'dette' && t.assets > 0 && ` · ${pct(total / t.assets, 0)}`}
              </span>
            </div>
            <div className="card flush">
              <div className="table-wrap">
                <table className="table">
                  <tbody>
                    {g.accounts.map((a) => {
                      const meta = ACCOUNT_TYPES[a.type];
                      const value = accountValue(a);
                      const ya = valueYearAgo(a);
                      const last = a.history[a.history.length - 1]?.date;
                      return (
                        <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => setEditing(a)}>
                          <td>
                            <div style={{ fontWeight: 550 }}>{a.name}</div>
                            <div className="muted small">
                              {meta.label}
                              {a.institution && ` · ${a.institution}`}
                              {last && ` · relevé du ${fmtDate(last)}`}
                            </div>
                          </td>
                          <td className="num">
                            {a.rate ? (
                              <div className="small text-2">
                                {String(a.rate).replace('.', ',')} % {!isDebt(a) && <span className="muted">≈ {eur((value * a.rate) / 100, false)}/an</span>}
                              </div>
                            ) : ya !== null ? (
                              <span className="small">
                                <Delta value={value - ya} suffix="12 mois" />
                              </span>
                            ) : null}
                          </td>
                          <td className="num" style={{ fontWeight: 600, width: 140 }}>
                            {isDebt(a) ? '−' : ''}
                            {eur(Math.abs(value))}
                          </td>
                          <td style={{ width: 44 }}>
                            <Pencil size={15} className="muted" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })}

      {archived.length > 0 && (
        <div className="section">
          <button className="btn btn-sm btn-ghost" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? <ChevronDown size={15} /> : <ChevronRight size={15} />} Comptes clôturés ({archived.length})
          </button>
          {showArchived && (
            <div className="card" style={{ marginTop: 8 }}>
              {archived.map((a) => (
                <div className="list-row" key={a.id} style={{ cursor: 'pointer' }} onClick={() => setEditing(a)}>
                  <div className="grow">
                    <div>{a.name}</div>
                    <div className="muted small">
                      {ACCOUNT_TYPES[a.type].label}
                      {a.institution && ` · ${a.institution}`} · {a.history.length} relevé{a.history.length > 1 ? 's' : ''} dans l’historique
                    </div>
                  </div>
                  <span className="tnum muted">{eur(accountValue(a))}</span>
                  <Pencil size={14} className="muted" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}


      {editing && (
        <AccountModal
          account={editing}
          onClose={() => setEditing(null)}
          onSave={(acc) => {
            update((d) => ({ ...d, accounts: d.accounts.map((x) => (x.id === acc.id ? acc : x)) }));
            setEditing(null);
          }}
          onDelete={(id) => {
            update((d) => ({ ...d, accounts: d.accounts.filter((x) => x.id !== id) }));
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

/** Ce qui ne vient pas de la feuille : nom affiché, type (pour la répartition), taux, clôture. */
function AccountModal({ account, onClose, onSave, onDelete }: { account: Account; onClose: () => void; onSave: (a: Account) => void; onDelete: (id: string) => void }) {
  const [name, setName] = useState(account.name);
  const [type, setType] = useState<AccountType>(account.type);
  const [institution, setInstitution] = useState(account.institution);
  const [rate, setRate] = useState(fromNumber(account.rate));
  const [isArchived, setIsArchived] = useState(!!account.archived);
  // '__auto' = référence devinée, '' = aucune
  const [ticker, setTicker] = useState(account.ticker === undefined ? '__auto' : account.ticker);
  const guessed = referenceOf({ ...account, ticker: undefined, type, name });
  const meta = ACCOUNT_TYPES[type];
  const fromSheet = !!account.source;

  const save = () =>
    onSave({
      ...account,
      name: name.trim() || account.name,
      type,
      institution: institution.trim(),
      rate: meta.rate && rate.trim() ? toNumber(rate) : undefined,
      archived: isArchived || undefined,
      ticker: ticker === '__auto' ? undefined : ticker,
      tickerExact: ticker === '__auto' ? undefined : !!REFERENCES.find((r) => r.ticker === ticker)?.exact,
    });

  return (
    <Modal
      title={account.name}
      onClose={onClose}
      footer={
        <>
          {!fromSheet && (
            <button className="btn btn-ghost btn-danger" style={{ marginRight: 'auto' }} onClick={() => confirm(`Supprimer « ${account.name} » et son historique ?`) && onDelete(account.id)}>
              <Trash2 size={15} /> Supprimer
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={save}>
            Enregistrer
          </button>
        </>
      }
    >
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="field">
          <label htmlFor="acc-name">Nom affiché</label>
          <input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label htmlFor="acc-type">Type (pour la répartition)</label>
          <select id="acc-type" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {TYPE_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.types.map((tp) => (
                  <option key={tp} value={tp}>
                    {ACCOUNT_TYPES[tp].label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="acc-inst">Établissement</label>
          <input id="acc-inst" value={institution} onChange={(e) => setInstitution(e.target.value)} />
        </div>
        {meta.rate ? (
          <div className="field">
            <label htmlFor="acc-rate">Taux annuel (%)</label>
            <MoneyInput id="acc-rate" value={rate} onChange={setRate} placeholder="ex. 1,7" />
          </div>
        ) : (
          <div />
        )}
        <div className="field full">
          <label htmlFor="acc-ref">Référence de marché (pour séparer l’effet des cours de tes apports)</label>
          <select id="acc-ref" value={ticker} onChange={(e) => setTicker(e.target.value)}>
            <option value="__auto">Automatique{guessed ? ` (${referenceLabel(guessed.ticker)})` : ' (aucune)'}</option>
            <option value="">Aucune</option>
            {REFERENCES.map((r) => (
              <option key={r.ticker} value={r.ticker}>
                {r.label}
                {r.exact ? ' — le compte ne contient que cette action' : ' — indice de comparaison'}
              </option>
            ))}
          </select>
        </div>
        <div className="full callout small">
          Solde actuel : <strong>{eur(accountValue(account))}</strong> · {account.history.length} relevé{account.history.length > 1 ? 's' : ''} depuis le{' '}
          {account.history[0] ? fmtDate(account.history[0].date) : fmtDate(todayISO())}.
          {fromSheet ? ' Les montants viennent de ta feuille : modifie-les là-bas.' : ''}
        </div>
        <label className="row small text-2 full" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={isArchived} onChange={(e) => setIsArchived(e.target.checked)} />
          Compte clôturé : le masquer (son historique reste dans la courbe)
        </label>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
