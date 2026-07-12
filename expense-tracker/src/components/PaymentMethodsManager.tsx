import { useEffect, useState } from 'react';
import { PaymentMethodRepository } from '../repository/paymentMethodRepository';
import AppIcon from './AppIcon';
import type { PaymentMethod } from '../types/models';

/**
 * Manage the list of payment methods (Cash, cards, bank accounts, UPI Lite,
 * Splitwise, …) used to optionally tag expenses. Add, rename, set an emoji, or
 * remove — mirrors the lightweight category editor.
 */
export default function PaymentMethodsManager() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('');

  async function load() {
    setMethods(await PaymentMethodRepository.list());
  }
  useEffect(() => {
    load();
  }, []);

  async function add() {
    const n = name.trim();
    if (!n) return;
    await PaymentMethodRepository.add(n, icon.trim() || undefined);
    setName('');
    setIcon('');
    load();
  }

  function startEdit(m: PaymentMethod) {
    setEditingId(m.id);
    setEditName(m.name);
    setEditIcon(m.icon ?? '');
  }

  async function saveEdit(m: PaymentMethod) {
    const n = editName.trim();
    if (!n) return;
    await PaymentMethodRepository.update({ ...m, name: n, icon: editIcon.trim() || undefined });
    setEditingId(null);
    load();
  }

  async function remove(m: PaymentMethod) {
    if (!confirm(`Remove "${m.name}"? Expenses already tagged with it keep their amount but show as untagged.`)) return;
    await PaymentMethodRepository.remove(m.id);
    load();
  }

  return (
    <div className="card">
      <h3>Payment Methods</h3>
      <div className="muted" style={{ marginBottom: 12 }}>
        Optional. Add your cash, cards, bank accounts, UPI Lite, Splitwise, etc.
        You pick one from the Add tab (it's remembered) and can change it per
        expense — it's never required.
      </div>

      <div className="pmlist">
        {methods.map((m) =>
          editingId === m.id ? (
            <div className="pmrow" key={m.id}>
              <input
                className="input pmrow__icon"
                value={editIcon}
                onChange={(e) => setEditIcon(e.target.value)}
                placeholder="🙂"
                maxLength={2}
              />
              <input
                className="input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
              <button className="btn btn--sm" onClick={() => saveEdit(m)}>
                Save
              </button>
              <button className="btn btn--ghost btn--sm" onClick={() => setEditingId(null)}>
                Cancel
              </button>
            </div>
          ) : (
            <div className="pmrow" key={m.id}>
              <span className="pmrow__name">
                {m.icon ? `${m.icon} ` : ''}
                {m.name}
              </span>
              <button className="iconbtn" onClick={() => startEdit(m)} title="Edit">
                <AppIcon name="edit" size={16} />
              </button>
              <button className="iconbtn" onClick={() => remove(m)} title="Remove">
                <AppIcon name="trash" size={16} />
              </button>
            </div>
          ),
        )}
      </div>

      <div className="inline" style={{ marginTop: 10 }}>
        <input
          className="input pmrow__icon"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          placeholder="🙂"
          maxLength={2}
        />
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. HDFC Card"
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn" onClick={add}>
          Add
        </button>
      </div>
    </div>
  );
}
