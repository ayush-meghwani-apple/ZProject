import { Fragment, useState } from 'react';
import type { BreakdownRow } from '../../core/plannerMath';
import { formatINR } from './shared';
import AppIcon from '../AppIcon';

/** Palette cycled across a class's sub-category slices. */
const PALETTE = ['#6366f1', '#0ea5e9', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#ec4899', '#84cc16', '#f97316'];

/** A compact stacked bar + legend showing how one asset class splits across its
 *  sub-categories. Slices that carry `children` (e.g. a fund type → its funds)
 *  are tappable to drill one level deeper. */
export default function DistributionBar({ rows }: { rows: BreakdownRow[] }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const total = rows.reduce((s, r) => s + (r.value || 0), 0);
  if (!(total > 0)) return null;
  const toggle = (k: string) =>
    setOpen((prev) => {
      const s = new Set(prev);
      if (s.has(k)) s.delete(k);
      else s.add(k);
      return s;
    });

  return (
    <div className="ft-dist">
      <div className="ft-bar">
        {rows.map((r, i) => (
          <span
            key={r.label}
            className="ft-bar__seg"
            style={{ width: `${(r.value / total) * 100}%`, background: PALETTE[i % PALETTE.length] }}
            title={r.label}
          />
        ))}
      </div>
      <ul className="ft-legend">
        {rows.map((r, i) => {
          const color = PALETTE[i % PALETTE.length];
          const expandable = !!(r.children && r.children.length > 1);
          const isOpen = open.has(r.label);
          return (
            <Fragment key={r.label}>
              <li
                className={`ft-legend__item ${expandable ? 'ft-legend__item--exp' : ''}`}
                onClick={expandable ? () => toggle(r.label) : undefined}
              >
                <span className="ft-legend__dot" style={{ background: color }} />
                <span className="ft-legend__label">
                  {r.label}
                  {expandable && <AppIcon name={isOpen ? 'chevronUp' : 'chevronDown'} size={13} className="ft-legend__chev" />}
                </span>
                <span className="ft-legend__pct">{Math.round((r.value / total) * 100)}%</span>
                <span className="ft-legend__val">{formatINR(r.value)}</span>
              </li>
              {expandable && isOpen &&
                r.children!.map((c) => (
                  <li key={`${r.label}-${c.label}`} className="ft-legend__item ft-legend__sub">
                    <span className="ft-legend__label">{c.label}</span>
                    <span className="ft-legend__pct">{Math.round(r.value ? (c.value / r.value) * 100 : 0)}%</span>
                    <span className="ft-legend__val">{formatINR(c.value)}</span>
                  </li>
                ))}
            </Fragment>
          );
        })}
      </ul>
    </div>
  );
}

