import { useEffect, useState } from 'react';
import { NoteDocRepository } from '../repository/noteDocRepository';
import { NoteCategoryRepository } from '../repository/noteCategoryRepository';
import NoteEditor from './NoteEditor';
import NoteCategoryModal from './NoteCategoryModal';
import NoteRow from './NoteRow';
import AppIcon from './AppIcon';
import type { ID, NoteCategory, NoteDoc } from '../types/models';

interface Props {
  version: number;
  onChange: () => void;
  openId: ID | null;
  setOpenId: (id: ID | null) => void;
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

  async function startNew(categoryId?: ID) {
    const doc = await NoteDocRepository.add({ title: '', body: '', categoryId });
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

  async function deleteNote(id: ID) {
    if (!confirm('Delete this note?')) return;
    await NoteDocRepository.remove(id);
    await load();
    onChange();
  }

  async function moveNote(id: ID, categoryId: ID | undefined) {
    await NoteDocRepository.setCategory(id, categoryId);
    await load();
  }

  async function togglePin(doc: NoteDoc) {
    await NoteDocRepository.setPinned(doc.id, !doc.pinned);
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

  // Bucket notes: General first (always pinned to the top), then each category
  // in order. Within a group, pinned notes float above the rest.
  const byCat = new Map<string, NoteDoc[]>();
  const catIds = new Set(cats.map((c) => c.id));
  for (const d of docs) {
    const key = d.categoryId && catIds.has(d.categoryId) ? d.categoryId : GENERAL;
    const list = byCat.get(key) ?? [];
    list.push(d);
    byCat.set(key, list);
  }
  const sortPinned = (list: NoteDoc[]) =>
    [...list].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  interface Group {
    id: string;
    name: string;
    emoji: string;
    notes: NoteDoc[];
    catIndex: number; // -1 for General
  }
  const groups: Group[] = [
    { id: GENERAL, name: 'General', emoji: '🗒️', notes: sortPinned(byCat.get(GENERAL) ?? []), catIndex: -1 },
    ...cats.map((c, i) => ({
      id: c.id,
      name: c.name,
      emoji: c.emoji,
      notes: sortPinned(byCat.get(c.id) ?? []),
      catIndex: i,
    })),
  ];

  return (
    <div className="page">
      <div className="notes__actions">
        <button className="btn notes__new" onClick={() => startNew()}>
          <AppIcon name="plus" size={17} /> New Note
        </button>
        <button className="btn btn--ghost" onClick={() => setEditCat('new')} title="Add category">
          <AppIcon name="folder" size={16} /> Category
        </button>
      </div>

      {docs.length === 0 && cats.length === 0 && (
        <div className="empty">No notes yet. Create one to jot things down.</div>
      )}

      {groups.map((g) => {
        const open = !collapsed.has(g.id);
        const real = g.catIndex >= 0;
        return (
          <div className="notegroup" key={g.id}>
            <div className="notegroup__head">
              <button className="notegroup__toggle" onClick={() => toggle(g.id)}>
                <span className={`notegroup__chev${open ? ' notegroup__chev--open' : ''}`}>
                  <AppIcon name="chevronRight" size={16} />
                </span>
                <span className="notegroup__emoji">{g.emoji}</span>
                <span className="notegroup__name">{g.name}</span>
                <span className="notegroup__count">{g.notes.length}</span>
              </button>
              <div className="notegroup__ctrls">
                <button
                  className="notegroup__ic"
                  onClick={() => startNew(real ? g.id : undefined)}
                  title={`New note in ${g.name}`}
                >
                  <AppIcon name="plus" size={16} />
                </button>
                {real && (
                  <>
                    <button className="notegroup__ic" disabled={g.catIndex === 0} onClick={() => moveCat(g.id, -1)} title="Move up">
                      <AppIcon name="chevronUp" size={16} />
                    </button>
                    <button className="notegroup__ic" disabled={g.catIndex >= cats.length - 1} onClick={() => moveCat(g.id, 1)} title="Move down">
                      <AppIcon name="chevronDown" size={16} />
                    </button>
                    <button className="notegroup__ic" onClick={() => setEditCat(cats.find((c) => c.id === g.id)!)} title="Edit">
                      <AppIcon name="edit" size={15} />
                    </button>
                    <button className="notegroup__ic notegroup__ic--danger" onClick={() => deleteCat(cats.find((c) => c.id === g.id)!)} title="Delete">
                      <AppIcon name="trash" size={15} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {open && (
              <div className="notegroup__body">
                {g.notes.length === 0 && <div className="notegroup__empty">No notes here yet.</div>}
                {g.notes.map((doc) => (
                  <NoteRow
                    key={doc.id}
                    doc={doc}
                    categories={cats}
                    onOpen={() => setOpenId(doc.id)}
                    onDelete={() => deleteNote(doc.id)}
                    onMove={(cid) => moveNote(doc.id, cid)}
                    onTogglePin={() => togglePin(doc)}
                  />
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
