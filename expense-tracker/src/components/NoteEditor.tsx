import { useEffect, useRef, useState } from 'react';
import { NoteDocRepository } from '../repository/noteDocRepository';
import { imageToDataUrl } from '../core/image';
import { blocksToHtml, isHtmlEmpty, sanitizeHtml } from '../core/noteHtml';
import type { NoteDoc } from '../types/models';

interface Props {
  doc: NoteDoc;
  onExit: () => void;
}

const TABLE_HTML =
  '<table class="notetable"><tbody>' +
  '<tr><td><br></td><td><br></td></tr>' +
  '<tr><td><br></td><td><br></td></tr>' +
  '</tbody></table><p><br></p>';

/**
 * A free-form rich note editor: a fixed title on top and one big editable body
 * that fills the rest. A bottom bar gives shortcuts for bullet lists, images and
 * tables (with row/column controls when the caret is inside a table). Content is
 * stored as HTML and autosaves as you type.
 */
export default function NoteEditor({ doc, onExit }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const lastRange = useRef<Range | null>(null);
  const [title, setTitle] = useState(doc.title);
  const [inTable, setInTable] = useState(false);

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
      }
    }
    document.addEventListener('selectionchange', onSelect);
    return () => document.removeEventListener('selectionchange', onSelect);
  }, []);

  function currentHtml(): string {
    return bodyRef.current?.innerHTML ?? '';
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer.current);
    const snapshotTitle = title;
    saveTimer.current = window.setTimeout(() => {
      NoteDocRepository.update({ ...doc, title: snapshotTitle, body: sanitizeHtml(currentHtml()) });
    }, 500);
  }

  // Keep track of whether the caret is inside a table so we can show row/col
  // controls contextually.
  function refreshContext() {
    setInTable(!!currentCell());
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
    const r = lastRange.current;
    if (!r) {
      focusBody();
      return;
    }
    const sel = document.getSelection();
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

  function insertTable() {
    restoreSelection();
    document.execCommand('insertHTML', false, TABLE_HTML);
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

  // ---- table row/column ops ----
  function addRow() {
    const cell = currentCell();
    if (!cell) return;
    const row = cell.parentElement as HTMLTableRowElement;
    const cols = row.children.length;
    const newRow = document.createElement('tr');
    for (let i = 0; i < cols; i++) {
      const td = document.createElement('td');
      td.innerHTML = '<br>';
      newRow.appendChild(td);
    }
    row.after(newRow);
    afterEdit();
  }

  function addColumn() {
    const cell = currentCell();
    if (!cell) return;
    const idx = Array.from(cell.parentElement!.children).indexOf(cell);
    const table = cell.closest('table');
    table?.querySelectorAll('tr').forEach((tr) => {
      const td = document.createElement('td');
      td.innerHTML = '<br>';
      const ref = tr.children[idx];
      if (ref) ref.after(td);
      else tr.appendChild(td);
    });
    afterEdit();
  }

  function deleteRow() {
    const cell = currentCell();
    if (!cell) return;
    const row = cell.parentElement as HTMLTableRowElement;
    const table = row.closest('table')!;
    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length <= 1) {
      table.remove();
      focusBody();
      afterEdit();
      return;
    }
    const idx = rows.indexOf(row);
    row.remove();
    // Keep the caret in the table so the row/col controls stay visible.
    const nextRow = table.querySelectorAll('tr')[Math.min(idx, rows.length - 2)] as HTMLTableRowElement;
    const target = nextRow?.children[0] as HTMLElement | undefined;
    if (target) placeCaret(target);
    afterEdit();
  }

  function deleteColumn() {
    const cell = currentCell();
    if (!cell) return;
    const idx = Array.from(cell.parentElement!.children).indexOf(cell);
    const table = cell.closest('table')!;
    const rows = Array.from(table.querySelectorAll('tr'));
    const colCount = rows[0]?.children.length ?? 0;
    if (colCount <= 1) {
      table.remove();
      focusBody();
      afterEdit();
      return;
    }
    rows.forEach((tr) => tr.children[idx]?.remove());
    // Keep the caret in the table so the row/col controls stay visible.
    const row = cell.parentElement === null ? rows[0] : (table.querySelectorAll('tr')[0] as HTMLTableRowElement);
    const target = row?.children[Math.min(idx, colCount - 2)] as HTMLElement | undefined;
    if (target) placeCaret(target);
    afterEdit();
  }

  function deleteTable() {
    const cell = currentCell();
    const table = cell?.closest('table');
    if (!table) return;
    table.remove();
    focusBody();
    afterEdit();
  }

  // Toggle the table's first row between header cells (<th>) and normal (<td>).
  function toggleHeaderRow() {
    const cell = currentCell();
    const table = cell?.closest('table');
    const firstRow = table?.querySelector('tr');
    if (!firstRow) return;
    const isHeader = !!firstRow.querySelector('th');
    Array.from(firstRow.children).forEach((c) => {
      const el = document.createElement(isHeader ? 'td' : 'th');
      el.innerHTML = c.innerHTML || '<br>';
      c.replaceWith(el);
    });
    afterEdit();
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
      NoteDocRepository.update({ ...doc, title, body }).then(onExit);
    }
  }

  function del() {
    if (!confirm('Delete this note?')) return;
    window.clearTimeout(saveTimer.current);
    NoteDocRepository.remove(doc.id).then(onExit);
  }

  // Prevent the toolbar buttons from stealing focus / collapsing the caret.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="noteedit">
      <div className="noteedit__top">
        <button className="btn btn--ghost btn--sm" onClick={exit}>
          ← Notes
        </button>
        <button className="iconbtn" onClick={del} title="Delete note">
          🗑️
        </button>
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
        onPaste={onPaste}
      />

      <div className="notebar">
        <div className="notebar__row">
          <button className="notebar__btn notebar__btn--sq" onMouseDown={keepFocus} onClick={() => format('bold')} title="Bold">
            <b>B</b>
          </button>
          <button className="notebar__btn notebar__btn--sq" onMouseDown={keepFocus} onClick={() => format('italic')} title="Italic">
            <i>I</i>
          </button>
          <button className="notebar__btn notebar__btn--sq" onMouseDown={keepFocus} onClick={() => format('underline')} title="Underline">
            <u>U</u>
          </button>
          <button className="notebar__btn notebar__btn--sq" onMouseDown={keepFocus} onClick={() => format('strikeThrough')} title="Strikethrough">
            <s>S</s>
          </button>
          <label className="notebar__color" title="Text colour">
            <span>A</span>
            <input type="color" defaultValue="#a5b4fc" onInput={(e) => applyColor('fore', e.currentTarget.value)} />
          </label>
          <label className="notebar__color" title="Highlight colour">
            <span>🖍️</span>
            <input type="color" defaultValue="#fde68a" onInput={(e) => applyColor('back', e.currentTarget.value)} />
          </label>
          <span className="notebar__sep" />
          <button className="notebar__btn notebar__btn--sq" onMouseDown={keepFocus} onClick={undo} title="Undo">
            ↶
          </button>
          <button className="notebar__btn notebar__btn--sq" onMouseDown={keepFocus} onClick={redo} title="Redo">
            ↷
          </button>
        </div>

        <div className="notebar__row">
          <button className="notebar__btn" onMouseDown={keepFocus} onClick={toggleList} title="Bullet list (Tab to indent)">
            • List
          </button>
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
              <button className="notebar__btn" onMouseDown={keepFocus} onClick={addRow} title="Add row">
                ＋Row
              </button>
              <button className="notebar__btn" onMouseDown={keepFocus} onClick={addColumn} title="Add column">
                ＋Col
              </button>
              <button className="notebar__btn" onMouseDown={keepFocus} onClick={deleteRow} title="Delete row">
                －Row
              </button>
              <button className="notebar__btn" onMouseDown={keepFocus} onClick={deleteColumn} title="Delete column">
                －Col
              </button>
              <button className="notebar__btn" onMouseDown={keepFocus} onClick={toggleHeaderRow} title="Toggle header row">
                Header
              </button>
              <button className="notebar__btn notebar__btn--danger" onMouseDown={keepFocus} onClick={deleteTable} title="Delete table">
                🗑️ Table
              </button>
            </>
          )}
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onPickImage} />
    </div>
  );
}
