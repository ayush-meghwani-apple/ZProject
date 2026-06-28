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

  // Card elements + the id to keep in view after a reorder, so the moved
  // category follows the screen instead of scrolling out of sight.
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const scrollToId = useRef<string | null>(null);

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

  // After a reorder re-renders the list, bring the moved category into view.
  useEffect(() => {
    const id = scrollToId.current;
    if (!id) return;
    scrollToId.current = null;
    cardRefs.current.get(id)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [categories]);

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

  // Reorder by swapping a category with its neighbour — reliable on touch where
  // drag-and-drop tends to be fiddly. The new order is saved immediately.
  async function move(id: string, dir: -1 | 1) {
    const ids = categories.map((c) => c.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    scrollToId.current = id;
    await CategoryRepository.setCategoryOrder(ids);
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

  return (
    <div className="page">
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

      {categories.map((cat, idx) => {
        const subs = subcategories.filter((s) => s.categoryId === cat.id);
        const isEditing = editCat?.id === cat.id;
        return (
          <div
            className="card"
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
                    <div className="reorder">
                      <button
                        className="iconbtn"
                        onClick={() => move(cat.id, -1)}
                        disabled={idx === 0}
                        title="Move up"
                        aria-label="Move up"
                      >
                        ⬆️
                      </button>
                      <button
                        className="iconbtn"
                        onClick={() => move(cat.id, 1)}
                        disabled={idx === categories.length - 1}
                        title="Move down"
                        aria-label="Move down"
                      >
                        ⬇️
                      </button>
                    </div>
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
