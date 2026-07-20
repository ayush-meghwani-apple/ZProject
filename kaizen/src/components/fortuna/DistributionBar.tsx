import type { BreakdownRow } from '../../core/plannerMath';
import { formatINR } from './shared';

/** Palette cycled across a class's sub-category slices. */
const PALETTE = ['#6366f1', '#0ea5e9', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#ec4899', '#84cc16', '#f97316'];

/** A compact stacked bar + legend showing how one asset class splits across its
 *  sub-categories (Stocks vs fund types, cash vs FDs vs EPF, …). */
export default function DistributionBar({ rows }: { rows: BreakdownRow[] }) {
  const total = rows.reduce((s, r) => s + (r.value || 0), 0);
  if (!(total > 0)) return null;
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
        {rows.map((r, i) => (
          <li key={r.label} className="ft-legend__item">
            <span className="ft-legend__dot" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="ft-legend__label">{r.label}</span>
            <span className="ft-legend__pct">{Math.round((r.value / total) * 100)}%</span>
            <span className="ft-legend__val">{formatINR(r.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
