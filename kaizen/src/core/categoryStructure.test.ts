import { describe, expect, it } from 'vitest';
import { formatCategoryStructure } from './categoryStructure';

describe('formatCategoryStructure', () => {
  it('exports only category names, subcategory names, and aliases', () => {
    const text = formatCategoryStructure(
      [{ id: 'food-id', name: 'Food', icon: 'F', color: '#fff' }],
      [{ id: 'grocery-id', categoryId: 'food-id', name: 'Groceries' }],
      [
        { id: 'a1', text: 'food', categoryId: 'food-id' },
        { id: 'a2', text: 'zepto', categoryId: 'food-id', subcategoryId: 'grocery-id' },
      ],
    );

    expect(text).toContain('1. Food');
    expect(text).toContain('- Groceries');
    expect(text).toContain('Aliases: zepto');
    expect(text).not.toContain('food-id');
    expect(text).not.toContain('grocery-id');
  });
});