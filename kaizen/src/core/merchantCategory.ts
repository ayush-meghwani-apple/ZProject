// Smart merchant → category guessing. Pure and testable. Given a merchant name
// pulled from a bank email (e.g. "ZEPTO", "SWIGGY", "AMAZON"), it maps it to one
// of the user's categories + subcategories. Falls back to the chat parser's
// alias matching so anything already recognised there keeps working.

import { parseInput } from './parser';
import type { Alias, Category, Subcategory } from '../types/models';

export interface CategoryGuess {
  categoryId?: string;
  subcategoryId?: string;
}

/** merchant keyword → target category/subcategory NAMES (resolved to the user's
 *  own categories at runtime, so it works even if ids differ). Keep names in
 *  sync with src/config/categories.json. Longer keywords win over shorter ones. */
const MERCHANT_MAP: { kw: string; category: string; sub: string }[] = [
  // Food · Groceries (quick-commerce + grocery)
  { kw: 'zepto', category: 'Food', sub: 'Groceries' },
  { kw: 'blinkit', category: 'Food', sub: 'Groceries' },
  { kw: 'instamart', category: 'Food', sub: 'Groceries' },
  { kw: 'bigbasket', category: 'Food', sub: 'Groceries' },
  { kw: 'bbnow', category: 'Food', sub: 'Groceries' },
  { kw: 'dmart', category: 'Food', sub: 'Groceries' },
  { kw: 'jiomart', category: 'Food', sub: 'Groceries' },
  { kw: 'grofers', category: 'Food', sub: 'Groceries' },
  { kw: 'licious', category: 'Food', sub: 'Groceries' },
  { kw: 'country delight', category: 'Food', sub: 'Groceries' },
  { kw: 'milkbasket', category: 'Food', sub: 'Groceries' },
  { kw: 'reliance fresh', category: 'Food', sub: 'Groceries' },
  // Food · Restaurant (food delivery + eateries)
  { kw: 'swiggy instamart', category: 'Food', sub: 'Groceries' },
  { kw: 'swiggy', category: 'Food', sub: 'Restaurant' },
  { kw: 'zomato', category: 'Food', sub: 'Restaurant' },
  { kw: 'dominos', category: 'Food', sub: 'Restaurant' },
  { kw: 'mcdonald', category: 'Food', sub: 'Restaurant' },
  { kw: 'kfc', category: 'Food', sub: 'Restaurant' },
  { kw: 'pizza', category: 'Food', sub: 'Restaurant' },
  { kw: 'starbucks', category: 'Food', sub: 'Tea/Coffee' },
  { kw: 'chaayos', category: 'Food', sub: 'Tea/Coffee' },
  { kw: 'cafe', category: 'Food', sub: 'Restaurant' },
  { kw: 'restaurant', category: 'Food', sub: 'Restaurant' },
  { kw: 'faasos', category: 'Food', sub: 'Restaurant' },
  { kw: 'behrouz', category: 'Food', sub: 'Restaurant' },
  { kw: 'box8', category: 'Food', sub: 'Restaurant' },
  // Transport
  { kw: 'uber', category: 'Transport', sub: 'Auto/Cab' },
  { kw: 'ola', category: 'Transport', sub: 'Auto/Cab' },
  { kw: 'rapido', category: 'Transport', sub: 'Auto/Cab' },
  { kw: 'blusmart', category: 'Transport', sub: 'Auto/Cab' },
  { kw: 'irctc', category: 'Transport', sub: 'Public Transit' },
  { kw: 'redbus', category: 'Transport', sub: 'Public Transit' },
  { kw: 'abhibus', category: 'Transport', sub: 'Public Transit' },
  { kw: 'metro', category: 'Transport', sub: 'Public Transit' },
  { kw: 'indianoil', category: 'Transport', sub: 'Fuel' },
  { kw: 'iocl', category: 'Transport', sub: 'Fuel' },
  { kw: 'bharat petroleum', category: 'Transport', sub: 'Fuel' },
  { kw: 'hpcl', category: 'Transport', sub: 'Fuel' },
  { kw: 'petrol', category: 'Transport', sub: 'Fuel' },
  // Health
  { kw: 'pharmeasy', category: 'Health', sub: 'Medicine' },
  { kw: '1mg', category: 'Health', sub: 'Medicine' },
  { kw: 'netmeds', category: 'Health', sub: 'Medicine' },
  { kw: 'apollo pharmacy', category: 'Health', sub: 'Medicine' },
  { kw: 'medplus', category: 'Health', sub: 'Medicine' },
  { kw: 'pharmacy', category: 'Health', sub: 'Medicine' },
  { kw: 'practo', category: 'Health', sub: 'Doctor' },
  { kw: 'cultfit', category: 'Health', sub: 'Gym/Fitness' },
  { kw: 'cult.fit', category: 'Health', sub: 'Gym/Fitness' },
  // Bills · Subscription (streaming + SaaS)
  { kw: 'netflix', category: 'Bills', sub: 'Subscription' },
  { kw: 'spotify', category: 'Bills', sub: 'Subscription' },
  { kw: 'hotstar', category: 'Bills', sub: 'Subscription' },
  { kw: 'disney', category: 'Bills', sub: 'Subscription' },
  { kw: 'prime video', category: 'Bills', sub: 'Subscription' },
  { kw: 'youtube', category: 'Bills', sub: 'Subscription' },
  { kw: 'jiocinema', category: 'Bills', sub: 'Subscription' },
  { kw: 'sony liv', category: 'Bills', sub: 'Subscription' },
  { kw: 'zee5', category: 'Bills', sub: 'Subscription' },
  { kw: 'google one', category: 'Bills', sub: 'Subscription' },
  { kw: 'icloud', category: 'Bills', sub: 'Subscription' },
  { kw: 'openai', category: 'Bills', sub: 'Subscription' },
  { kw: 'chatgpt', category: 'Bills', sub: 'Subscription' },
  { kw: 'adobe', category: 'Bills', sub: 'Subscription' },
  // Bills · Mobile/Internet
  { kw: 'airtel', category: 'Bills', sub: 'Mobile/Internet' },
  { kw: 'jio', category: 'Bills', sub: 'Mobile/Internet' },
  { kw: 'vodafone', category: 'Bills', sub: 'Mobile/Internet' },
  { kw: 'act fibernet', category: 'Bills', sub: 'Mobile/Internet' },
  { kw: 'hathway', category: 'Bills', sub: 'Mobile/Internet' },
  // Bills · Electricity
  { kw: 'bescom', category: 'Bills', sub: 'Electricity' },
  { kw: 'electricity', category: 'Bills', sub: 'Electricity' },
  { kw: 'tata power', category: 'Bills', sub: 'Electricity' },
  { kw: 'adani electricity', category: 'Bills', sub: 'Electricity' },
  // Shopping
  { kw: 'myntra', category: 'Shopping', sub: 'Clothing' },
  { kw: 'ajio', category: 'Shopping', sub: 'Clothing' },
  { kw: 'tata cliq', category: 'Shopping', sub: 'Clothing' },
  { kw: 'nykaa', category: 'Shopping', sub: 'Clothing' },
  { kw: 'amazon', category: 'Shopping', sub: 'Electronics' },
  { kw: 'flipkart', category: 'Shopping', sub: 'Electronics' },
  { kw: 'croma', category: 'Shopping', sub: 'Electronics' },
  { kw: 'reliance digital', category: 'Shopping', sub: 'Electronics' },
  { kw: 'ikea', category: 'Shopping', sub: 'Household' },
  { kw: 'urban company', category: 'Shopping', sub: 'Household' },
  { kw: 'pepperfry', category: 'Shopping', sub: 'Household' },
  // Entertainment
  { kw: 'bookmyshow', category: 'Entertainment', sub: 'Movies' },
  { kw: 'pvr', category: 'Entertainment', sub: 'Movies' },
  { kw: 'inox', category: 'Entertainment', sub: 'Movies' },
  { kw: 'cinepolis', category: 'Entertainment', sub: 'Movies' },
];

