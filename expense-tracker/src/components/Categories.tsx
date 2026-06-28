import { useEffect, useRef, useState } from 'react';
import { CategoryRepository } from '../repository/categoryRepository';
import type { Alias, Category, Subcategory } from '../types/models';

interface Props {
  version: number;
  onChange: () => void;
}

export default function Categories({ version, onChange }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [newCat, setNewCat] = useState('');
  const [newIcon, setNewIcon] = useState('📦');
  const [subDraft, setSubDraft] = useState<Record<string, string>>({});
  const [subIconDraft, setSubIconDraft] = useState<Record<string, string>>({});
  const [editCat, setEditCat] = useState<{ id: string; name: string; icon: string } | null>(null);
  const [editSub, setEditSub] = useState<{ id: string; name: string; icon: string } | null>(null);

  // Drag-to-reorder state. dragId is the category being dragged; dragOrder is
  // the live ordering shown while dragging. We mirror both into refs so the
  // requestAnimationFrame auto-scroll loop always sees current values. A ghost
  // element follows the finger, and the list auto-scrolls near the edges so you
  // can drop a category beyond the ones currently on screen.
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOrder, setDragOrder] = useState<string[]>([]);
  const [ghostY, setGhostY] = useState(0);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragIdRef = useRef<string | null>(null);
  const dragOrderRef = useRef<string[]>([]);
  const pointerY = useRef(0);
  const scroller = useRef<HTMLElement | null>(null);
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    };
  }, []);

  async function load() {
    const [c, s, a] = await Promise.all([
      CategoryRepository.getCategories(),
      CategoryRepository.getSubcategories(),
      CategoryRepository.getAliases(),
    ]);
    setCategories(c);
    setSubcategories(s);
    setAliases(a);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  async function addCategory() {
    const name = newCat.trim();
    if (!name) return;
    await CategoryRepository.addCategory(name, newIcon.trim() || '📦');
    setNewCat('');
    setNewIcon('📦');
    await load();
    onChange();
  }

  async function addSub(categoryId: string) {
    const name = (subDraft[categoryId] ?? '').trim();
    if (!name) return;
    await CategoryRepository.addSubcategory(categoryId, name, subIconDraft[categoryId]);
    setSubDraft((d) => ({ ...d, [categoryId]: '' }));
    setSubIconDraft((d) => ({ ...d, [categoryId]: '' }));
    await load();
    onChange();
  }

  async function removeCategory(id: string) {
    if (!confirm('Delete this category and its subcategories?')) return;
    await CategoryRepository.deleteCategory(id);
    await load();
    onChange();
  }

  function startDrag(e: React.PointerEvent, id: string) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const order = categories.map((c) => c.id);
    dragIdRef.current = id;
    dragOrderRef.current = order;
    pointerY.current = e.clientY;
    scroller.current = (e.currentTarget as HTMLElement).closest('.app__body');
    setDragId(id);
    setDragOrder(order);
    setGhostY(e.clientY);
    if (rafId.current === null) rafId.current = requestAnimationFrame(autoScroll);
  }

  // Recompute the drop slot from the finger's current Y and update the order.
  function reorderTo(y: number) {
    const id = dragIdRef.current;
    if (!id) return;
    let target = 0;
    for (const cid of dragOrderRef.current) {
      if (cid === id) continue;
      const el = cardRefs.current.get(cid);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (y > r.top + r.height / 2) target++;
    }
    const order = dragOrderRef.current.filter((cid) => cid !== id);
    order.splice(target, 0, id);
    if (order.some((cid, i) => cid !== dragOrderRef.current[i])) {
      dragOrderRef.current = order;
      setDragOrder(order);
    }
  }

  // Runs every frame while dragging: scrolls the page when the finger is near
  // the top/bottom edge, then re-evaluates the drop position.
  function autoScroll() {
    const sc = scroller.current;
    if (dragIdRef.current && sc) {
      const r = sc.getBoundingClientRect();
      const EDGE = 80;
      const y = pointerY.current;
      let moved = false;
      if (y < r.top + EDGE && sc.scrollTop > 0) {
        sc.scrollTop -= Math.ceil((r.top + EDGE - y) / 6);
        moved = true;
      } else if (y > r.bottom - EDGE) {
        sc.scrollTop += Math.ceil((y - (r.bottom - EDGE)) / 6);
        moved = true;
      }
      if (moved) reorderTo(y);
      rafId.current = requestAnimationFrame(autoScroll);
    } else {
      rafId.current = null;
    }
  }

  function onDragMove(e: React.PointerEvent) {
    if (!dragIdRef.current) return;
    pointerY.current = e.clientY;
    setGhostY(e.clientY);
    reorderTo(e.clientY);
  }

  async function endDrag() {
    if (!dragIdRef.current) return;
    const finalOrder = dragOrderRef.current;
    dragIdRef.current = null;
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    setDragId(null);
    await CategoryRepository.setCategoryOrder(finalOrder);
    await load();
    onChange();
  }

  async function saveCategory() {
    if (!editCat) return;
    const original = categories.find((c) => c.id === editCat.id);
    if (!original) return;
    await CategoryRepository.updateCategory({
      ...original,
      name: editCat.name.trim() || original.name,
      icon: editCat.icon.trim() || original.icon,
    });
    setEditCat(null);
    await load();
    onChange();
  }

  async function removeSub(id: string) {
    if (!confirm('Delete this subcategory?')) return;
    await CategoryRepository.deleteSubcategory(id);
    await load();
    onChange();
  }

  async function saveSub() {
    if (!editSub) return;
    const original = subcategories.find((s) => s.id === editSub.id);
    if (!original) return;
    await CategoryRepository.updateSubcategory({
      ...original,
      name: editSub.name.trim() || original.name,
      icon: editSub.icon.trim() || undefined,
    });
    setEditSub(null);
    await load();
    onChange();
  }

  function aliasCountFor(subId: string): number {
    return aliases.filter((a) => a.subcategoryId === subId).length;
  }

  const draggingCat = dragId ? categories.find((c) => c.id === dragId) : null;

  return (
    <div className="page">
      {draggingCat && (
        <div className="drag-ghost" style={{ top: ghostY }}>
          <span className="dot" style={{ background: draggingCat.color }} />
          <strong>
            {draggingCat.icon} {draggingCat.name}
          </strong>
        </div>
      )}
      <div className="card">
        <h3>New Category</h3>
        <div className="inline" style={{ marginBottom: 10 }}>
          <input
            className="input"
            style={{ width: 64, textAlign: 'center' }}
            value={newIcon}
            onChange={(e) => setNewIcon(e.target.value)}
            aria-label="icon"
          />
          <input
            className="input"
            placeholder="Category name"
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
          />
          <button className="btn" onClick={addCategory}>
            Add
          </button>
        </div>
      </div>

      {(dragId
        ? dragOrder.map((id) => categories.find((c) => c.id === id)!).filter(Boolean)
        : categories
      ).map((cat) => {
        const subs = subcategories.filter((s) => s.categoryId === cat.id);
        const isEditing = editCat?.id === cat.id;
        return (
          <div
            className={`card${dragId === cat.id ? ' card--dragging' : ''}`}
            key={cat.id}
            ref={(el) => {
              if (el) cardRefs.current.set(cat.id, el);
              else cardRefs.current.delete(cat.id);
            }}
          >
            <div className="row" style={{ paddingTop: 0 }}>
              {isEditing ? (
                <div className="inline" style={{ flex: 1 }}>
                  <input
                    className="input"
                    style={{ width: 56, textAlign: 'center' }}
                    value={editCat!.icon}
                    onChange={(e) => setEditCat({ ...editCat!, icon: e.target.value })}
                    aria-label="icon"
                  />
                  <input
                    className="input"
                    value={editCat!.name}
                    onChange={(e) => setEditCat({ ...editCat!, name: e.target.value })}
                  />
                  <button className="btn" onClick={saveCategory}>
                    Save
                  </button>
                  <button className="iconbtn" onClick={() => setEditCat(null)} title="Cancel">
                    ✕
                  </button>
                </div>
              ) : (
                <>
                  <div className="row__left">
                    <span
                      className="drag-handle"
                      data-noswipe
                      onPointerDown={(e) => startDrag(e, cat.id)}
                      onPointerMove={onDragMove}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      title="Drag to reorder"
                      aria-label="Drag to reorder"
                    >
                      ⠿
                    </span>
                    <span className="dot" style={{ background: cat.color }} />
                    <strong>
                      {cat.icon} {cat.name}
                    </strong>
                  </div>
                  <div className="inline">
                    <button
                      className="iconbtn"
                      onClick={() => setEditCat({ id: cat.id, name: cat.name, icon: cat.icon })}
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      className="iconbtn"
                      onClick={() => removeCategory(cat.id)}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </>
              )}
            </div>

            {subs.map((s) =>
              editSub?.id === s.id ? (
                <div className="row" key={s.id}>
                  <div className="inline" style={{ flex: 1 }}>
                    <input
                      className="input"
                      style={{ width: 56, textAlign: 'center' }}
                      value={editSub!.icon}
                      onChange={(e) => setEditSub({ ...editSub!, icon: e.target.value })}
                      aria-label="icon"
                    />
                    <input
                      className="input"
                      value={editSub!.name}
                      onChange={(e) => setEditSub({ ...editSub!, name: e.target.value })}
                    />
                  </div>
                  <div className="inline">
                    <button className="btn btn--ghost" onClick={saveSub}>
                      Save
                    </button>
                    <button className="iconbtn" onClick={() => setEditSub(null)} title="Cancel">
                      ✕
                    </button>
                  </div>
                </div>
              ) : (
                <div className="row" key={s.id}>
                  <span>› {s.icon ? `${s.icon} ` : ''}{s.name}</span>
                  <div className="inline">
                    <span className="pill">{aliasCountFor(s.id)} aliases</span>
                    <button
                      className="iconbtn"
                      onClick={() => setEditSub({ id: s.id, name: s.name, icon: s.icon ?? '' })}
                      title="Rename"
                    >
                      ✏️
                    </button>
                    <button className="iconbtn" onClick={() => removeSub(s.id)} title="Delete">
                      🗑️
                    </button>
                  </div>
                </div>
              ),
            )}

            <div className="inline" style={{ marginTop: 10 }}>
              <input
                className="input"
                style={{ width: 56, textAlign: 'center' }}
                placeholder="🔖"
                value={subIconDraft[cat.id] ?? ''}
                onChange={(e) => setSubIconDraft((d) => ({ ...d, [cat.id]: e.target.value }))}
                aria-label="subcategory icon"
              />
              <input
                className="input"
                placeholder="Add subcategory"
                value={subDraft[cat.id] ?? ''}
                onChange={(e) => setSubDraft((d) => ({ ...d, [cat.id]: e.target.value }))}
              />
              <button className="btn btn--ghost" onClick={() => addSub(cat.id)}>
                +
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
