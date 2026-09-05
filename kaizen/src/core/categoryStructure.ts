import type { Alias, Category, Subcategory } from '../types/models';

/** Text-only category export: no ids, expenses, amounts, notes, or payment data. */
export function formatCategoryStructure(
  categories: Category[],
  subcategories: Subcategory[],
  aliases: Alias[],
): string {
  const lines = [`Categories (${categories.length})`];
  const hasSubcategories = subcategories.length > 0;

  categories.forEach((category, index) => {
    lines.push('', `${index + 1}. ${category.name}`);
    const categoryAliases = aliases
      .filter((alias) => alias.categoryId === category.id && !alias.subcategoryId)
      .map((alias) => alias.text)
      .sort();
    if (categoryAliases.length) lines.push(`   Aliases: ${categoryAliases.join(', ')}`);

    const subs = subcategories.filter((subcategory) => subcategory.categoryId === category.id);
    if (!subs.length) {
      if (hasSubcategories) lines.push('   - No subcategories');
      return;
    }

    subs.forEach((subcategory) => {
      lines.push(`   - ${subcategory.name}`);
      const subAliases = aliases
        .filter((alias) => alias.subcategoryId === subcategory.id)
        .map((alias) => alias.text)
        .sort();
      if (subAliases.length) lines.push(`     Aliases: ${subAliases.join(', ')}`);
    });
  });

  return lines.join('\n');
}