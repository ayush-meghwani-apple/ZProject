import { useEffect, useRef, useState } from 'react';
import { NoteDocRepository } from '../repository/noteDocRepository';
import { NoteCategoryRepository } from '../repository/noteCategoryRepository';
import { imageToDataUrl } from '../core/image';
import { blocksToHtml, isHtmlEmpty, sanitizeHtml } from '../core/noteHtml';
import * as T from '../core/noteTable';
import NoteCategoryModal from './NoteCategoryModal';
import ColorSpectrum from './ColorSpectrum';
import AppIcon from './AppIcon';
import type { ID, NoteCategory, NoteDoc } from '../types/models';

interface Props {
  doc: NoteDoc;
  categories: NoteCategory[];
  onExit: () => void;
  onCategoriesChanged?: () => void;
}

const TABLE_HTML =
  '<table class="notetable"><tbody>' +
  '<tr><td><br></td><td><br></td></tr>' +
  '<tr><td><br></td><td><br></td></tr>' +
  '</tbody></table><p><br></p>';

/** Where the drag/tap grabbers should sit, in coordinates relative to the
 *  body wrapper (recomputed as the caret moves or the body scrolls). */
interface GrabGeo {
  rowIdx: number;
  colIdx: number;
  rowTop: number;
  rowH: number;
  colLeft: number;
  colW: number;
  tableTop: number;
  tableLeft: number;
  tableW: number;
  tableH: number;
}

/**
 * A free-form rich note editor: a fixed title on top and one big editable body
 * that fills the rest. A bottom bar gives shortcuts for bullet lists, images and
 * tables. When the caret is in a table, drag-grabbers appear on the active row
 * and column to reorder them (tap a grabber for insert/delete). Content is
 * stored as HTML and autosaves as you type.
 */