function findCategoryByName(categories: Category[], name: string): Category | undefined {
  const n = name.toLowerCase();
  return categories.find((c) => c.name.toLowerCase() === n);
}

function findSubByName(
  subcategories: Subcategory[],
  categoryId: string,
  name: string,
): Subcategory | undefined {
  const n = name.toLowerCase();
  return subcategories.find((s) => s.categoryId === categoryId && s.name.toLowerCase() === n);
}

/**
 * Guess a category + subcategory for a merchant. Tries the curated merchant map
 * first (longest keyword wins), then falls back to the chat parser's aliases.
 * Returns an empty object when nothing matches (caller leaves it uncategorized).
 */
export function guessCategory(
  merchant: string | null | undefined,
  categories: Category[],
  subcategories: Subcategory[],
  aliases: Alias[],
): CategoryGuess {
  const text = (merchant ?? '').toLowerCase();
  if (text) {
    const hit = MERCHANT_MAP
      .filter((m) => text.includes(m.kw))
      .sort((a, b) => b.kw.length - a.kw.length)[0];
    if (hit) {
      const cat = findCategoryByName(categories, hit.category);
      if (cat) {
        const sub = findSubByName(subcategories, cat.id, hit.sub);
        return { categoryId: cat.id, subcategoryId: sub?.id };
      }
    }
  }

  // Fall back to the existing alias parser (covers swiggy/amazon/uber/etc.).
  const cmd = parseInput(`${merchant ?? ''} 1`, aliases, categories, subcategories);
  if (cmd.kind === 'expense' && cmd.categoryId) {
    return { categoryId: cmd.categoryId, subcategoryId: cmd.subcategoryId };
  }
  return {};
}
