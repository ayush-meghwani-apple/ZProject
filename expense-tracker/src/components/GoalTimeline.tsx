import { useState } from 'react';
import { corpusAtMonth, projectGoal } from '../core/finance';
import { addMonths, formatINR, formatMonthYear, monthsBetween } from '../core/util';
import type { Goal } from '../types/models';

/** Compact INR for big projected numbers, e.g. ₹12.5L / ₹1.2Cr. */
function compactINR(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  return formatINR(Math.round(n));
}

/**
 * A scrubbable month-by-month view of a goal. Drag the slider to any month
 * between today and the goal date to see how much you'll have saved by then and
 * how far short of the target you still are.
 */
export default function GoalTimeline({ goal }: { goal: Goal }) {
  const totalMonths = Math.max(1, Math.round(goal.years * 12));
  const proj = projectGoal(goal);
  const start = goal.createdAt ? new Date(goal.createdAt) : new Date();
  const elapsed = Math.min(totalMonths, Math.max(0, monthsBetween(start, new Date())));
  const [month, setMonth] = useState(elapsed);

  const { corpus } = corpusAtMonth(goal, month);
  const target = proj.targetFuture;
  const gap = target - corpus;
  const onTrack = gap <= 0;
  const date = addMonths(start, month);
  const tag = month <= 0 ? ' · start' : month >= totalMonths ? ' · goal date' : '';

  return (
    <div className="timeline">
      <div className="timeline__head">
        <span className="muted">Timeline</span>
        <strong>
          {formatMonthYear(date)}
          {tag}
        </strong>
      </div>
      <input
        className="timeline__range"
        type="range"
        min={0}
        max={totalMonths}
        value={month}
        onChange={(e) => setMonth(Number(e.target.value))}
        aria-label="Scrub goal timeline"
      />
      <div className="timeline__read">
        <div className="timeline__metric">
          <span className="goal__label">By then you'll have</span>
          <span className="goal__value">{compactINR(corpus)}</span>
        </div>
        <div className="timeline__metric">
          <span className="goal__label">{onTrack ? 'Surplus' : 'Short by'}</span>
          <span className={`goal__value ${onTrack ? 'pos' : 'neg'}`}>
            {compactINR(Math.abs(gap))}
          </span>
        </div>
      </div>
    </div>
  );
}
