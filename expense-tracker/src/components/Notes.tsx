import { useEffect, useRef, useState } from 'react';
import { NoteDocRepository } from '../repository/noteDocRepository';
import { imageToDataUrl } from '../core/image';
import { formatDate, newId } from '../core/util';
import type { NoteBlock, NoteBlockType, NoteDoc } from '../types/models';

interface Props {
  version: number;
  onChange: () => void;
}

function makeBlock(type: NoteBlockType): NoteBlock {
  return { id: newId(), type, text: '', url: '' };
}

/** True when a note has no title and no block with any content. */
function isEmptyDoc(doc: NoteDoc): boolean {
  if (doc.title.trim()) return false;
  return doc.blocks.every((b) => {
    if (b.type === 'image') return !b.dataUrl;
    if (b.type === 'link') return !b.url?.trim();
    return !b.text?.trim();
  });
}

/** A one-line preview of a note for the list. */
function previewOf(doc: NoteDoc): string {
  for (const b of doc.blocks) {
    if ((b.type === 'text' || b.type === 'bullets') && b.text?.trim()) {
      return b.text.trim().replace(/\s+/g, ' ');
    }
    if (b.type === 'image' && b.dataUrl) return '🖼️ Image';
    if (b.type === 'link' && b.url) return `🔗 ${b.url}`;
  }
  return 'Empty note';
}

