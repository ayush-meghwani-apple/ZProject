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