export default function NoteEditor({ doc, categories, onExit, onCategoriesChanged }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const lastRange = useRef<Range | null>(null);
  const [title, setTitle] = useState(doc.title);
  const [inTable, setInTable] = useState(false);
  // Which category this note is in, plus the category picker / new-category sheet.
  const [categoryId, setCategoryId] = useState<ID | undefined>(doc.categoryId);
  const [catPicker, setCatPicker] = useState(false);
  const [newCat, setNewCat] = useState(false);
  const [pinned, setPinned] = useState(!!doc.pinned);

  // Which inline formats are active at the caret, so the B/I/U/S buttons can
  // show an on/off cue.
  const [fmt, setFmt] = useState({ bold: false, italic: false, underline: false, strike: false });
  // Which colour popover (if any) is open. A custom palette keeps it open until
  // you pick again or tap elsewhere (the native picker closed on every pick).
  const [pop, setPop] = useState<'fore' | 'back' | null>(null);

  // Grabber overlay geometry + the drag/tap-menu state that drives it.
  const [grab, setGrab] = useState<GrabGeo | null>(null);
  const [menu, setMenu] = useState<{ axis: 'row' | 'col'; index: number; table: HTMLTableElement; x: number; y: number; up: boolean } | null>(null);
  const [drop, setDrop] = useState<{ axis: 'row' | 'col'; pos: number } | null>(null);
  // While dragging a grabber, how far it has followed the pointer (px).
  const [dragShift, setDragShift] = useState(0);
  const drag = useRef<{ axis: 'row' | 'col'; from: number; table: HTMLTableElement; startX: number; startY: number; moved: boolean } | null>(null);
  const dropIdx = useRef<number | null>(null);

  // Custom undo/redo history. contentEditable's native undo can't see the manual
  // DOM edits we make (insert/delete/move table rows & columns, checklists), so
  // we keep our own stack of body-HTML snapshots and drive the ↶/↷ buttons from
  // it. Typing is coalesced; structural edits are recorded as discrete steps.
  const history = useRef<string[]>([]);
  const histIdx = useRef(-1);
  const histTimer = useRef<number | undefined>(undefined);

  // Seed the editable body once; after that it's uncontrolled so the caret is
  // never disturbed by React re-renders.
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.innerHTML = doc.body ?? blocksToHtml(doc.blocks ?? []);
      history.current = [bodyRef.current.innerHTML];
      histIdx.current = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While the note editor is open, mark the root so the global app header is
  // kept visible even when the keyboard opens. Otherwise hiding the header (done
  // elsewhere to reclaim space) makes this editor's top toolbar jump up under
  // the phone's status bar / notch when the keyboard appears.
  useEffect(() => {
    document.documentElement.classList.add('note-editing');
    return () => document.documentElement.classList.remove('note-editing');
  }, []);

  // Remember the last selection inside the body, so colour pickers (which steal
  // focus when their native picker opens) can restore it before applying.
  useEffect(() => {
    function onSelect() {
      const sel = document.getSelection();
      if (sel && sel.rangeCount && bodyRef.current?.contains(sel.anchorNode)) {
        lastRange.current = sel.getRangeAt(0).cloneRange();
        updateFmt();
      }
    }
    document.addEventListener('selectionchange', onSelect);
    return () => document.removeEventListener('selectionchange', onSelect);
  }, []);

  // Close the row/column tap-menu when tapping anywhere that isn't the menu or a
  // grabber, and keep the grabbers aligned when the viewport/keyboard resizes.
  useEffect(() => {
    function onDown(e: PointerEvent) {
      const t = e.target as Element;
      if (!t.closest?.('.tmenu') && !t.closest?.('.tgrab')) setMenu(null);
      if (!t.closest?.('.colorpop') && !t.closest?.('.notebar__color')) setPop(null);
      if (!t.closest?.('.noteedit__cat')) setCatPicker(false);
    }
    function onResize() {
      computeGrab();
    }
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function currentHtml(): string {
    return bodyRef.current?.innerHTML ?? '';
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer.current);
    const snapshotTitle = title;
    const snapshotCat = categoryId;
    const snapshotPin = pinned;
    saveTimer.current = window.setTimeout(() => {
      NoteDocRepository.update({ ...doc, title: snapshotTitle, body: sanitizeHtml(currentHtml()), categoryId: snapshotCat, pinned: snapshotPin });
    }, 500);
  }

  // Keep track of whether the caret is inside a table so we can show row/col
  // controls contextually.
  function refreshContext() {
    setInTable(!!currentCell());
    computeGrab();
    updateFmt();
  }

  // Read the browser's current formatting state so the toolbar can highlight the
  // buttons that are "on" at the caret.
  function updateFmt() {
    try {
      setFmt({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strike: document.queryCommandState('strikeThrough'),
      });
    } catch {
      /* queryCommandState can throw if there's no selection yet */
    }
  }

  // Position the drag/tap grabbers over the active row & column. Coordinates are
  // relative to the (non-scrolling) body wrapper, so they follow the table as
  // the body scrolls or the caret moves between cells.
  function computeGrab() {
    const cell = currentCell();
    const wrap = wrapRef.current;
    if (!cell || !wrap) {
      setGrab(null);
      return;
    }
    const pos = T.cellPosition(cell);
    if (!pos) {
      setGrab(null);
      return;
    }
    const wrapRect = wrap.getBoundingClientRect();
    const rowRect = (cell.parentElement as HTMLElement).getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    const tableRect = pos.table.getBoundingClientRect();
    setGrab({
      rowIdx: pos.rowIdx,
      colIdx: pos.colIdx,
      rowTop: rowRect.top - wrapRect.top,
      rowH: rowRect.height,
      colLeft: cellRect.left - wrapRect.left,
      colW: cellRect.width,
      tableTop: tableRect.top - wrapRect.top,
      tableLeft: tableRect.left - wrapRect.left,
      tableW: tableRect.width,
      tableH: tableRect.height,
    });
  }

  function currentCell(): HTMLTableCellElement | null {
    const sel = document.getSelection();
    let n: Node | null = sel && sel.rangeCount ? sel.anchorNode : null;
    while (n && n !== bodyRef.current) {
      if (n instanceof HTMLTableCellElement) return n;
      n = n.parentNode;
    }
    return null;
  }

  /** Put the caret at the start of a cell and remember it (keeps table controls up). */
  function placeCaret(cell: HTMLElement) {
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(true);
    const sel = document.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    lastRange.current = range.cloneRange();
  }

  function focusBody() {
    bodyRef.current?.focus();
  }

  function afterEdit() {
    refreshContext();
    scheduleSave();
    snapshot();
  }

  // Like afterEdit but records the new state as a discrete, immediate undo step
  // (used after structural DOM edits the native undo stack can't track).
  function afterStructural() {
    refreshContext();
    scheduleSave();
    snapshot(true);
  }

  // Push the current body HTML onto the history stack. Debounced by default so
  // continuous typing collapses into one step; pass immediate=true for edits
  // that should be their own undo step.
  function snapshot(immediate = false) {
    const html = currentHtml();
    window.clearTimeout(histTimer.current);
    const commit = () => {
      if (history.current[histIdx.current] === html) return;
      history.current = history.current.slice(0, histIdx.current + 1);
      history.current.push(html);
      if (history.current.length > 120) history.current.shift();
      histIdx.current = history.current.length - 1;
    };
    if (immediate) commit();
    else histTimer.current = window.setTimeout(commit, 350);
  }

  // Restore a snapshot into the body (used by undo/redo) and drop the caret at
  // the end without recording a new history step.
  function restoreHistory(html: string) {
    const body = bodyRef.current;
    if (!body) return;
    body.innerHTML = html;
    focusBody();
    const range = document.createRange();
    range.selectNodeContents(body);
    range.collapse(false);
    const sel = document.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    lastRange.current = range.cloneRange();
    refreshContext();
    scheduleSave();
  }

  // The top-level block (direct child of the body) that contains the caret, so
  // new checklists/tables are inserted as siblings instead of nested inside a
  // list item (which broke the structure).
  function currentTopBlock(): HTMLElement | null {
    const sel = document.getSelection();
    let n: Node | null = sel && sel.rangeCount ? sel.anchorNode : null;
    while (n && n.parentNode && n.parentNode !== bodyRef.current) n = n.parentNode;
    return n && n.parentNode === bodyRef.current ? (n as HTMLElement) : null;
  }

  // Insert a block-level element (its first element) at the top level of the
  // body, after the caret's current block, and guarantee an editable paragraph
  // after it so the user can move below.
  function insertBlockHtml(html: string): HTMLElement | null {
    const body = bodyRef.current;
    if (!body) return null;
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const node = tmp.firstElementChild as HTMLElement | null;
    if (!node) return null;
    const block = currentTopBlock();
    if (block && block.parentNode === body) {
      const empty = block.tagName === 'P' && !block.textContent?.trim();
      if (empty) block.replaceWith(node);
      else block.after(node);
    } else {
      body.appendChild(node);
    }
    if (!node.nextElementSibling) {
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      node.after(p);
    }
    return node;
  }

  // After indenting a to-do list, execCommand creates a plain nested <ul>; re-tag
  // any lists inside a checklist as notetodo so sub-points stay checkboxes
  // instead of turning into bullets.
  function normalizeTodos() {
    bodyRef.current?.querySelectorAll('ul.notetodo').forEach((root) => {
      root.querySelectorAll('ul').forEach((u) => u.classList.add('notetodo'));
      root.querySelectorAll('li').forEach((li) => {
        if (!li.hasAttribute('data-done')) li.setAttribute('data-done', 'false');
      });
    });
  }

  function restoreSelection() {
    // If the caret is already live inside the body (toolbar buttons keep focus
    // via mousedown-preventDefault), leave it alone — re-adding a cloned range
    // resets the browser's pending bold/italic state and breaks toggling off.
    const sel = document.getSelection();
    if (sel && sel.rangeCount && bodyRef.current?.contains(sel.anchorNode)) return;
    const r = lastRange.current;
    if (!r) {
      focusBody();
      return;
    }
    sel?.removeAllRanges();
    sel?.addRange(r);
  }

  // ---- inline text formatting ----
  function format(command: string) {
    restoreSelection();
    document.execCommand(command);
    afterEdit();
  }

  function applyColor(kind: 'fore' | 'back', value: string) {
    restoreSelection();
    document.execCommand('styleWithCSS', false, 'true');
    if (kind === 'fore') {
      document.execCommand('foreColor', false, value);
    } else if (!document.execCommand('hiliteColor', false, value)) {
      document.execCommand('backColor', false, value);
    }
    afterEdit();
  }

  function inList(): boolean {
    const sel = document.getSelection();
    let n: Node | null = sel && sel.rangeCount ? sel.anchorNode : null;
    while (n && n !== bodyRef.current) {
      if (n instanceof HTMLLIElement) return true;
      n = n.parentNode;
    }
    return false;
  }

  // Tab / Shift+Tab indents & outdents — lists nest sub-bullets, plain text gets
  // a real left-margin step (not just tab characters).
  function onBodyKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    indent(e.shiftKey);
  }

  // ---- toolbar commands (mousedown preventDefault keeps the caret) ----
  function toggleList() {
    restoreSelection();
    snapshot(true);
    document.execCommand('insertUnorderedList');
    afterStructural();
  }

  // Indent / outdent the current line. In a list it nests a sub-bullet; in plain
  // text it steps the block's left margin by a proper amount (execCommand's plain
  // indent only nudged it a couple of spaces).
  function indent(out: boolean) {
    restoreSelection();
    snapshot(true);
    if (inList()) {
      document.execCommand(out ? 'outdent' : 'indent');
      normalizeTodos();
    } else {
      const block = currentTopBlock();
      if (block && block.nodeType === 1) {
        const step = 28;
        const cur = parseFloat(block.style.marginLeft || '0') || 0;
        const next = Math.max(0, cur + (out ? -step : step));
        block.style.marginLeft = next ? `${next}px` : '';
      } else {
        document.execCommand(out ? 'outdent' : 'indent');
      }
    }
    afterStructural();
  }

  // Insert a checklist (to-do) item. Pressing Enter inside continues the list;
  // tapping a box toggles it via onBodyClick below.
  function insertTodo() {
    restoreSelection();
    snapshot(true);
    const ul = insertBlockHtml('<ul class="notetodo"><li data-done="false"><br></li></ul>');
    if (ul) {
      const li = ul.querySelector('li') as HTMLElement | null;
      if (li) placeCaret(li);
    }
    afterStructural();
  }

  // Toggle a checklist item when its box (the left gutter) is tapped.
  function onBodyClick(e: React.MouseEvent) {
    const li = (e.target as HTMLElement).closest?.('ul.notetodo > li') as HTMLLIElement | null;
    if (!li) return;
    const rect = li.getBoundingClientRect();
    if (e.clientX - rect.left <= 30) {
      const done = li.getAttribute('data-done') === 'true';
      li.setAttribute('data-done', done ? 'false' : 'true');
      afterEdit();
    }
  }

  function insertTable() {
    restoreSelection();
    snapshot(true);
    const table = insertBlockHtml(TABLE_HTML) as HTMLTableElement | null;
    if (table) {
      const cell = table.querySelector('td, th') as HTMLElement | null;
      if (cell) placeCaret(cell);
    }
    afterStructural();
  }

  async function addImageFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (list.length) snapshot(true);
    for (const f of list) {
      const dataUrl = await imageToDataUrl(f);
      restoreSelection();
      document.execCommand('insertHTML', false, `<img src="${dataUrl}"><p><br></p>`);
    }
    afterStructural();
  }

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) addImageFiles(e.target.files);
    e.target.value = '';
  }

  function onPaste(e: React.ClipboardEvent) {
    const imgItems = Array.from(e.clipboardData.items).filter((it) =>
      it.type.startsWith('image/'),
    );
    if (imgItems.length > 0) {
      e.preventDefault();
      const files = imgItems.map((it) => it.getAsFile()).filter(Boolean) as File[];
      if (files.length) addImageFiles(files);
    }
    // Non-image pastes fall through; sanitizeHtml cleans them on save.
  }

  // ---- table ops (via the pure helpers in core/noteTable) ----
  /** Run a table mutation, then re-save, refresh context and reposition grabbers. */
  function afterTableOp(table: HTMLTableElement | null, removed: boolean, caretRow: number, caretCol: number) {
    setMenu(null);
    setDrop(null);
    if (removed || !table || !table.isConnected) {
      setGrab(null);
      focusBody();
      afterStructural();
      return;
    }
    const rows = T.tableRows(table);
    const row = rows[Math.min(caretRow, rows.length - 1)];
    const target = row?.children[Math.min(caretCol, row.children.length - 1)] as HTMLElement | undefined;
    focusBody();
    if (target) placeCaret(target);
    afterStructural();
    requestAnimationFrame(computeGrab);
  }

  function insertRowAt(table: HTMLTableElement, at: number) {
    snapshot(true);
    T.insertRow(table, at);
    afterTableOp(table, false, at, 0);
  }
  function insertColAt(table: HTMLTableElement, at: number) {
    snapshot(true);
    T.insertColumn(table, at);
    afterTableOp(table, false, 0, at);
  }
  function deleteRowAt(table: HTMLTableElement, idx: number) {
    snapshot(true);
    const removed = T.deleteRow(table, idx);
    afterTableOp(table, removed, idx, 0);
  }
  function deleteColAt(table: HTMLTableElement, idx: number) {
    snapshot(true);
    const removed = T.deleteColumn(table, idx);
    afterTableOp(table, removed, 0, idx);
  }

  function deleteTable() {
    const table = currentCell()?.closest('table') ?? null;
    if (!table) return;
    snapshot(true);
    table.remove();
    afterTableOp(table, true, 0, 0);
  }

  function toggleHeaderRow() {
    const table = currentCell()?.closest('table');
    if (!table) return;
    snapshot(true);
    T.toggleHeaderRow(table);
    afterStructural();
  }

  async function copyTable() {
    const table = currentCell()?.closest('table');
    if (!table) return;
    const html = table.outerHTML;
    const text = T.tableToText(table);
    try {
      if (navigator.clipboard && 'write' in navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      /* clipboard blocked — nothing else we can do */
    }
  }

  // ---- grabber drag + tap ----
  function onGrabDown(e: React.PointerEvent, axis: 'row' | 'col') {
    const cell = currentCell();
    const pos = cell && T.cellPosition(cell);
    if (!pos) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      axis,
      from: axis === 'row' ? pos.rowIdx : pos.colIdx,
      table: pos.table,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    dropIdx.current = null;
  }

  function onGrabMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 6) {
      d.moved = true;
      // Once a real drag starts, get the tap-menu out of the way.
      setMenu(null);
    }
    if (!d.moved) return;
    // Let the grabber follow the finger, just like the drop-line cue.
    setDragShift(d.axis === 'row' ? e.clientY - d.startY : e.clientX - d.startX);
    const wrap = wrapRef.current!;
    const wrapRect = wrap.getBoundingClientRect();
    if (d.axis === 'row') {
      const idx = T.rowIndexFromY(d.table, e.clientY);
      // Dropping at its own slot (from) or right after it (from+1) is a no-op —
      // don't show a cue on the row being dragged.
      if (idx === d.from || idx === d.from + 1) {
        dropIdx.current = null;
        setDrop(null);
        return;
      }
      dropIdx.current = idx;
      const rows = T.tableRows(d.table);
      const y = rows[idx]
        ? rows[idx].getBoundingClientRect().top - wrapRect.top
        : rows[rows.length - 1].getBoundingClientRect().bottom - wrapRect.top;
      setDrop({ axis: 'row', pos: y });
    } else {
      const idx = T.colIndexFromX(d.table, e.clientX);
      if (idx === d.from || idx === d.from + 1) {
        dropIdx.current = null;
        setDrop(null);
        return;
      }
      dropIdx.current = idx;
      const cells = Array.from(T.tableRows(d.table)[0].children) as HTMLElement[];
      const x = cells[idx]
        ? cells[idx].getBoundingClientRect().left - wrapRect.left
        : cells[cells.length - 1].getBoundingClientRect().right - wrapRect.left;
      setDrop({ axis: 'col', pos: x });
    }
  }

  function onGrabUp(e: React.PointerEvent, axis: 'row' | 'col') {
    const d = drag.current;
    drag.current = null;
    setDragShift(0);
    if (!d) return;
    if (!d.moved) {
      // A tap (not a drag) opens the insert/delete menu next to the grabber. If
      // there isn't room below (e.g. the table sits above the keyboard), open it
      // upward instead so it isn't hidden.
      const wrap = wrapRef.current!;
      const wrapRect = wrap.getBoundingClientRect();
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const spaceBelow = wrapRect.bottom - r.bottom;
      const up = spaceBelow < 160;
      setMenu({
        axis,
        index: d.from,
        table: d.table,
        up,
        x: axis === 'row' ? r.right - wrapRect.left + 4 : r.left - wrapRect.left,
        y: up
          ? r.top - wrapRect.top
          : axis === 'row'
            ? r.top - wrapRect.top
            : r.bottom - wrapRect.top + 4,
      });
      return;
    }
    const to = dropIdx.current;
    dropIdx.current = null;
    setDrop(null);
    if (to == null) return;
    if (axis === 'row') {
      snapshot(true);
      T.moveRow(d.table, d.from, to);
      afterTableOp(d.table, false, to > d.from ? to - 1 : to, grab?.colIdx ?? 0);
    } else {
      snapshot(true);
      T.moveColumn(d.table, d.from, to);
      afterTableOp(d.table, false, grab?.rowIdx ?? 0, to > d.from ? to - 1 : to);
    }
  }

  function undo() {
    snapshot(true); // make sure the present state is recorded first
    if (histIdx.current <= 0) return;
    histIdx.current--;
    restoreHistory(history.current[histIdx.current]);
  }

  function redo() {
    window.clearTimeout(histTimer.current);
    if (histIdx.current >= history.current.length - 1) return;
    histIdx.current++;
    restoreHistory(history.current[histIdx.current]);
  }

  // ---- navigation ----
  function exit() {
    window.clearTimeout(saveTimer.current);
    const body = sanitizeHtml(currentHtml());
    if (!title.trim() && isHtmlEmpty(body)) {
      NoteDocRepository.remove(doc.id).then(onExit);
    } else {
      NoteDocRepository.update({ ...doc, title, body, categoryId, pinned }).then(onExit);
    }
  }

  function del() {
    if (!confirm('Delete this note?')) return;
    window.clearTimeout(saveTimer.current);
    NoteDocRepository.remove(doc.id).then(onExit);
  }

  // ---- category ----
  async function assignCategory(id: ID | undefined) {
    setCategoryId(id);
    setCatPicker(false);
    await NoteDocRepository.setCategory(doc.id, id);
  }

  async function createCategory(data: { name: string; emoji: string }) {
    const cat = await NoteCategoryRepository.add(data);
    setNewCat(false);
    await assignCategory(cat.id);
    onCategoriesChanged?.();
  }

  const currentCat = categories.find((c) => c.id === categoryId);

  // Prevent the toolbar buttons from stealing focus / collapsing the caret.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="noteedit">
      <div className="noteedit__top">
        <button className="btn btn--ghost btn--sm noteedit__back" onClick={exit}>
          <AppIcon name="back" size={17} /> Notes
        </button>
        <div className="noteedit__actions">
          <button
            className={`iconbtn${pinned ? ' iconbtn--on' : ''}`}
            onMouseDown={keepFocus}
            onClick={() => setPinned((v) => !v)}
            title={pinned ? 'Unpin note' : 'Pin note'}
          >
            <AppIcon name="pin" size={18} />
          </button>
          <button className="iconbtn" onMouseDown={keepFocus} onClick={undo} title="Undo">
            <AppIcon name="undo" size={18} />
          </button>
          <button className="iconbtn" onMouseDown={keepFocus} onClick={redo} title="Redo">
            <AppIcon name="redo" size={18} />
          </button>
          <div className="noteedit__cat">
            <button
              className={`iconbtn${categoryId ? ' iconbtn--on' : ''}`}
              onMouseDown={keepFocus}
              onClick={() => setCatPicker((v) => !v)}
              title="Category"
            >
              {currentCat ? <span className="iconbtn__emoji">{currentCat.emoji}</span> : <AppIcon name="folder" size={18} />}
            </button>
            {catPicker && (
              <div className="catmenu catmenu--right">
                <button className={!categoryId ? 'is-on' : ''} onClick={() => assignCategory(undefined)}>
                  🗒️ General
                </button>
                {categories.map((c) => (
                  <button key={c.id} className={c.id === categoryId ? 'is-on' : ''} onClick={() => assignCategory(c.id)}>
                    <span>{c.emoji}</span> {c.name}
                  </button>
                ))}
                <button className="catmenu__new" onClick={() => { setCatPicker(false); setNewCat(true); }}>
                  <AppIcon name="plus" size={15} /> New category…
                </button>
              </div>
            )}
          </div>
          <button className="iconbtn" onClick={del} title="Delete note">
            <AppIcon name="trash" size={18} />
          </button>
        </div>
      </div>

      <input
        className="input noteedit__title"
        placeholder="Title"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          scheduleSave();
        }}
      />

      <div className="notebody-wrap" ref={wrapRef}>
        <div
          ref={bodyRef}
          className="notebody"
          contentEditable
          suppressContentEditableWarning
          data-placeholder="Start writing…"
          onInput={afterEdit}
          onKeyDown={onBodyKeyDown}
          onKeyUp={refreshContext}
          onMouseUp={refreshContext}
          onClick={onBodyClick}
          onScroll={computeGrab}
          onPaste={onPaste}
        />

        {inTable && grab && (
          <div className="tgrabs">
            {/* When a grabber's menu is open, outline the whole row/column it acts on. */}
            {menu?.axis === 'row' && (
              <div
                className="tsel tsel--row"
                style={{ top: grab.rowTop, height: grab.rowH, left: grab.tableLeft, width: grab.tableW }}
              />
            )}
            {menu?.axis === 'col' && (
              <div
                className="tsel tsel--col"
                style={{ left: grab.colLeft, width: grab.colW, top: grab.tableTop, height: grab.tableH }}
              />
            )}
            <button
              className={`tgrab tgrab--row${menu?.axis === 'row' ? ' tgrab--on' : ''}`}
              style={{
                top: grab.rowTop,
                height: grab.rowH,
                left: Math.max(grab.tableLeft - 15, 0),
                transform: drag.current?.axis === 'row' ? `translateY(${dragShift}px)` : undefined,
              }}
              onPointerDown={(e) => onGrabDown(e, 'row')}
              onPointerMove={onGrabMove}
              onPointerUp={(e) => onGrabUp(e, 'row')}
              title="Drag to move row · tap for options"
            >
              ⋮
            </button>
            <button
              className={`tgrab tgrab--col${menu?.axis === 'col' ? ' tgrab--on' : ''}`}
              style={{
                left: grab.colLeft,
                width: grab.colW,
                top: Math.max(grab.tableTop - 15, 0),
                transform: drag.current?.axis === 'col' ? `translateX(${dragShift}px)` : undefined,
              }}
              onPointerDown={(e) => onGrabDown(e, 'col')}
              onPointerMove={onGrabMove}
              onPointerUp={(e) => onGrabUp(e, 'col')}
              title="Drag to move column · tap for options"
            >
              ⋯
            </button>
            {drop?.axis === 'row' && <div className="tdrop tdrop--row" style={{ top: drop.pos, left: grab.tableLeft }} />}
            {drop?.axis === 'col' && <div className="tdrop tdrop--col" style={{ left: drop.pos, top: grab.tableTop }} />}
            {menu && (
              <div className={`tmenu${menu.up ? ' tmenu--up' : ''}`} style={{ left: menu.x, top: menu.y }}>
                {menu.axis === 'row' ? (
                  <>
                    <button onPointerDown={(e) => e.preventDefault()} onClick={() => insertRowAt(menu.table, menu.index)}>
                      ↑ Insert above
                    </button>
                    <button onPointerDown={(e) => e.preventDefault()} onClick={() => insertRowAt(menu.table, menu.index + 1)}>
                      ↓ Insert below
                    </button>
                    <button className="tmenu__danger" onPointerDown={(e) => e.preventDefault()} onClick={() => deleteRowAt(menu.table, menu.index)}>
                      <AppIcon name="trash" size={15} /> Delete row
                    </button>
                  </>
                ) : (
                  <>
                    <button onPointerDown={(e) => e.preventDefault()} onClick={() => insertColAt(menu.table, menu.index)}>
                      ← Insert left
                    </button>
                    <button onPointerDown={(e) => e.preventDefault()} onClick={() => insertColAt(menu.table, menu.index + 1)}>
                      → Insert right
                    </button>
                    <button className="tmenu__danger" onPointerDown={(e) => e.preventDefault()} onClick={() => deleteColAt(menu.table, menu.index)}>
                      <AppIcon name="trash" size={15} /> Delete column
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="notebar" data-noswipe>
        {pop && (
          <div className="colorpop">
            <div className="colorpop__head">
              <span className="colorpop__title">{pop === 'fore' ? 'Text colour' : 'Highlight'}</span>
              <button className="colorpop__done" onMouseDown={keepFocus} onClick={() => setPop(null)}>
                Done
              </button>
            </div>
            <ColorSpectrum onPick={(hex) => applyColor(pop, hex)} />
          </div>
        )}
        <div className="notebar__row">
          <button className={`notebar__btn notebar__btn--sq${fmt.bold ? ' is-active' : ''}`} onMouseDown={keepFocus} onClick={() => format('bold')} title="Bold">
            <b>B</b>
          </button>
          <button className={`notebar__btn notebar__btn--sq${fmt.italic ? ' is-active' : ''}`} onMouseDown={keepFocus} onClick={() => format('italic')} title="Italic">
            <i>I</i>
          </button>
          <button className={`notebar__btn notebar__btn--sq${fmt.underline ? ' is-active' : ''}`} onMouseDown={keepFocus} onClick={() => format('underline')} title="Underline">
            <u>U</u>
          </button>
          <button className={`notebar__btn notebar__btn--sq${fmt.strike ? ' is-active' : ''}`} onMouseDown={keepFocus} onClick={() => format('strikeThrough')} title="Strikethrough">
            <s>S</s>
          </button>
          <button
            className={`notebar__btn notebar__color${pop === 'fore' ? ' is-active' : ''}`}
            onMouseDown={keepFocus}
            onClick={() => setPop(pop === 'fore' ? null : 'fore')}
            title="Text colour"
          >
            <span className="notebar__colorA">A</span>
          </button>
          <button
            className={`notebar__btn notebar__color${pop === 'back' ? ' is-active' : ''}`}
            onMouseDown={keepFocus}
            onClick={() => setPop(pop === 'back' ? null : 'back')}
            title="Highlight colour"
          >
            <AppIcon name="highlight" size={18} />
          </button>
          <span className="notebar__sep" />
          <button className="notebar__btn notebar__btn--sq" onMouseDown={keepFocus} onClick={toggleList} title="Bullet list">
            <AppIcon name="bulletList" size={18} />
          </button>
          <button className="notebar__btn notebar__btn--sq" onMouseDown={keepFocus} onClick={insertTodo} title="Checklist / to-do">
            <AppIcon name="todo" size={18} />
          </button>
          <button className="notebar__btn notebar__btn--sq" onMouseDown={keepFocus} onClick={() => indent(true)} title="Outdent">
            <AppIcon name="outdent" size={18} />
          </button>
          <button className="notebar__btn notebar__btn--sq" onMouseDown={keepFocus} onClick={() => indent(false)} title="Indent (sub-point)">
            <AppIcon name="indent" size={18} />
          </button>
          <button
            className="notebar__btn notebar__btn--sq"
            onMouseDown={keepFocus}
            onClick={() => fileRef.current?.click()}
            title="Insert image"
          >
            <AppIcon name="image" size={18} />
          </button>
          <button className="notebar__btn notebar__btn--sq" onMouseDown={keepFocus} onClick={insertTable} title="Insert table">
            <AppIcon name="table" size={18} />
          </button>

          {inTable && (
            <>
              <span className="notebar__sep" />
              <button className="notebar__btn notebar__btn--sq" onMouseDown={keepFocus} onClick={toggleHeaderRow} title="Toggle header row">
                <AppIcon name="header" size={18} />
              </button>
              <button className="notebar__btn notebar__btn--sq" onMouseDown={keepFocus} onClick={copyTable} title="Copy table">
                <AppIcon name="copy" size={18} />
              </button>
              <button className="notebar__btn notebar__btn--sq notebar__btn--danger" onMouseDown={keepFocus} onClick={deleteTable} title="Delete table">
                <AppIcon name="trash" size={18} />
              </button>
            </>
          )}
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onPickImage} />

      {newCat && <NoteCategoryModal initial={null} onSave={createCategory} onClose={() => setNewCat(false)} />}
    </div>
  );
}
