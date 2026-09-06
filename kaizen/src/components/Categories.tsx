import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CategoryRepository } from '../repository/categoryRepository';
import AppIcon from './AppIcon';
import type { Alias, Category } from '../types/models';

interface Props {
  version: number;
  onChange: () => void;
}

export default function Categories({ version, onChange }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editorCategory, setEditorCategory] = useState<Category | null | 'new'>(null);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('📦');

  async function load() {
    const [nextCategories, nextAliases] = await Promise.all([
      CategoryRepository.getCategories(),
      CategoryRepository.getAliases(),
    ]);
    setCategories(nextCategories);
    setAliases(nextAliases.filter((alias) => !alias.subcategoryId));
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  function aliasesFor(categoryId: string) {
    return aliases.filter((alias) => alias.categoryId === categoryId);
  }

  async function addAlias(categoryId: string) {
    const text = (drafts[categoryId] ?? '').trim().toLowerCase();
    if (!text || aliases.some((alias) => alias.categoryId === categoryId && alias.text === text)) {
      return;
    }
    await CategoryRepository.addAlias(text, categoryId);
    setDrafts((current) => ({ ...current, [categoryId]: '' }));
    await load();
    onChange();
  }

  async function removeAlias(id: string) {
    await CategoryRepository.deleteAlias(id);
    await load();
    onChange();
  }

  async function addCategory() {
    const name = newName.trim();
    if (!name || categories.some((category) => category.name.toLowerCase() === name.toLowerCase())) {
      return;
    }
    const category = await CategoryRepository.addCategory(name, newIcon.trim() || '📦');
    setNewName('');
    setNewIcon('📦');
    setEditorCategory(null);
    setOpenId(category.id);
    await load();
    onChange();
  }

  async function updateCategoryDetails(category: Category) {
    const name = newName.trim();
    const icon = newIcon.trim() || '📦';
    if (!name || (name === category.name && icon === category.icon)) return;
    if (categories.some((item) => item.id !== category.id && item.name.toLowerCase() === name.toLowerCase())) {
      return;
    }
    await CategoryRepository.updateCategory({ ...category, name, icon });
    if (name !== category.name && !aliases.some((alias) => alias.categoryId === category.id && alias.text === name.toLowerCase())) {
      await CategoryRepository.addAlias(name, category.id);
    }
    setEditorCategory(null);
    await load();
    onChange();
  }

  function openNewCategory() {
    setNewName('');
    setNewIcon('📦');
    setEditorCategory('new');
  }

  function openCategoryEditor(category: Category) {
    setNewName(category.name);
    setNewIcon(category.icon);
    setEditorCategory(category);
  }

  return (
    <div className="page page--cats">
      <div className="cats__sticky">
        <span className="cats__glance" aria-hidden="true">
          {categories.slice(0, 4).map((category) => (
            <span key={category.id} style={{ background: category.color }}>{category.icon}</span>
          ))}
        </span>
        <button className="btn btn--sm" onClick={openNewCategory}>
          <AppIcon name="plus" size={16} /> Add category
        </button>
      </div>

      {categories.map((category) => {
        const categoryAliases = aliasesFor(category.id);
        const open = openId === category.id;
        return (
          <div className="card" key={category.id}>
            <button className="scard__head" onClick={() => setOpenId(open ? null : category.id)}>
              <span className="scard__icon" style={{ background: category.color }}>
                {category.icon}
              </span>
              <span className="scard__headtext">
                <span className="scard__title">{category.name}</span>
                <span className="scard__sub">
                  {categoryAliases.length} alias{categoryAliases.length === 1 ? '' : 'es'}
                </span>
              </span>
              <AppIcon name={open ? 'chevronUp' : 'chevronDown'} size={18} />
            </button>

            {open && (
              <div className="alias-editor">
                <div className="cats__aliashead">
                  <strong>Matching words</strong>
                  <button className="btn btn--ghost btn--sm" onClick={() => openCategoryEditor(category)}>
                    <AppIcon name="edit" size={14} /> Edit category
                  </button>
                </div>
                <div className="alias-chips">
                  {categoryAliases.map((alias) => (
                    <span className="alias-chip" key={alias.id}>
                      {alias.text}
                      <button
                        className="alias-chip__x"
                        onClick={() => removeAlias(alias.id)}
                        aria-label={`Remove alias ${alias.text}`}
                      >
                        <AppIcon name="close" size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="inline" style={{ marginTop: 8 }}>
                  <input
                    className="input"
                    placeholder="Add matching word"
                    value={drafts[category.id] ?? ''}
                    onChange={(event) =>
                      setDrafts((current) => ({ ...current, [category.id]: event.target.value }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void addAlias(category.id);
                    }}
                  />
                  <button className="btn btn--ghost" onClick={() => addAlias(category.id)}>
                    <AppIcon name="plus" size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {editorCategory && createPortal(
        <div className="modal__backdrop modal__backdrop--form" onClick={() => setEditorCategory(null)}>
          <div className="modal__card formdrawer" onClick={(event) => event.stopPropagation()}>
            <div className="formdrawer__head">
              <div>
                <h3>{editorCategory === 'new' ? 'New category' : 'Edit category'}</h3>
              </div>
              <button className="iconbtn" onClick={() => setEditorCategory(null)} aria-label="Close category editor">
                <AppIcon name="close" size={18} />
              </button>
            </div>
            <div className="cats__drawerfields">
              <label className="field cats__drawericon">
                <span>Emoji</span>
                <input className="input cats__iconinput" aria-label="Category icon" value={newIcon} onChange={(event) => setNewIcon(event.target.value)} maxLength={8} />
              </label>
              <label className="field">
                <span>Name</span>
                <input
                  className="input"
                  placeholder="e.g. Home"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    if (editorCategory === 'new') void addCategory();
                    else void updateCategoryDetails(editorCategory);
                  }}
                  autoFocus
                />
              </label>
            </div>
            <div className="modal__footer">
              <button className="btn btn--ghost" onClick={() => setEditorCategory(null)}>Cancel</button>
              <button
                className="btn"
                disabled={!newName.trim()}
                onClick={() => editorCategory === 'new' ? addCategory() : updateCategoryDetails(editorCategory)}
              >
                {editorCategory === 'new' ? 'Add category' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