function normalizeUrl(url: string): string {
  const u = url.trim();
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

function domainOf(url: string): string {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export default function Notes({ version, onChange }: Props) {
  const [docs, setDocs] = useState<NoteDoc[]>([]);
  const [draft, setDraft] = useState<NoteDoc | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  async function load() {
    setDocs(await NoteDocRepository.getAll());
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  // Debounced autosave while editing, so nothing is ever lost.
  useEffect(() => {
    if (!draft) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      NoteDocRepository.update(draft);
    }, 500);
    return () => window.clearTimeout(saveTimer.current);
  }, [draft]);

  async function startNew() {
    const doc = await NoteDocRepository.add({ title: '', blocks: [makeBlock('text')] });
    setDraft(doc);
  }

  function startEdit(doc: NoteDoc) {
    setDraft({ ...doc, blocks: doc.blocks.map((b) => ({ ...b })) });
  }

  async function back() {
    window.clearTimeout(saveTimer.current);
    if (draft) {
      if (isEmptyDoc(draft)) await NoteDocRepository.remove(draft.id);
      else await NoteDocRepository.update(draft);
    }
    setDraft(null);
    await load();
    onChange();
  }

  async function deleteDoc(doc: NoteDoc) {
    if (!confirm('Delete this note?')) return;
    window.clearTimeout(saveTimer.current);
    await NoteDocRepository.remove(doc.id);
    setDraft(null);
    await load();
    onChange();
  }

  // ---- draft mutations ----
  function patchBlock(id: string, patch: Partial<NoteBlock>) {
    setDraft((d) =>
      d ? { ...d, blocks: d.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) } : d,
    );
  }
  function addBlock(block: NoteBlock) {
    setDraft((d) => (d ? { ...d, blocks: [...d.blocks, block] } : d));
  }
  function removeBlock(id: string) {
    setDraft((d) => (d ? { ...d, blocks: d.blocks.filter((b) => b.id !== id) } : d));
  }
  function moveBlock(id: string, dir: -1 | 1) {
    setDraft((d) => {
      if (!d) return d;
      const i = d.blocks.findIndex((b) => b.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.blocks.length) return d;
      const blocks = [...d.blocks];
      [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
      return { ...d, blocks };
    });
  }

  async function addImageFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    for (const f of list) {
      const dataUrl = await imageToDataUrl(f);
      addBlock({ id: newId(), type: 'image', dataUrl });
    }
  }

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) addImageFiles(e.target.files);
    e.target.value = '';
  }

  function onPaste(e: React.ClipboardEvent) {
    const imgItems = Array.from(e.clipboardData.items).filter((it) =>
      it.type.startsWith('image/'),
    );
    if (imgItems.length === 0) return; // let text paste happen normally
    e.preventDefault();
    const files = imgItems.map((it) => it.getAsFile()).filter(Boolean) as File[];
    if (files.length) addImageFiles(files);
  }

  // ---- List view ----
  if (!draft) {
    return (
      <div className="page">
        <button className="btn" style={{ width: '100%' }} onClick={startNew}>
          ➕ New Note
        </button>

        {docs.length === 0 && (
          <div className="empty">No notes yet. Create one to jot things down.</div>
        )}

        {docs.map((doc) => (
          <button className="card notecard" key={doc.id} onClick={() => startEdit(doc)}>
            <div className="notecard__title">{doc.title.trim() || 'Untitled note'}</div>
            <div className="notecard__preview">{previewOf(doc)}</div>
            <div className="notecard__date">{formatDate(doc.updatedAt)}</div>
          </button>
        ))}
      </div>
    );
  }

  // ---- Editor view ----
  return (
    <div className="page noteedit" onPaste={onPaste}>
      <div className="noteedit__bar">
        <button className="btn btn--ghost btn--sm" onClick={back}>
          ← Notes
        </button>
        <button className="iconbtn" onClick={() => deleteDoc(draft)} title="Delete note">
          🗑️
        </button>
      </div>

      <input
        className="input noteedit__title"
        placeholder="Title"
        value={draft.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
      />

      {draft.blocks.map((b, i) => (
        <div className="noteblock" key={b.id}>
          <div className="noteblock__bar">
            <span className="noteblock__type">
              {b.type === 'text'
                ? '¶ Text'
                : b.type === 'bullets'
                  ? '• List'
                  : b.type === 'image'
                    ? '🖼️ Image'
                    : '🔗 Link'}
            </span>
            <div className="noteblock__tools">
              <button
                className="iconbtn"
                onClick={() => moveBlock(b.id, -1)}
                disabled={i === 0}
                aria-label="Move up"
              >
                ⬆️
              </button>
              <button
                className="iconbtn"
                onClick={() => moveBlock(b.id, 1)}
                disabled={i === draft.blocks.length - 1}
                aria-label="Move down"
              >
                ⬇️
              </button>
              <button className="iconbtn" onClick={() => removeBlock(b.id)} aria-label="Delete block">
                🗑️
              </button>
            </div>
          </div>

          {b.type === 'text' && (
            <textarea
              className="input noteblock__text"
              rows={3}
              placeholder="Write something…"
              value={b.text ?? ''}
              onChange={(e) => patchBlock(b.id, { text: e.target.value })}
            />
          )}

          {b.type === 'bullets' && (
            <textarea
              className="input noteblock__text"
              rows={3}
              placeholder="One item per line"
              value={b.text ?? ''}
              onChange={(e) => patchBlock(b.id, { text: e.target.value })}
            />
          )}

          {b.type === 'image' &&
            (b.dataUrl ? (
              <img className="noteblock__img" src={b.dataUrl} alt="note attachment" />
            ) : (
              <div className="muted">Image not available.</div>
            ))}

          {b.type === 'link' && (
            <div className="noteblock__link">
              <input
                className="input"
                placeholder="https://…"
                inputMode="url"
                value={b.url ?? ''}
                onChange={(e) => patchBlock(b.id, { url: e.target.value })}
              />
              {b.url?.trim() && (
                <a
                  className="notelink"
                  href={normalizeUrl(b.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  🔗 {domainOf(b.url)} ↗
                </a>
              )}
            </div>
          )}
        </div>
      ))}

      <div className="noteedit__add">
        <button className="btn btn--ghost btn--sm" onClick={() => addBlock(makeBlock('text'))}>
          ¶ Text
        </button>
        <button className="btn btn--ghost btn--sm" onClick={() => addBlock(makeBlock('bullets'))}>
          • List
        </button>
        <button className="btn btn--ghost btn--sm" onClick={() => fileRef.current?.click()}>
          🖼️ Image
        </button>
        <button className="btn btn--ghost btn--sm" onClick={() => addBlock(makeBlock('link'))}>
          🔗 Link
        </button>
      </div>

      <p className="card__subtitle noteedit__hint">
        Tip: you can paste a screenshot or copied image straight in. Changes save automatically.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={onPickImage}
      />
    </div>
  );
}
