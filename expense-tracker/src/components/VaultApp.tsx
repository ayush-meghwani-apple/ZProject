import { useEffect, useState } from 'react';
import { VaultRepository } from '../repository/vaultRepository';
import { hasPin, createPin, unlock, clearPin, encryptJson, decryptJson } from '../core/vaultLock';
import { formatINR, newId, now } from '../core/util';
import AppIcon from './AppIcon';
import AmountInput from './AmountInput';
import type { VaultItem } from '../types/models';

/** The decrypted, in-memory view of a vault entry. */
interface Dec {
  id: string;
  label: string;
  amount: number;
  note?: string;
  order?: number;
  createdAt: string;
  updatedAt: string;
}

interface Secret {
  label: string;
  amount: number;
  note?: string;
}

/** Decrypt a raw item (or read a legacy plaintext one). */
async function decryptItem(key: CryptoKey, raw: VaultItem): Promise<Dec> {
  let s: Secret;
  if (raw.enc) {
    s = await decryptJson<Secret>(key, raw.enc);
  } else {
    s = { label: raw.label ?? '', amount: raw.amount ?? 0, note: raw.note };
  }
  return {
    id: raw.id,
    label: s.label,
    amount: s.amount,
    note: s.note,
    order: raw.order,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

/** Encrypt a decrypted view back into a storable (ciphertext-only) item. */
async function encryptItem(key: CryptoKey, d: Dec): Promise<VaultItem> {
  const enc = await encryptJson(key, { label: d.label, amount: d.amount, note: d.note } satisfies Secret);
  return { id: d.id, enc, order: d.order, createdAt: d.createdAt, updatedAt: now() };
}

/**
 * A private, passcode-locked place for savings values you don't want visible at
 * a glance (emergency fund, gold, FDs…). Entries are ENCRYPTED at rest with a
 * key derived from your PIN, so the raw database only holds ciphertext. Leaving
 * the sub-app re-locks it automatically (this remounts and drops the key).
 */
export default function VaultApp() {
  const [vkey, setVkey] = useState<CryptoKey | null>(null);
  return vkey ? (
    <Vault vkey={vkey} onLock={() => setVkey(null)} />
  ) : (
    <VaultLock onUnlock={setVkey} />
  );
}

function VaultLock({ onUnlock }: { onUnlock: (key: CryptoKey) => void }) {
  const creating = !hasPin();
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (busy) return;
    if (creating) {
      if (!/^\d{4,6}$/.test(pin)) return setErr('PIN must be 4–6 digits.');
      if (pin !== pin2) return setErr('The PINs don’t match.');
      setBusy(true);
      const key = await createPin(pin);
      setBusy(false);
      onUnlock(key);
    } else {
      setBusy(true);
      const key = await unlock(pin);
      setBusy(false);
      if (key) onUnlock(key);
      else {
        setErr('Wrong PIN.');
        setPin('');
      }
    }
  }

  return (
    <main className="app__body">
      <div className="page vaultlock">
        <div className="vaultlock__card">
          <div className="vaultlock__icon">
            <AppIcon name="vault" size={30} />
          </div>
          <h2>{creating ? 'Create a PIN' : 'Enter PIN'}</h2>
          <p className="muted">
            {creating
              ? 'Set a 4–6 digit PIN to lock and encrypt your private savings. It’s stored only on this device and never saved anywhere.'
              : 'Enter your PIN to open your private savings.'}
          </p>
          <form onSubmit={submit} className="vaultlock__form">
            <input
              className="input vaultlock__pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="PIN"
              autoFocus
            />
            {creating && (
              <input
                className="input vaultlock__pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={pin2}
                onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))}
                placeholder="Confirm PIN"
              />
            )}
            {err && <div className="vaultlock__err">{err}</div>}
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Working…' : creating ? 'Create & open' : 'Unlock'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

