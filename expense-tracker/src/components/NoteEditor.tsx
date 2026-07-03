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
  const [title, setTitle] = useState(doc.title);
  const [inTable, setInTable] = useState(false);

  // Seed the editable body once; after that it's uncontrolled so the caret is
  // never disturbed by React re-renders.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.innerHTML = doc.body ?? blocksToHtml(doc.blocks ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function focusBody() {
    bodyRef.current?.focus();
  }

  function afterEdit() {
    refreshContext();
    scheduleSave();
  }

  // ---- toolbar commands (mousedown preventDefault keeps the caret) ----
  function toggleList() {
    focusBody();
    document.execCommand('insertUnorderedList');
    afterEdit();
  }

  function insertTable() {
    focusBody();
    document.execCommand('insertHTML', false, TABLE_HTML);
    afterEdit();
  }

  async function addImageFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    for (const f of list) {
      const dataUrl = await imageToDataUrl(f);
      focusBody();
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
    if (table.querySelectorAll('tr').length <= 1) table.remove();
    else row.remove();
    afterEdit();
  }

  function deleteColumn() {
    const cell = currentCell();
    if (!cell) return;
    const idx = Array.from(cell.parentElement!.children).indexOf(cell);
    const table = cell.closest('table')!;
    const rows = Array.from(table.querySelectorAll('tr'));
    if ((rows[0]?.children.length ?? 0) <= 1) table.remove();
    else
      rows.forEach((tr) => {
        tr.children[idx]?.remove();
      });
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
        onKeyUp={refreshContext}
        onMouseUp={refreshContext}
        onPaste={onPaste}
      />

      <div className="notebar">
        <button className="notebar__btn" onMouseDown={keepFocus} onClick={toggleList} title="Bullet list">
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
          <span className="notebar__group">
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
          </span>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onPickImage} />
    </div>
  );
}
