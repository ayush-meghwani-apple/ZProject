import { useEffect, useState } from 'react';
import type { HoldingRow } from '../../types/models';
import { newId } from '../../core/util';
import AmountInput from '../AmountInput';
import AppIcon, { type IconName } from '../AppIcon';
import { formatINR } from './shared';

/** Deterministic colour + initials for a stock avatar (image-71 look). */
const AVATAR_COLORS = ['#6366f1', '#0ea5e9', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#ec4899', '#f97316', '#84cc16'];
function stockInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '—';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** A decimal units input backed by local text (so a trailing "." while typing a
 *  fractional unit count isn't lost). */
function UnitsField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(value ? String(value) : '');
  useEffect(() => {
    const parsed = parseFloat(text);
    if (!(Math.abs((parsed || 0) - (value || 0)) < 1e-9)) setText(value ? String(value) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      className="input ft-holding__units"
      type="text"
      inputMode="decimal"
      placeholder="units"
      value={text}
      onChange={(e) => {
        const t = e.target.value.replace(/[^0-9.]/g, '');
        setText(t);
        const n = parseFloat(t);
        onChange(Number.isFinite(n) ? n : 0);
      }}
    />
  );
}

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
  showUnits = false,
  iconFor,
  avatar = false,
  onChange,
}: {
  rows: HoldingRow[];
  categories?: string[];
  namePlaceholder: string;
  addLabel?: string;
  total?: boolean;
  totalLabel?: string;
  showUnits?: boolean;
  iconFor?: (row: HoldingRow) => IconName;
  avatar?: boolean;
  onChange: (mutate: (rows: HoldingRow[]) => void) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const sum = rows.reduce((s, r) => s + (Number(r.value) || 0), 0);

  // Leaving an edit row unmounts its focused input. Because the Done/Delete
  // buttons hold focus (preventDefault, for the iOS first-tap fix), removing the
  // input fires NO focusout, so the keyboard-open flags — which hide the bottom
  // tab bar — could stay stuck until an app restart. Blurring first fires a
  // clean focusout so the viewport self-heals and the tab bar comes back.
  function closeEdit() {
    (document.activeElement as HTMLElement | null)?.blur?.();
    setEditingId(null);
  }

  function addRow() {
    const id = newId();
    onChange((rs) => { rs.push({ id, name: '', category: categories?.[0], value: 0 }); });
    setEditingId(id);
  }

  return (
    <div className="ft-holdings">
      {rows.map((row, i) =>
        editingId === row.id ? (
          <div className="ft-holding ft-holding--edit" key={row.id}>
            <div className="ft-holding__r1">
              <input
                className="input ft-holding__name"
                value={row.name}
                placeholder={namePlaceholder}
                autoFocus
                onChange={(e) => onChange((rs) => { rs[i].name = e.target.value; })}
              />
              <button
                className="iconbtn ft-holding__del"
                aria-label="Remove"
                title="Remove"
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { closeEdit(); onChange((rs) => { rs.splice(i, 1); }); }}
              >
                <AppIcon name="trash" size={16} />
              </button>
              <button
                className="iconbtn ft-holding__done"
                aria-label="Done"
                title="Done"
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => closeEdit()}
              >
                <AppIcon name="done" size={16} />
              </button>
            </div>
            <div className="ft-holding__r2">
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
              {showUnits && (
                <UnitsField
                  value={row.units ?? 0}
                  onChange={(u) => onChange((rs) => { rs[i].units = u; })}
                />
              )}
            </div>
          </div>
        ) : (
          <button className={`ft-readrow ft-readrow--tap ${avatar ? 'ft-readrow--card' : ''}`} key={row.id} onClick={() => setEditingId(row.id)}>
            {avatar && (
              <span
                className="ft-readrow__avatar"
                style={{ background: `linear-gradient(135deg, ${avatarColor(row.name)}, color-mix(in srgb, ${avatarColor(row.name)} 55%, #000))` }}
              >
                {stockInitials(row.name)}
              </span>
            )}
            {iconFor && (
              <span className="ft-readrow__ic"><AppIcon name={iconFor(row)} size={17} /></span>
            )}
            <span className="ft-readrow__name">
              {row.name.trim() || '—'}
              {row.category && <span className="ft-readrow__cat">{row.category}</span>}
              {showUnits && row.units ? <span className="ft-readrow__cat">{row.units.toLocaleString('en-IN', { maximumFractionDigits: 3 })} units</span> : null}
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

