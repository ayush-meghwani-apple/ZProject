import { useEffect, useState } from 'react';
import { NoteDocRepository } from '../repository/noteDocRepository';
import { NoteCategoryRepository } from '../repository/noteCategoryRepository';
import { blocksToHtml, htmlToPreview } from '../core/noteHtml';
import { formatDate } from '../core/util';
import NoteEditor from './NoteEditor';
import NoteCategoryModal from './NoteCategoryModal';
import type { ID, NoteCategory, NoteDoc } from '../types/models';

interface Props {
  version: number;
  onChange: () => void;
  openId: ID | null;
  setOpenId: (id: ID | null) => void;
}

function previewOf(doc: NoteDoc): string {
  return htmlToPreview(doc.body ?? blocksToHtml(doc.blocks ?? []));
}

const GENERAL = '__general__';

export default function Notes({ version, onChange, openId, setOpenId }: Props) {
  const [docs, setDocs] = useState<NoteDoc[]>([]);
  const [cats, setCats] = useState<NoteCategory[]>([]);
  const [openDoc, setOpenDoc] = useState<NoteDoc | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editCat, setEditCat] = useState<NoteCategory | 'new' | null>(null);

  async function load() {
    const [d, c] = await Promise.all([
      NoteDocRepository.getAll(),
      NoteCategoryRepository.getAll(),
    ]);
    setDocs(d);
    setCats(c);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  // Re-open the remembered note when returning to this tab (id survives remount).
  useEffect(() => {
    let alive = true;
    if (!openId) {
      setOpenDoc(null);
      return;
    }
    NoteDocRepository.get(openId).then((d) => {
      if (alive) setOpenDoc(d ?? null);
    });
    return () => {
      alive = false;
    };
  }, [openId, version]);

  async function startNew() {
    const doc = await NoteDocRepository.add({ title: '', body: '' });
    setOpenId(doc.id);
  }

  async function exitEditor() {
    setOpenId(null);
    await load();
    onChange();
  }

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function moveCat(id: ID, dir: -1 | 1) {
    await NoteCategoryRepository.move(id, dir);
    await load();
  }

  async function deleteCat(cat: NoteCategory) {
    if (!confirm(`Delete category “${cat.name}”? Its notes move to General.`)) return;
    await NoteCategoryRepository.remove(cat.id);
    await load();
    onChange();
  }

  async function saveCat(data: { name: string; emoji: string }) {
    if (editCat === 'new') await NoteCategoryRepository.add(data);
    else if (editCat) await NoteCategoryRepository.update({ ...editCat, ...data });
    setEditCat(null);
    await load();
  }

  if (openDoc) {
    return (
      <NoteEditor
        key={openDoc.id}
        doc={openDoc}
        categories={cats}
        onExit={exitEditor}
        onCategoriesChanged={load}
      />
    );
  }

  // Bucket notes: each known category (in order), then General for the rest.
  const byCat = new Map<string, NoteDoc[]>();
  const catIds = new Set(cats.map((c) => c.id));
  for (const d of docs) {
    const key = d.categoryId && catIds.has(d.categoryId) ? d.categoryId : GENERAL;
    const list = byCat.get(key) ?? [];
    list.push(d);
    byCat.set(key, list);
  }

  const groups = cats.map((c) => ({
    id: c.id,
    name: c.name,
    emoji: c.emoji,
    notes: byCat.get(c.id) ?? [],
    real: true,
  }));
  const generalNotes = byCat.get(GENERAL) ?? [];
  if (generalNotes.length > 0 || cats.length === 0) {
    groups.push({ id: GENERAL, name: 'General', emoji: '🗒️', notes: generalNotes, real: false });
  }

  return (
    <div className="page">
      <div className="notes__actions">
        <button className="btn notes__new" onClick={startNew}>
          ➕ New Note
        </button>
        <button className="btn btn--ghost" onClick={() => setEditCat('new')} title="Add category">
          🗂️ Category
        </button>
      </div>

      {docs.length === 0 && cats.length === 0 && (
        <div className="empty">No notes yet. Create one to jot things down.</div>
      )}

      {groups.map((g, gi) => {
        const open = !collapsed.has(g.id);
        return (
          <div className="notegroup" key={g.id}>
            <div className="notegroup__head">
              <button className="notegroup__toggle" onClick={() => toggle(g.id)}>
                <span className={`notegroup__chev${open ? ' notegroup__chev--open' : ''}`}>▸</span>
                <span className="notegroup__emoji">{g.emoji}</span>
                <span className="notegroup__name">{g.name}</span>
                <span className="notegroup__count">{g.notes.length}</span>
              </button>
              {g.real && (
                <div className="notegroup__ctrls">
                  <button className="notegroup__ic" disabled={gi === 0} onClick={() => moveCat(g.id, -1)} title="Move up">
                    ↑
                  </button>
                  <button className="notegroup__ic" disabled={gi >= cats.length - 1} onClick={() => moveCat(g.id, 1)} title="Move down">
                    ↓
                  </button>
                  <button className="notegroup__ic" onClick={() => setEditCat(cats.find((c) => c.id === g.id)!)} title="Edit">
                    ✎
                  </button>
                  <button className="notegroup__ic notegroup__ic--danger" onClick={() => deleteCat(cats.find((c) => c.id === g.id)!)} title="Delete">
                    🗑️
                  </button>
                </div>
              )}
            </div>

            {open && (
              <div className="notegroup__body">
                {g.notes.length === 0 && <div className="notegroup__empty">No notes here yet.</div>}
                {g.notes.map((doc) => (
                  <button className="card notecard" key={doc.id} onClick={() => setOpenId(doc.id)}>
                    <div className="notecard__title">{doc.title.trim() || 'Untitled note'}</div>
                    <div className="notecard__preview">{previewOf(doc)}</div>
                    <div className="notecard__date">{formatDate(doc.updatedAt)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {editCat && (
        <NoteCategoryModal
          initial={editCat === 'new' ? null : editCat}
          onSave={saveCat}
          onClose={() => setEditCat(null)}
        />
      )}
    </div>
  );
}
