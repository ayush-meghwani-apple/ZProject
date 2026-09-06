import { useEffect, useState } from 'react';
import CollapsibleCard from './CollapsibleCard';
import { PaymentMethodRepository } from '../repository/paymentMethodRepository';
import AppIcon from './AppIcon';
import Button from './ui/Button';
import FormField from './ui/FormField';
import Sheet from './ui/Sheet';
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

      {editor && (
        <Sheet
          title={editor === 'new' ? 'New payment method' : 'Edit payment method'}
          onClose={() => setEditor(null)}
          closeLabel="Close payment method editor"
          className="formdrawer"
          bodyClassName="pmform"
          footer={(
            <>
              <Button variant="secondary" onClick={() => setEditor(null)}>Cancel</Button>
              <Button onClick={save} disabled={!name.trim()}>{editor === 'new' ? 'Add method' : 'Save changes'}</Button>
            </>
          )}
        >
              <FormField label="Emoji" className="pmform__icon">
                <input className="input" value={icon} onChange={(event) => setIcon(event.target.value)} placeholder="💳" maxLength={8} aria-label="Payment method emoji" />
              </FormField>
              <FormField label="Name">
                <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. HDFC Card" onKeyDown={(event) => event.key === 'Enter' && void save()} autoFocus />
              </FormField>
        </Sheet>
      )}
    </CollapsibleCard>
  );
}
