import { useEffect, useState } from 'react';
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
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [iconDrafts, setIconDrafts] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
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
    setAdding(false);
    setOpenId(category.id);
    await load();
    onChange();
  }

  async function updateCategoryDetails(category: Category) {
    const name = (nameDrafts[category.id] ?? category.name).trim();
    const icon = (iconDrafts[category.id] ?? category.icon).trim() || '📦';
    if (!name || (name === category.name && icon === category.icon)) return;
    if (categories.some((item) => item.id !== category.id && item.name.toLowerCase() === name.toLowerCase())) {
      return;
    }
    await CategoryRepository.updateCategory({ ...category, name, icon });
    if (name !== category.name && !aliases.some((alias) => alias.categoryId === category.id && alias.text === name.toLowerCase())) {
      await CategoryRepository.addAlias(name, category.id);
    }
    setNameDrafts((current) => ({ ...current, [category.id]: name }));
    setIconDrafts((current) => ({ ...current, [category.id]: icon }));
    await load();
    onChange();
  }

  return (
    <div className="page page--cats">
      <div className="card">
        <div className="row" style={{ padding: 0, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 style={{ margin: 0 }}>Categories</h3>
            <p className="card__subtitle" style={{ marginBottom: 0 }}>
              One category per expense. Aliases power chat and auto-import matching.
            </p>
          </div>
          <button className="btn btn--sm" onClick={() => setAdding((current) => !current)}>
            <AppIcon name={adding ? 'close' : 'plus'} size={15} />
            {adding ? 'Cancel' : 'New category'}
          </button>
        </div>
        {adding && (
          <div className="cats__new">
            <input
              className="input cats__iconinput"
              aria-label="Category icon"
              value={newIcon}
              onChange={(event) => setNewIcon(event.target.value)}
              maxLength={8}
            />
            <input
              className="input"
              placeholder="Category name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void addCategory();
              }}
              autoFocus
            />
            <button className="btn" onClick={addCategory} disabled={!newName.trim()}>
              Add
            </button>
          </div>
        )}
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
                <label className="field cats__rename">
                  <span>Category details</span>
                  <span className="cats__details">
                    <input
                      className="input cats__iconinput"
                      aria-label="Category icon"
                      value={iconDrafts[category.id] ?? category.icon}
                      onChange={(event) =>
                        setIconDrafts((current) => ({
                          ...current,
                          [category.id]: event.target.value,
                        }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void updateCategoryDetails(category);
                      }}
                      maxLength={8}
                    />
                    <input
                      className="input"
                      value={nameDrafts[category.id] ?? category.name}
                      onChange={(event) =>
                        setNameDrafts((current) => ({
                          ...current,
                          [category.id]: event.target.value,
                        }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void updateCategoryDetails(category);
                      }}
                    />
                    <button className="btn btn--sm" onClick={() => updateCategoryDetails(category)}>
                      Save
                    </button>
                  </span>
                </label>
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
    </div>
  );
}
