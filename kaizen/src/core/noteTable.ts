/**
 * Pure DOM helpers for editing the tables inside a note's contentEditable body.
 * Kept separate from the editor component so the table logic is reusable and
 * easy to reason about: every function takes the <table> element (and indices)
 * and mutates it in place.
 */

export function tableRows(table: HTMLTableElement): HTMLTableRowElement[] {
  return Array.from(table.querySelectorAll('tr'));
}

export interface CellPos {
  table: HTMLTableElement;
  rowIdx: number;
  colIdx: number;
}

/** Locate a cell's table plus its row/column index, or null if not in a table. */
export function cellPosition(cell: HTMLTableCellElement): CellPos | null {
  const table = cell.closest('table');
  if (!table) return null;
  const row = cell.parentElement as HTMLTableRowElement;
  return {
    table,
    rowIdx: tableRows(table).indexOf(row),
    colIdx: Array.from(row.children).indexOf(cell),
  };
}

function newCell(header: boolean): HTMLTableCellElement {
  const el = document.createElement(header ? 'th' : 'td');
  el.innerHTML = '<br>';
  return el;
}

/** Insert a fresh row at index `at` (rows shift down). Returns the new row. */
export function insertRow(table: HTMLTableElement, at: number): HTMLTableRowElement {
  const rows = tableRows(table);
  const cols = rows[0]?.children.length ?? 1;
  const tr = document.createElement('tr');
  for (let i = 0; i < cols; i++) tr.appendChild(newCell(false));
  const ref = rows[at];
  if (ref) ref.parentElement!.insertBefore(tr, ref);
  else (table.querySelector('tbody') ?? table).appendChild(tr);
  return tr;
}

/** Insert a fresh column at index `at` (columns shift right). */
export function insertColumn(table: HTMLTableElement, at: number): void {
  tableRows(table).forEach((r) => {
    const header = r.firstElementChild?.tagName === 'TH';
    const cell = newCell(header);
    const ref = r.children[at];
    if (ref) r.insertBefore(cell, ref);
    else r.appendChild(cell);
  });
}

/** Delete row `idx`. Removes the whole table if it was the last row; returns
 *  true when the table itself was removed. */
export function deleteRow(table: HTMLTableElement, idx: number): boolean {
  const rows = tableRows(table);
  if (rows.length <= 1) {
    table.remove();
    return true;
  }
  rows[idx]?.remove();
  return false;
}

/** Delete column `idx`. Removes the whole table if it was the last column;
 *  returns true when the table itself was removed. */
export function deleteColumn(table: HTMLTableElement, idx: number): boolean {
  const rows = tableRows(table);
  const cols = rows[0]?.children.length ?? 0;
  if (cols <= 1) {
    table.remove();
    return true;
  }
  rows.forEach((r) => r.children[idx]?.remove());
  return false;
}

/** Move row `from` so it lands at insertion index `insertIdx` (0..rowCount). */
export function moveRow(table: HTMLTableElement, from: number, insertIdx: number): void {
  const rows = tableRows(table);
  const moving = rows[from];
  if (!moving || insertIdx === from || insertIdx === from + 1) return;
  const ref = rows[insertIdx] ?? null;
  moving.parentElement!.insertBefore(moving, ref);
}

/** Move column `from` so it lands at insertion index `insertIdx` (0..colCount). */
export function moveColumn(table: HTMLTableElement, from: number, insertIdx: number): void {
  if (insertIdx === from || insertIdx === from + 1) return;
  tableRows(table).forEach((r) => {
    const cells = Array.from(r.children);
    const moving = cells[from];
    if (!moving) return;
    const ref = cells[insertIdx] ?? null;
    r.insertBefore(moving, ref);
  });
}

/** Toggle the first row between header (<th>) and normal (<td>) cells. */
export function toggleHeaderRow(table: HTMLTableElement): void {
  const firstRow = table.querySelector('tr');
  if (!firstRow) return;
  const isHeader = !!firstRow.querySelector('th');
  Array.from(firstRow.children).forEach((c) => {
    const el = document.createElement(isHeader ? 'td' : 'th');
    el.innerHTML = c.innerHTML || '<br>';
    c.replaceWith(el);
  });
}

/** A plain-text (tab/newline separated) rendering of a table, for the clipboard. */
export function tableToText(table: HTMLTableElement): string {
  return tableRows(table)
    .map((r) =>
      Array.from(r.children)
        .map((c) => (c.textContent ?? '').trim())
        .join('\t'),
    )
    .join('\n');
}

/** Find the insertion row index (0..rowCount) closest to a client Y position. */
export function rowIndexFromY(table: HTMLTableElement, y: number): number {
  const rows = tableRows(table);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i].getBoundingClientRect();
    if (y < r.top + r.height / 2) return i;
  }
  return rows.length;
}

/** Find the insertion column index (0..colCount) closest to a client X position. */
export function colIndexFromX(table: HTMLTableElement, x: number): number {
  const first = tableRows(table)[0];
  if (!first) return 0;
  const cells = Array.from(first.children);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i].getBoundingClientRect();
    if (x < c.left + c.width / 2) return i;
  }
  return cells.length;
}
