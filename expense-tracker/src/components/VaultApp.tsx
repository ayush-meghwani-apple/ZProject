import { useEffect, useState } from 'react';
import { VaultRepository } from '../repository/vaultRepository';
import { hasPin, setPin as savePin, verifyPin, clearPin } from '../core/vaultLock';
import { formatINR } from '../core/util';
import AppIcon from './AppIcon';
import type { VaultItem } from '../types/models';

/**
 * A private, passcode-locked place for savings values you don't want visible at
 * a glance (emergency fund, gold, FDs…). Kept fully separate from expenses so it
 * never appears in any spend view. The PIN gates the whole sub-app; leaving the
 * sub-app (switching apps) re-locks it automatically since this remounts.
 */
export default function VaultApp() {
  const [unlocked, setUnlocked] = useState(false);
  return unlocked ? (
    <Vault onLock={() => setUnlocked(false)} />
  ) : (
    <VaultLock onUnlock={() => setUnlocked(true)} />
  );
}

function VaultLock({ onUnlock }: { onUnlock: () => void }) {
  const creating = !hasPin();
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (creating) {
      if (!/^\d{4,6}$/.test(pin)) return setErr('PIN must be 4–6 digits.');
      if (pin !== pin2) return setErr('The PINs don’t match.');
      await savePin(pin);
      onUnlock();
    } else {
      if (await verifyPin(pin)) onUnlock();
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
              ? 'Set a 4–6 digit PIN to lock your private savings. It’s stored only on this device.'
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
            <button className="btn" type="submit">
              {creating ? 'Create & open' : 'Unlock'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

function Vault({ onLock }: { onLock: () => void }) {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pinPanel, setPinPanel] = useState(false);

  async function load() {
    setItems(await VaultRepository.list());
  }
  useEffect(() => {
    load();
  }, []);

  const total = items.reduce((s, i) => s + i.amount, 0);

  function reset() {
    setEditingId(null);
    setLabel('');
    setAmount('');
    setNote('');
  }

  async function save() {
    const amt = parseFloat(amount);
    if (!label.trim() || isNaN(amt)) {
      alert('Enter a label and a valid amount.');
      return;
    }
    if (editingId) {
      const it = items.find((i) => i.id === editingId);
      if (it) await VaultRepository.update({ ...it, label: label.trim(), amount: amt, note: note.trim() || undefined });
    } else {
      await VaultRepository.add(label, amt, note);
    }
    reset();
    load();
  }

  function startEdit(it: VaultItem) {
    setEditingId(it.id);
    setLabel(it.label);
    setAmount(String(it.amount));
    setNote(it.note ?? '');
  }

  async function remove(it: VaultItem) {
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
            <input
              className="input"
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
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
          {pinPanel && <PinPanel onLock={onLock} />}
        </div>
      </div>
    </main>
  );
}

function PinPanel({ onLock }: { onLock: () => void }) {
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [msg, setMsg] = useState('');

  async function change() {
    setMsg('');
    if (!(await verifyPin(oldPin))) return setMsg('Current PIN is wrong.');
    if (!/^\d{4,6}$/.test(newPin)) return setMsg('New PIN must be 4–6 digits.');
    await savePin(newPin);
    setOldPin('');
    setNewPin('');
    setMsg('PIN changed.');
  }

  async function forgot() {
    if (
      !confirm(
        'Forgot your PIN? This ERASES all vault entries and the PIN so you can start fresh. This cannot be undone. Continue?',
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
        <button className="btn btn--sm" onClick={change}>
          Change PIN
        </button>
        <button className="btn btn--ghost btn--sm btn--danger" onClick={forgot}>
          Forgot PIN — reset vault
        </button>
      </div>
    </div>
  );
}
