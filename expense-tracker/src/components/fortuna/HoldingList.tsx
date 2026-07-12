import { useState } from 'react';
import type { HoldingRow } from '../../types/models';
import { newId } from '../../core/util';
import AmountInput from '../AmountInput';
import AppIcon from '../AppIcon';
import { formatINR } from './shared';

/**
 * An editable list of `{name, [category], value}` rows — shared by the Portfolio
 * holdings and by the Cash Flow / Liabilities lines. Each row shows a clean
 * read-only line (name + value) with a **pencil** to edit and a **trash** to
 * remove — just like editing sub-categories in Expensify. Tapping the pencil
 * opens that single row's inputs inline; an **Add** button sits at the bottom.
 */
export default function HoldingList({
  rows,
  categories,
  namePlaceholder,
  addLabel = 'Add',
  onChange,
}: {
  rows: HoldingRow[];
  categories?: string[];
  namePlaceholder: string;
  addLabel?: string;
  onChange: (mutate: (rows: HoldingRow[]) => void) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const total = rows.reduce((s, r) => s + (Number(r.value) || 0), 0);

  function addRow() {
    const id = newId();
    onChange((rs) => { rs.push({ id, name: '', category: categories?.[0], value: 0 }); });
    setEditingId(id);
  }

  return (
    <div className="ft-holdings">
      {rows.map((row, i) =>
        editingId === row.id ? (
          <div className="ft-holding" key={row.id}>
            <input
              className="input ft-holding__name"
              value={row.name}
              placeholder={namePlaceholder}
              autoFocus
              onChange={(e) => onChange((rs) => { rs[i].name = e.target.value; })}
            />
            {categories && (
              <select
                className="input ft-holding__cat"
                value={row.category ?? categories[0]}
                onChange={(e) => onChange((rs) => { rs[i].category = e.target.value; })}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
            <span className="ft-holding__amt">
              <span className="ft-row__cur">₹</span>
              <AmountInput
                className="input ft-holding__val"
                value={row.value}
                onChange={(v) => onChange((rs) => { rs[i].value = v; })}
                placeholder="0"
              />
            </span>
            <button className="iconbtn ft-holding__done" aria-label="Done" onClick={() => setEditingId(null)}>
              <AppIcon name="done" size={16} />
            </button>
          </div>
        ) : (
          <div className="ft-readrow" key={row.id}>
            <span className="ft-readrow__name">
              {row.name.trim() || '—'}
              {categories && row.category && <span className="ft-readrow__cat">{row.category}</span>}
            </span>
            <span className="ft-readrow__val">{formatINR(row.value)}</span>
            <button className="iconbtn ft-readrow__edit" aria-label="Edit" title="Edit" onClick={() => setEditingId(row.id)}>
              <AppIcon name="edit" size={15} />
            </button>
            <button
              className="iconbtn ft-readrow__del"
              aria-label="Remove"
              title="Remove"
              onClick={() => { if (editingId === row.id) setEditingId(null); onChange((rs) => { rs.splice(i, 1); }); }}
            >
              <AppIcon name="trash" size={15} />
            </button>
          </div>
        ),
      )}

      <div className="ft-holdings__foot">
        <button className="ft-addrow" onClick={addRow}>
          <AppIcon name="plus" size={16} /> {addLabel}
        </button>
        {rows.length > 0 && <span className="ft-holdings__total">{formatINR(total)}</span>}
      </div>
    </div>
  );
}