function Vault({ vkey, onLock }: { vkey: CryptoKey; onLock: () => void }) {
  const [items, setItems] = useState<Dec[]>([]);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pinPanel, setPinPanel] = useState(false);

  async function load() {
    const raw = await VaultRepository.list();
    const decs: Dec[] = [];
    for (const r of raw) {
      try {
        decs.push(await decryptItem(vkey, r));
      } catch {
        // Couldn't decrypt (e.g. encrypted under a different PIN) — surface it
        // without losing the row.
        decs.push({ id: r.id, label: '🔒 Unable to decrypt', amount: 0, order: r.order, createdAt: r.createdAt, updatedAt: r.updatedAt });
      }
    }
    // Migrate any legacy plaintext entries to encrypted-at-rest, once.
    const legacy = raw.filter((r) => !r.enc && (r.label !== undefined || r.amount !== undefined));
    if (legacy.length) {
      for (const r of legacy) {
        const d = decs.find((x) => x.id === r.id);
        if (d) await VaultRepository.put(await encryptItem(vkey, d));
      }
    }
    setItems(decs);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = items.reduce((s, i) => s + i.amount, 0);

  function reset() {
    setEditingId(null);
    setLabel('');
    setAmount(0);
    setNote('');
  }

  async function save() {
    if (!label.trim() || !(amount > 0)) {
      alert('Enter a label and a valid amount.');
      return;
    }
    const ts = now();
    if (editingId) {
      const it = items.find((i) => i.id === editingId);
      if (it) {
        await VaultRepository.put(
          await encryptItem(vkey, { ...it, label: label.trim(), amount, note: note.trim() || undefined }),
        );
      }
    } else {
      const order = await VaultRepository.nextOrder();
      await VaultRepository.put(
        await encryptItem(vkey, {
          id: newId(),
          label: label.trim(),
          amount,
          note: note.trim() || undefined,
          order,
          createdAt: ts,
          updatedAt: ts,
        }),
      );
    }
    reset();
    load();
  }

  function startEdit(it: Dec) {
    setEditingId(it.id);
    setLabel(it.label);
    setAmount(it.amount);
    setNote(it.note ?? '');
  }

  async function remove(it: Dec) {
    if (!confirm(`Remove "${it.label}"?`)) return;
    await VaultRepository.remove(it.id);
    if (editingId === it.id) reset();
    load();
  }

  return (
    <main className="app__body">
      <div className="page">
        <div className="card vault__topcard">
          <div className="vault__totalrow">
            <div>
              <div className="muted">Total saved (private)</div>
              <div className="stat">{formatINR(total)}</div>
            </div>
            <button className="btn btn--ghost btn--sm" onClick={onLock}>
              <AppIcon name="vault" size={15} /> Lock
            </button>
          </div>
        </div>

        <div className="card">
          <h3>{editingId ? 'Edit entry' : 'Add a savings entry'}</h3>
          <label className="field">
            <span>Label</span>
            <input
              className="input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Emergency fund"
            />
          </label>
          <label className="field">
            <span>Amount (₹)</span>
            <AmountInput value={amount} onChange={setAmount} inputMode="numeric" />
          </label>
          <label className="field">
            <span>Note (optional)</span>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="inline">
            <button className="btn" onClick={save}>
              {editingId ? 'Save' : 'Add'}
            </button>
            {editingId && (
              <button className="btn btn--ghost" onClick={reset}>
                Cancel
              </button>
            )}
          </div>
        </div>

        {items.length > 0 && (
          <div className="card">
            <h3>Your savings</h3>
            {items.map((it) => (
              <div className="vault__row" key={it.id}>
                <div className="vault__rowmain">
                  <div className="vault__label">{it.label}</div>
                  {it.note && <div className="vault__note muted">{it.note}</div>}
                </div>
                <div className="vault__amt">{formatINR(it.amount)}</div>
                <button className="iconbtn" onClick={() => startEdit(it)} title="Edit">
                  <AppIcon name="edit" size={16} />
                </button>
                <button className="iconbtn" onClick={() => remove(it)} title="Remove">
                  <AppIcon name="trash" size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="card">
          <button className="btn btn--ghost btn--sm" onClick={() => setPinPanel((v) => !v)}>
            <AppIcon name="vault" size={14} /> PIN & security
          </button>
          {pinPanel && <PinPanel vkey={vkey} onLock={onLock} />}
        </div>
      </div>
    </main>
  );
}

function PinPanel({ vkey, onLock }: { vkey: CryptoKey; onLock: () => void }) {
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function change() {
    setMsg('');
    if (!/^\d{4,6}$/.test(newPin)) return setMsg('New PIN must be 4–6 digits.');
    setBusy(true);
    const oldKey = await unlock(oldPin);
    if (!oldKey) {
      setBusy(false);
      return setMsg('Current PIN is wrong.');
    }
    // Set the new PIN, then re-encrypt every entry with the new key.
    const raw = await VaultRepository.list();
    const newKey = await createPin(newPin);
    for (const r of raw) {
      let secret: { label: string; amount: number; note?: string };
      try {
        secret = r.enc
          ? await decryptJson(vkey, r.enc)
          : { label: r.label ?? '', amount: r.amount ?? 0, note: r.note };
      } catch {
        continue;
      }
      const enc = await encryptJson(newKey, secret);
      await VaultRepository.put({ id: r.id, enc, order: r.order, createdAt: r.createdAt, updatedAt: now() });
    }
    setBusy(false);
    setOldPin('');
    setNewPin('');
    setMsg('PIN changed — unlocking again…');
    setTimeout(onLock, 900);
  }

  async function forgot() {
    if (
      !confirm(
        'Forgot your PIN? Your entries are encrypted with it and cannot be recovered — this ERASES all vault entries and the PIN so you can start fresh. Continue?',
      )
    )
      return;
    await VaultRepository.clearAll();
    clearPin();
    onLock();
  }

  return (
    <div className="vault__pinpanel">
      <label className="field">
        <span>Current PIN</span>
        <input
          className="input"
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={oldPin}
          onChange={(e) => setOldPin(e.target.value.replace(/\D/g, ''))}
        />
      </label>
      <label className="field">
        <span>New PIN (4–6 digits)</span>
        <input
          className="input"
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={newPin}
          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
        />
      </label>
      {msg && <div className="muted">{msg}</div>}
      <div className="inline">
        <button className="btn btn--sm" onClick={change} disabled={busy}>
          {busy ? 'Working…' : 'Change PIN'}
        </button>
        <button className="btn btn--ghost btn--sm btn--danger" onClick={forgot}>
          Forgot PIN — reset vault
        </button>
      </div>
    </div>
  );
}
