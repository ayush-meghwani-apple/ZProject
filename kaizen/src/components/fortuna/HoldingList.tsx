import { useState } from 'react';
import type { HoldingRow } from '../../types/models';
import { newId } from '../../core/util';
import AmountInput from '../AmountInput';
import AppIcon from '../AppIcon';
import { formatINR } from './shared';

/**
 * An editable list of `{name, [category], value}` rows — shared by the Portfolio
 * holdings and by the Cash Flow / Liabilities lines. Read rows show just the
 * name + value and are tappable; tapping a row opens its inline editor (name /
 * category / value + delete), so the edit & delete controls only appear when you
 * actually want to change something — the list stays clean and uncluttered.
 */
export default function HoldingList({
  rows,
  categories,
  namePlaceholder,
  addLabel = 'Add',
  total = false,
  totalLabel = 'Total',
  onChange,
}: {
  rows: HoldingRow[];
  categories?: string[];
  namePlaceholder: string;
  addLabel?: string;
  total?: boolean;
  totalLabel?: string;
  onChange: (mutate: (rows: HoldingRow[]) => void) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const sum = rows.reduce((s, r) => s + (Number(r.value) || 0), 0);

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
            <button
              className="iconbtn ft-holding__del"
              aria-label="Remove"
              title="Remove"
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setEditingId(null); onChange((rs) => { rs.splice(i, 1); }); }}
            >
              <AppIcon name="trash" size={16} />
            </button>
            <button
              className="iconbtn ft-holding__done"
              aria-label="Done"
              title="Done"
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setEditingId(null)}
            >
              <AppIcon name="done" size={16} />
            </button>
          </div>
        ) : (
          <button className="ft-readrow ft-readrow--tap" key={row.id} onClick={() => setEditingId(row.id)}>
            <span className="ft-readrow__name">
              {row.name.trim() || '—'}
              {categories && row.category && <span className="ft-readrow__cat">{row.category}</span>}
            </span>
            <span className="ft-readrow__val">{formatINR(row.value)}</span>
            <AppIcon name="chevronRight" size={15} className="ft-readrow__chev" />
          </button>
        ),
      )}

      {total && rows.length > 0 && (
        <div className="ft-total ft-total--strong">
          <span>{totalLabel}</span>
          <span className="ft-total__val">{formatINR(sum)}</span>
        </div>
      )}
      <div className="ft-holdings__foot">
        <button className="ft-addrow" onClick={addRow}>
          <AppIcon name="plus" size={16} /> {addLabel}
        </button>
      </div>
    </div>
  );
}

