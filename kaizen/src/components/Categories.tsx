import { useEffect, useState } from 'react';
import { CategoryRepository } from '../repository/categoryRepository';
import { formatCategoryStructure } from '../core/categoryStructure';
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
  const [copied, setCopied] = useState(false);

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

  async function copyStructure() {
    const text = formatCategoryStructure(categories, [], aliases);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
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
          <button className="btn btn--sm btn--ghost" onClick={copyStructure}>
            <AppIcon name="copy" size={15} /> {copied ? 'Copied' : 'Copy structure'}
          </button>
        </div>
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
