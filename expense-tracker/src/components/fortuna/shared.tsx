import { useState, type ReactNode } from 'react';
import AmountInput from '../AmountInput';
import AppIcon from '../AppIcon';
import { formatINR } from '../../core/util';

/** A titled card section used across Fortuna tabs. When `collapsible` is set the
 *  header becomes a toggle and the body hides when collapsed — so a long tab
 *  (e.g. Portfolio) can show just headings + amounts until you tap to expand. */
export function Section({
  title,
  subtitle,
  right,
  children,
  collapsible,
  defaultOpen = true,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const showBody = !collapsible || open;

  if (collapsible) {
    return (
      <section className={`ft-section ft-section--collapsible ${open ? 'ft-section--open' : ''}`}>
        <button className="ft-section__toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="ft-section__togglehead">
            <span>
              <span className="ft-section__title">{title}</span>
              {subtitle && <span className="ft-section__sub">{subtitle}</span>}
            </span>
            {right}
          </span>
          <AppIcon name={open ? 'chevronUp' : 'chevronDown'} size={18} />
        </button>
        {showBody && <div className="ft-section__body">{children}</div>}
      </section>
    );
  }

  return (
    <section className="ft-section">
      <div className="ft-section__head">
        <div>
          <h3 className="ft-section__title">{title}</h3>
          {subtitle && <p className="ft-section__sub">{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className="ft-section__body">{children}</div>
    </section>
  );
}

/** A label + money input row bound to a number. */
export function MoneyRow({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <label className="ft-row">
      <span className="ft-row__label">
        {label}
        {hint && <span className="ft-row__hint">{hint}</span>}
      </span>
      <span className="ft-row__field">
        <span className="ft-row__cur">₹</span>
        <AmountInput className="input ft-row__input" value={value} onChange={onChange} placeholder="0" />
      </span>
    </label>
  );
}

/** Like {@link MoneyRow} but presented as a clean, tappable read row (matching
 *  the holdings lists): shows the name + amount; tapping opens an inline editor
 *  to rename it and change its value. Used for the built-in fixed Portfolio
 *  lines (Home, REITs, S&P 500 ETF…) so they can be renamed without a permanent
 *  pencil cluttering the row. */
export function RenamableMoneyRow({
  label,
  value,
  onChange,
  onRename,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);

  function open() {
    setDraft(label);
    setEditing(true);
  }
  function commit() {
    onRename(draft.trim() || label);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="ft-holding">
        <input
          className="input ft-holding__name"
          value={draft}
          autoFocus
          placeholder="Name"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
        <span className="ft-holding__amt">
          <span className="ft-row__cur">₹</span>
          <AmountInput className="input ft-holding__val" value={value} onChange={onChange} placeholder="0" />
        </span>
        <button className="iconbtn ft-holding__done" aria-label="Done" title="Done" onMouseDown={(e) => e.preventDefault()} onClick={commit}>
          <AppIcon name="done" size={16} />
        </button>
      </div>
    );
  }

  return (
    <button className="ft-readrow ft-readrow--tap" onClick={open}>
      <span className="ft-readrow__name">{label.trim() || '—'}</span>
      <span className="ft-readrow__val">{formatINR(value)}</span>
      <AppIcon name="chevronRight" size={15} className="ft-readrow__chev" />
    </button>
  );
}

/** A compact on/off toggle switch. Safe to place inside a clickable header — it
 *  stops click/pointer events from bubbling to the parent. */
export function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  label?: string;
}) {
  return (
    <span
      className="ft-switchwrap"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {label && <span className="ft-switch__label">{label}</span>}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label ?? 'Toggle'}
        className={`ft-switch ${on ? 'ft-switch--on' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onChange(!on);
        }}
      >
        <span className="ft-switch__knob" />
      </button>
    </span>
  );
}

/** A label + percent input row (whole-number %). */
export function PercentRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="ft-row">
      <span className="ft-row__label">{label}</span>
      <span className="ft-row__field ft-row__field--pct">
        <input
          className="input ft-row__input"
          type="text"
          inputMode="decimal"
          value={Number.isFinite(value) ? String(value) : ''}
          onChange={(e) => {
            const cleaned = e.target.value.replace(/[^0-9.]/g, '');
            onChange(cleaned === '' ? 0 : parseFloat(cleaned) || 0);
          }}
          placeholder="0"
        />
        <span className="ft-row__cur">%</span>
      </span>
    </label>
  );
}

/** A read-only computed total line. */
export function TotalRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`ft-total ${strong ? 'ft-total--strong' : ''}`}>
      <span>{label}</span>
      <span className="ft-total__val">{formatINR(value)}</span>
    </div>
  );
}

/** A big headline stat (net worth, surplus…). */
export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'pos' | 'neg' | 'neutral';
}) {
  const t = tone ?? (value < 0 ? 'neg' : 'neutral');
  return (
    <div className={`ft-stat ft-stat--${t}`}>
      <span className="ft-stat__label">{label}</span>
      <span className="ft-stat__val">{formatINR(value)}</span>
    </div>
  );
}

export { formatINR };
