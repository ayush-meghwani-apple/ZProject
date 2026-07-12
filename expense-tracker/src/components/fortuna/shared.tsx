import type { ReactNode } from 'react';
import AmountInput from '../AmountInput';
import { formatINR } from '../../core/util';

/** A titled card section used across Fortuna tabs. */
export function Section({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
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
