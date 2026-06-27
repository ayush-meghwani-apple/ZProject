import { useState } from 'react';
import { cycleName, cycleLabel } from '../core/salaryCycle';
import type { SalaryCycle } from '../types/models';

interface Props {
  cycles: SalaryCycle[]; // sorted newest-first
  value: string[]; // selected cycle ids
  onChange: (ids: string[]) => void;
}

/**
 * Filters a list of cycle-tagged items by the selected cycle ids.
 * - No cycles exist -> return everything (filtering is meaningless).
 * - Empty selection -> nothing.
 * - All cycles selected -> everything (including items with no cycle).
 */
export function filterByCycles<T extends { salaryCycleId?: string }>(
  items: T[],
  cycles: SalaryCycle[],
  selected: string[],
): T[] {
  if (cycles.length === 0) return items;
  if (selected.length === 0) return [];
  if (selected.length === cycles.length) return items;
  const set = new Set(selected);
  return items.filter((i) => i.salaryCycleId && set.has(i.salaryCycleId));
}

export function selectionLabel(cycles: SalaryCycle[], selected: string[]): string {
  if (cycles.length === 0) return 'All expenses';
  if (selected.length === 0) return 'None selected';
  if (selected.length === cycles.length) return 'All cycles';
  const names = cycles.filter((c) => selected.includes(c.id)).map(cycleName);
  if (names.length === 1) return names[0];
  return `${names[names.length - 1]} … ${names[0]} (${names.length})`;
}

export default function CycleFilter({ cycles, value, onChange }: Props) {
  const [open, setOpen] = useState(false);

  if (cycles.length === 0) {
    return (
      <div className="card filter">
        <div className="muted">No cycles yet — showing all expenses. Start one in Settings.</div>
      </div>
    );
  }

  const allSelected = value.length === cycles.length;

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  function toggleAll() {
    onChange(allSelected ? [] : cycles.map((c) => c.id));
  }

  return (
    <div className="card filter">
      <button className="filter__head" onClick={() => setOpen((o) => !o)}>
        <span>
          <span className="muted">Showing</span>{' '}
          <strong>{selectionLabel(cycles, value)}</strong>
        </span>
        <span className="muted">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="filter__list">
          <label className="filter__row">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            <strong>All cycles</strong>
          </label>
          {cycles.map((c) => (
            <label className="filter__row" key={c.id}>
              <input
                type="checkbox"
                checked={value.includes(c.id)}
                onChange={() => toggle(c.id)}
              />
              <span className="filter__name">{cycleName(c)}</span>
              <span className="muted filter__range">{cycleLabel(c)}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
