import { useState } from 'react';
import type { HoldingRow } from '../../types/models';
import { newId } from '../../core/util';
import AmountInput from '../AmountInput';
import AppIcon from '../AppIcon';
import { formatINR } from './shared';

/**
 * An editable list of `{name, [category], value}` rows — shared by the Portfolio
 * holdings and by the Cash Flow / Liabilities lines. It shows a clean, read-only
 * view by default; tapping **Edit** reveals the inputs (rename / re-value /
 * remove / add), so long forms aren't a wall of input boxes.
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
  const [editing, setEditing] = useState(false);
  const total = rows.reduce((s, r) => s + (Number(r.value) || 0), 0);

  return (
    <div className="ft-holdings">
      <div className="ft-holdings__top">
        <button className="ft-editbtn" onClick={() => setEditing((e) => !e)}>
          <AppIcon name={editing ? 'done' : 'edit'} size={14} />
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>

      {editing ? (
        <>
          {rows.map((row, i) => (
            <div className="ft-holding" key={row.id}>
              <input
                className="input ft-holding__name"
                value={row.name}
                placeholder={namePlaceholder}
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
                onClick={() => onChange((rs) => { rs.splice(i, 1); })}
              >
                <AppIcon name="trash" size={16} />
              </button>
            </div>
          ))}
          <div className="ft-holdings__foot">
            <button
              className="ft-addrow"
              onClick={() => onChange((rs) => { rs.push({ id: newId(), name: '', category: categories?.[0], value: 0 }); })}
            >
              <AppIcon name="plus" size={16} /> {addLabel}
            </button>
            {rows.length > 0 && <span className="ft-holdings__total">{formatINR(total)}</span>}
          </div>
        </>
      ) : rows.length === 0 ? (
        <p className="ft-readempty">Nothing yet — tap Edit to add.</p>
      ) : (
        rows.map((row) => (
          <div className="ft-readrow" key={row.id}>
            <span className="ft-readrow__name">
              {row.name.trim() || '—'}
              {categories && row.category && <span className="ft-readrow__cat">{row.category}</span>}
            </span>
            <span className="ft-readrow__val">{formatINR(row.value)}</span>
          </div>
        ))
      )}
    </div>
  );
}

