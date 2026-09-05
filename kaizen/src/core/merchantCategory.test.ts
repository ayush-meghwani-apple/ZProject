import { describe, expect, it } from 'vitest';
import { guessCategory } from './merchantCategory';
import type { Alias, Category, Subcategory } from '../types/models';

const categories: Category[] = [
  { id: 'home', name: 'Home', icon: '🏠', color: '#ef4444' },
  { id: 'food', name: 'Food', icon: '🍽️', color: '#f97316' },
  { id: 'transport', name: 'Transport', icon: '🛵', color: '#0ea5e9' },
  { id: 'bills', name: 'Bills & Insurance', icon: '🧾', color: '#8b5cf6' },
  { id: 'shopping', name: 'Shopping & Self-care', icon: '🛍️', color: '#ec4899' },
];
const subcategories: Subcategory[] = [];
const aliases: Alias[] = [];

describe('guessCategory', () => {
  it('maps groceries and Instamart directly to Home', () => {
    expect(guessCategory('ZEPTO', categories, subcategories, aliases)).toEqual({
      categoryId: 'home',
    });
    expect(guessCategory('SWIGGY INSTAMART', categories, subcategories, aliases)).toEqual({
      categoryId: 'home',
    });
  });

  it('maps food delivery directly to Food', () => {
    expect(guessCategory('SWIGGY', categories, subcategories, aliases)).toEqual({
      categoryId: 'food',
    });
  });

  it('maps transport, subscriptions, and shopping to flat categories', () => {
    expect(guessCategory('UBER TRIP', categories, subcategories, aliases).categoryId).toBe(
      'transport',
    );
    expect(guessCategory('NETFLIX.COM', categories, subcategories, aliases).categoryId).toBe(
      'bills',
    );
    expect(guessCategory('AMAZON', categories, subcategories, aliases).categoryId).toBe(
      'shopping',
    );
  });

  it('returns empty for an unknown payee', () => {
    expect(guessCategory('RAMESH', categories, subcategories, aliases)).toEqual({});
  });
});
