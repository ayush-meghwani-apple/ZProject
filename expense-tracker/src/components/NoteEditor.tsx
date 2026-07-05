import { useEffect, useRef, useState } from 'react';
import { NoteDocRepository } from '../repository/noteDocRepository';
import { NoteCategoryRepository } from '../repository/noteCategoryRepository';
import { imageToDataUrl } from '../core/image';
import { blocksToHtml, isHtmlEmpty, sanitizeHtml } from '../core/noteHtml';
import * as T from '../core/noteTable';
import NoteCategoryModal from './NoteCategoryModal';
import ColorSpectrum from './ColorSpectrum';
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
  const [inListState, setInListState] = useState(false);
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

  // Seed the editable body once; after that it's uncontrolled so the caret is
  // never disturbed by React re-renders.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.innerHTML = doc.body ?? blocksToHtml(doc.blocks ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setInListState(inList());
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

  // Tab / Shift+Tab indents & outdents — inside a list that nests a sub-bullet.
  function onBodyKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    if (inList()) document.execCommand(e.shiftKey ? 'outdent' : 'indent');
    else document.execCommand('insertText', false, '\t');
    afterEdit();
  }

  // ---- toolbar commands (mousedown preventDefault keeps the caret) ----
  function toggleList() {
    restoreSelection();
    document.execCommand('insertUnorderedList');
    afterEdit();
  }

  // Indent / outdent the current bullet (make it a sub-point, or lift it back).
  function indent(out: boolean) {
    restoreSelection();
    document.execCommand(out ? 'outdent' : 'indent');
    afterEdit();
  }

  // Insert a checklist (to-do) item. Pressing Enter inside continues the list;
  // tapping a box toggles it via onBodyClick below.
  function insertTodo() {
    restoreSelection();
    document.execCommand(
      'insertHTML',
      false,
      '<ul class="notetodo" data-fresh="1"><li data-done="false"><br></li></ul><p><br></p>',
    );
    // Drop the caret into the first item instead of the trailing paragraph.
    const ul = bodyRef.current?.querySelector('ul.notetodo[data-fresh]');
    if (ul) {
      ul.removeAttribute('data-fresh');
      const li = ul.querySelector('li') as HTMLElement | null;
      if (li) placeCaret(li);
    }
    afterEdit();
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
    document.execCommand('insertHTML', false, TABLE_HTML.replace('<table', '<table data-fresh="1"'));
    // Drop the caret into the first cell instead of the trailing paragraph.
    const table = bodyRef.current?.querySelector('table[data-fresh]') as HTMLTableElement | null;
    if (table) {
      table.removeAttribute('data-fresh');
      const cell = table.querySelector('td, th') as HTMLElement | null;
      if (cell) placeCaret(cell);
    }
    afterEdit();
  }

  async function addImageFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    for (const f of list) {
      const dataUrl = await imageToDataUrl(f);
      restoreSelection();
      document.execCommand('insertHTML', false, `<img src="${dataUrl}"><p><br></p>`);
    }
    afterEdit();
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
      afterEdit();
      return;
    }
    const rows = T.tableRows(table);
    const row = rows[Math.min(caretRow, rows.length - 1)];
    const target = row?.children[Math.min(caretCol, row.children.length - 1)] as HTMLElement | undefined;
    if (target) placeCaret(target);
    afterEdit();
    requestAnimationFrame(computeGrab);
  }

  function insertRowAt(table: HTMLTableElement, at: number) {
    T.insertRow(table, at);
    afterTableOp(table, false, at, 0);
  }
  function insertColAt(table: HTMLTableElement, at: number) {
    T.insertColumn(table, at);
    afterTableOp(table, false, 0, at);
  }
  function deleteRowAt(table: HTMLTableElement, idx: number) {
    const removed = T.deleteRow(table, idx);
    afterTableOp(table, removed, idx, 0);
  }
  function deleteColAt(table: HTMLTableElement, idx: number) {
    const removed = T.deleteColumn(table, idx);
    afterTableOp(table, removed, 0, idx);
  }

  function deleteTable() {
    const table = currentCell()?.closest('table') ?? null;
    if (!table) return;
    table.remove();
    afterTableOp(table, true, 0, 0);
  }

  function toggleHeaderRow() {
    const table = currentCell()?.closest('table');
    if (!table) return;
    T.toggleHeaderRow(table);
    afterEdit();
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
    if (!d.moved && Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 6) d.moved = true;
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
      T.moveRow(d.table, d.from, to);
      afterTableOp(d.table, false, to > d.from ? to - 1 : to, grab?.colIdx ?? 0);
    } else {
      T.moveColumn(d.table, d.from, to);
      afterTableOp(d.table, false, grab?.rowIdx ?? 0, to > d.from ? to - 1 : to);
    }
  }

  function undo() {
    focusBody();
    document.execCommand('undo');
    afterEdit();
  }

  function redo() {
    focusBody();
    document.execCommand('redo');
    afterEdit();
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
        <button className="btn btn--ghost btn--sm" onClick={exit}>
          ← Notes
        </button>
        <div className="noteedit__actions">
          <button
            className={`iconbtn${pinned ? ' iconbtn--on' : ''}`}
            onMouseDown={keepFocus}
            onClick={() => setPinned((v) => !v)}
            title={pinned ? 'Unpin note' : 'Pin note'}
          >
            📌
          </button>
          <button className="iconbtn" onMouseDown={keepFocus} onClick={undo} title="Undo">
            ↶
          </button>
          <button className="iconbtn" onMouseDown={keepFocus} onClick={redo} title="Redo">
            ↷
          </button>
          <button className="iconbtn" onClick={del} title="Delete note">
            🗑️
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

      <div className="noteedit__cat">
        <button className="catchip" onClick={() => setCatPicker((v) => !v)}>
          {currentCat ? (
            <>
              <span>{currentCat.emoji}</span> {currentCat.name}
            </>
          ) : (
            <>🗂️ Add to category</>
          )}
          <span className="catchip__chev">▾</span>
        </button>
        {catPicker && (
          <div className="catmenu">
            <button className={!categoryId ? 'is-on' : ''} onClick={() => assignCategory(undefined)}>
              🗒️ General
            </button>
            {categories.map((c) => (
              <button key={c.id} className={c.id === categoryId ? 'is-on' : ''} onClick={() => assignCategory(c.id)}>
                <span>{c.emoji}</span> {c.name}
              </button>
            ))}
            <button className="catmenu__new" onClick={() => { setCatPicker(false); setNewCat(true); }}>
              ＋ New category…
            </button>
          </div>
        )}
      </div>

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
            <button
              className="tgrab tgrab--row"
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
              className="tgrab tgrab--col"
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
                      🗑️ Delete row
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
                      🗑️ Delete column
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
            🖍️
          </button>
          <span className="notebar__sep" />
          <button className="notebar__btn" onMouseDown={keepFocus} onClick={toggleList} title="Bullet list">
            • List
          </button>
          <button className="notebar__btn" onMouseDown={keepFocus} onClick={insertTodo} title="Checklist / to-do">
            ☑ To-do
          </button>
          {inListState && (
            <>
              <button className="notebar__btn notebar__btn--sq" onMouseDown={keepFocus} onClick={() => indent(true)} title="Outdent">
                ⇤
              </button>
              <button className="notebar__btn notebar__btn--sq" onMouseDown={keepFocus} onClick={() => indent(false)} title="Indent (sub-point)">
                ⇥
              </button>
            </>
          )}
          <button
            className="notebar__btn"
            onMouseDown={keepFocus}
            onClick={() => fileRef.current?.click()}
            title="Insert image"
          >
            🖼️ Image
          </button>
          <button className="notebar__btn" onMouseDown={keepFocus} onClick={insertTable} title="Insert table">
            ▦ Table
          </button>

          {inTable && (
            <>
              <span className="notebar__sep" />
              <button className="notebar__btn" onMouseDown={keepFocus} onClick={toggleHeaderRow} title="Toggle header row">
                Header
              </button>
              <button className="notebar__btn" onMouseDown={keepFocus} onClick={copyTable} title="Copy table">
                ⧉ Copy
              </button>
              <button className="notebar__btn notebar__btn--danger" onMouseDown={keepFocus} onClick={deleteTable} title="Delete table">
                🗑️ Table
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
