import { describe, it, expect } from 'vitest';
import { guessCategory } from './merchantCategory';
import type { Alias, Category, Subcategory } from '../types/models';

// Minimal fixtures mirroring src/config/categories.json.
const categories: Category[] = [
  { id: 'food', name: 'Food', icon: '🍔', color: '#f97316' },
  { id: 'transport', name: 'Transport', icon: '🚌', color: '#0ea5e9' },
  { id: 'bills', name: 'Bills', icon: '🧾', color: '#8b5cf6' },
  { id: 'shopping', name: 'Shopping', icon: '🛍️', color: '#ec4899' },
];

const subcategories: Subcategory[] = [
  { id: 'f-rest', categoryId: 'food', name: 'Restaurant' },
  { id: 'f-groc', categoryId: 'food', name: 'Groceries' },
  { id: 't-cab', categoryId: 'transport', name: 'Auto/Cab' },
  { id: 'b-sub', categoryId: 'bills', name: 'Subscription' },
  { id: 's-elec', categoryId: 'shopping', name: 'Electronics' },
];

const aliases: Alias[] = [];

describe('guessCategory', () => {
  it('maps Zepto to Food › Groceries', () => {
    expect(guessCategory('ZEPTO', categories, subcategories, aliases)).toEqual({
      categoryId: 'food',
      subcategoryId: 'f-groc',
    });
  });

  it('maps Swiggy to Food › Restaurant but Swiggy Instamart to Groceries', () => {
    expect(guessCategory('SWIGGY', categories, subcategories, aliases).subcategoryId).toBe('f-rest');
    expect(
      guessCategory('SWIGGY INSTAMART', categories, subcategories, aliases).subcategoryId,
    ).toBe('f-groc');
  });

  it('maps Uber to Transport › Auto/Cab', () => {
    expect(guessCategory('UBER TRIP', categories, subcategories, aliases)).toEqual({
      categoryId: 'transport',
      subcategoryId: 't-cab',
    });
  });

  it('maps Netflix to Bills › Subscription', () => {
    expect(guessCategory('NETFLIX.COM', categories, subcategories, aliases)).toEqual({
      categoryId: 'bills',
      subcategoryId: 'b-sub',
    });
  });

  it('maps Amazon to Shopping › Electronics', () => {
    expect(guessCategory('AMAZON', categories, subcategories, aliases).categoryId).toBe('shopping');
  });

  it('returns empty for an unknown payee', () => {
    expect(guessCategory('RAMESH', categories, subcategories, aliases)).toEqual({});
  });

  it('still resolves the category when the subcategory is absent', () => {
    const noSub: Subcategory[] = [];
    expect(guessCategory('ZEPTO', categories, noSub, aliases)).toEqual({
      categoryId: 'food',
      subcategoryId: undefined,
    });
  });
});
