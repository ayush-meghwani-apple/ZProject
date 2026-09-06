import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import CollapsibleCard from './CollapsibleCard';
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
  const [editor, setEditor] = useState<PaymentMethod | 'new' | null>(null);

  async function load() {
    setMethods(await PaymentMethodRepository.list());
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    const n = name.trim();
    if (!n) return;
    if (editor === 'new') {
      await PaymentMethodRepository.add(n, icon.trim() || undefined);
    } else if (editor) {
      await PaymentMethodRepository.update({ ...editor, name: n, icon: icon.trim() || undefined });
    }
    setName('');
    setIcon('');
    setEditor(null);
    await load();
  }

  function openNew() {
    setName('');
    setIcon('');
    setEditor('new');
  }

  function openEdit(method: PaymentMethod) {
    setName(method.name);
    setIcon(method.icon ?? '');
    setEditor(method);
  }

  async function remove(m: PaymentMethod) {
    if (!confirm(`Remove "${m.name}"? Expenses already tagged with it keep their amount but show as untagged.`)) return;
    await PaymentMethodRepository.remove(m.id);
    load();
  }

  return (
    <CollapsibleCard title="Payment Methods" icon="creditcard" compact>
      <div className="pmtoolbar">
        <span>{methods.length} saved</span>
        <button className="btn btn--sm" onClick={openNew}>
          <AppIcon name="plus" size={15} /> Add method
        </button>
      </div>

      <div className="pmlist">
        {methods.map((method) => (
            <div className="pmrow" key={method.id}>
              <span className="pmrow__glyph">{method.icon || '💳'}</span>
              <strong className="pmrow__name">{method.name}</strong>
              <button className="iconbtn" onClick={() => openEdit(method)} title="Edit" aria-label={`Edit ${method.name}`}>
                <AppIcon name="edit" size={16} />
              </button>
              <button className="iconbtn" onClick={() => remove(method)} title="Remove" aria-label={`Remove ${method.name}`}>
                <AppIcon name="trash" size={16} />
              </button>
            </div>
        ))}
      </div>

      {editor && createPortal(
        <div className="modal__backdrop modal__backdrop--form" onClick={() => setEditor(null)}>
          <div className="modal__card formdrawer" onClick={(event) => event.stopPropagation()}>
            <div className="formdrawer__head">
              <h3>{editor === 'new' ? 'New payment method' : 'Edit payment method'}</h3>
              <button className="iconbtn" onClick={() => setEditor(null)} aria-label="Close payment method editor">
                <AppIcon name="close" size={18} />
              </button>
            </div>
            <div className="pmform">
              <label className="field pmform__icon">
                <span>Emoji</span>
                <input className="input" value={icon} onChange={(event) => setIcon(event.target.value)} placeholder="💳" maxLength={8} aria-label="Payment method emoji" />
              </label>
              <label className="field">
                <span>Name</span>
                <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. HDFC Card" onKeyDown={(event) => event.key === 'Enter' && void save()} autoFocus />
              </label>
            </div>
            <div className="modal__footer">
              <button className="btn btn--ghost" onClick={() => setEditor(null)}>Cancel</button>
              <button className="btn" onClick={save} disabled={!name.trim()}>{editor === 'new' ? 'Add method' : 'Save changes'}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </CollapsibleCard>
  );
}
