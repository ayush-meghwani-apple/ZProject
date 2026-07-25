//
// General-ledger ↔ portfolio linking. A non-mutual-fund ledger entry (a gold-coin
// buy, a US stock, an FD…) maintains a single Portfolio holding row (1:1, linked
// by `holdingId`) inside its asset class, so adding/editing/deleting the entry
// keeps the portfolio in sync. Mutual funds are NOT handled here — they live in
// their own fund ledger and are valued from live NAV.

import type { AssetClassKey, FinancialPlan, HoldingRow, LedgerEntry } from '../types/models';
import { newId } from './util';

const BUILTIN_LABELS: Record<AssetClassKey, string> = {
  domestic_equity: 'Equity Stocks',
  equity_mf: 'Equity Mutual Funds',
  us_equity: 'US Equity',
  debt: 'Debt',
  gold: 'Gold',
  crypto: 'Crypto',
  real_estate: 'Real Estate / REITs',
};

export interface AssignableClass {
  key: string;
  label: string;
}

/** Asset classes a general ledger entry can be filed under: the six built-ins
 *  plus any custom classes the user has defined. */
export function assignableClasses(plan: FinancialPlan): AssignableClass[] {
  const out: AssignableClass[] = (Object.keys(BUILTIN_LABELS) as AssetClassKey[]).map((k) => ({
    key: k,
    label: BUILTIN_LABELS[k],
  }));
  for (const c of plan.customClasses ?? []) out.push({ key: c.id, label: c.label || 'Custom' });
  return out;
}

/** Human label for an asset class key (built-in or custom). */
export function classLabel(plan: FinancialPlan, key: string): string {
  if (key in BUILTIN_LABELS) return BUILTIN_LABELS[key as AssetClassKey];
  const c = (plan.customClasses ?? []).find((x) => x.id === key);
  return c?.label || key;
}

export interface SubCat {
  key: string;
  label: string;
}

// Sub-categories offered per built-in class when filing a general-ledger entry,
// so e.g. a Debt entry can be recorded as a Fixed deposit vs a Debt fund. The
// equity labels are the SAME strings the Portfolio's stock/fund category
// dropdown uses (EQUITY_CATS), so a ledgered stock/fund tags consistently.
const SUBCATEGORIES: Record<string, SubCat[]> = {
  domestic_equity: [
    { key: 'largecap', label: 'Largecap' },
    { key: 'midcap', label: 'Midcap' },
    { key: 'smallcap', label: 'Smallcap' },
    { key: 'flexicap', label: 'Flexi/Multi cap' },
  ],
  equity_mf: [
    { key: 'largecap', label: 'Largecap' },
    { key: 'midcap', label: 'Midcap' },
    { key: 'smallcap', label: 'Smallcap' },
    { key: 'flexicap', label: 'Flexi/Multi cap' },
  ],
  us_equity: [
    { key: 'etf', label: 'ETF' },
    { key: 'stock', label: 'Stock' },
    { key: 'mf', label: 'Mutual fund' },
    { key: 'other', label: 'Other' },
  ],
  debt: [
    { key: 'liquid', label: 'Liquid / cash' },
    { key: 'fd', label: 'Fixed deposit' },
    { key: 'debtfund', label: 'Debt fund' },
    { key: 'epf', label: 'EPF / PPF / VPF' },
  ],
  gold: [
    { key: 'jewellery', label: 'Jewellery' },
    { key: 'sgb', label: 'SGB' },
    { key: 'goldetf', label: 'Gold ETF' },
    { key: 'other', label: 'Other' },
  ],
  crypto: [
    { key: 'coin', label: 'Coin' },
    { key: 'token', label: 'Token' },
    { key: 'other', label: 'Other' },
  ],
  real_estate: [
    { key: 'home', label: 'Home' },
    { key: 'property', label: 'Other property' },
    { key: 'reits', label: 'REITs' },
    { key: 'other', label: 'Other' },
  ],
};

/** Sub-categories available for a class (empty for custom classes). */
export function assignableSubcats(key: string): SubCat[] {
  return SUBCATEGORIES[key] ?? [];
}

/** The display label for a class + sub-category, or undefined if none. */
export function subcatLabel(key: string, subKey?: string): string | undefined {
  if (!subKey) return undefined;
  return (SUBCATEGORIES[key] ?? []).find((s) => s.key === subKey)?.label;
}

/** Every holding array a class's linked entries could live in — used to LOCATE
 *  an existing linked holding regardless of which sub-bucket it's in. */
function classArrays(draft: FinancialPlan, key: string): HoldingRow[][] {
  const a = draft.assets;
  switch (key) {
    case 'domestic_equity':
      return [a.domesticEquity.stocks];
    case 'equity_mf':
      return [a.domesticEquity.mutualFunds];
    case 'us_equity':
      return [a.usEquity.others];
    case 'debt':
      return [a.debt.fds, a.debt.debtFunds, a.debt.epfPpfVpf];
    case 'gold':
      return [a.gold.others];
    case 'crypto':
      return [a.crypto.others];
    case 'real_estate':
      return [a.realEstate.others];
    default: {
      const c = (draft.customClasses ?? []).find((x) => x.id === key);
      return c ? [c.holdings] : [];
    }
  }
}

/** The array a new/edited entry with this sub-category should live in. For Debt,
 *  the sub-category picks the matching bucket (FD → fds, EPF → epfPpfVpf, else
 *  debtFunds); every other class has a single linked-holdings array. */
export function classHoldings(draft: FinancialPlan, key: string, subKey?: string): HoldingRow[] | null {
  if (key === 'debt') {
    if (subKey === 'fd') return draft.assets.debt.fds;
    if (subKey === 'epf') return draft.assets.debt.epfPpfVpf;
    return draft.assets.debt.debtFunds; // debtfund / liquid / unset
  }
  const arrs = classArrays(draft, key);
  return arrs[0] ?? null;
}

/** A sell reduces the class value; a buy/sip increases it. */
function signedValue(e: LedgerEntry): number {
  return e.kind === 'sell' ? -Math.abs(e.amount) : Math.abs(e.amount);
}

/** Create or refresh the Portfolio holding linked to a ledger entry (draft).
 *  Handles a sub-category change moving the holding to a different bucket. */
export function syncEntryHolding(draft: FinancialPlan, entry: LedgerEntry): void {
  const target = classHoldings(draft, entry.assetClassKey, entry.subKey);
  if (!target) return;
  const value = signedValue(entry);
  const category = subcatLabel(entry.assetClassKey, entry.subKey);

  // Find an existing linked holding anywhere in the class (it may have been
  // filed under a different sub-bucket before an edit).
  let existing: HoldingRow | undefined;
  let fromArr: HoldingRow[] | undefined;
  if (entry.holdingId) {
    for (const arr of classArrays(draft, entry.assetClassKey)) {
      const r = arr.find((x) => x.id === entry.holdingId);
      if (r) {
        existing = r;
        fromArr = arr;
        break;
      }
    }
  }

  if (existing && fromArr) {
    existing.name = entry.name;
    existing.value = value;
    existing.units = entry.units;
    existing.category = category;
    if (fromArr !== target) {
      fromArr.splice(fromArr.indexOf(existing), 1);
      target.push(existing);
    }
  } else {
    const id = entry.holdingId ?? newId();
    entry.holdingId = id;
    target.push({ id, name: entry.name, value, units: entry.units, category });
  }
}

/** Remove the Portfolio holding linked to a ledger entry (draft). */
export function removeEntryHolding(draft: FinancialPlan, entry: LedgerEntry): void {
  if (!entry.holdingId) return;
  for (const arr of classArrays(draft, entry.assetClassKey)) {
    const i = arr.findIndex((r) => r.id === entry.holdingId);
    if (i >= 0) {
      arr.splice(i, 1);
      return;
    }
  }
}

// ---- Editing Portfolio positions from the Ledger --------------------------
//
// The Ledger also lists read-only "positions" straight from the Portfolio
// (stocks, gold, FDs, a scalar like Home…). To let them be edited in place, each
// position carries a source descriptor pointing back to where it lives, and
// `editPosition` writes the change through to the plan.

/** Where a Ledger position lives in the plan, so it can be edited in place. */
export type PositionSource =
  | { kind: 'row'; classKey: string; array: string; id: string }
  | { kind: 'scalar'; path: string };

/** Resolve a named holdings array on a draft plan (for `PositionSource.array`). */
function namedArray(draft: FinancialPlan, name: string): HoldingRow[] | null {
  const a = draft.assets;
  switch (name) {
    case 'domesticEquity.stocks': return a.domesticEquity.stocks;
    case 'domesticEquity.mutualFunds': return a.domesticEquity.mutualFunds;
    case 'usEquity.others': return a.usEquity.others;
    case 'debt.fds': return a.debt.fds;
    case 'debt.debtFunds': return a.debt.debtFunds;
    case 'debt.epfPpfVpf': return a.debt.epfPpfVpf;
    case 'gold.others': return a.gold.others;
    case 'crypto.others': return a.crypto.others;
    case 'realEstate.others': return a.realEstate.others;
    default: {
      // custom:<classId>
      if (name.startsWith('custom:')) {
        const c = (draft.customClasses ?? []).find((x) => x.id === name.slice(7));
        return c ? c.holdings : null;
      }
      return null;
    }
  }
}

/** The scalar asset fields a position can map to (path → get/set on a draft). */
const SCALAR_PATHS: Record<string, { get: (a: FinancialPlan['assets']) => number; set: (a: FinancialPlan['assets'], v: number) => void }> = {
  'realEstate.home': { get: (a) => a.realEstate.home, set: (a, v) => { a.realEstate.home = v; } },
  'realEstate.otherRealEstate': { get: (a) => a.realEstate.otherRealEstate, set: (a, v) => { a.realEstate.otherRealEstate = v; } },
  'realEstate.reits': { get: (a) => a.realEstate.reits, set: (a, v) => { a.realEstate.reits = v; } },
  'debt.liquidCash': { get: (a) => a.debt.liquidCash, set: (a, v) => { a.debt.liquidCash = v; } },
  'gold.jewellery': { get: (a) => a.gold.jewellery, set: (a, v) => { a.gold.jewellery = v; } },
  'gold.sgb': { get: (a) => a.gold.sgb, set: (a, v) => { a.gold.sgb = v; } },
  'gold.goldEtf': { get: (a) => a.gold.goldEtf, set: (a, v) => { a.gold.goldEtf = v; } },
  'crypto.crypto': { get: (a) => a.crypto.crypto, set: (a, v) => { a.crypto.crypto = v; } },
  'misc.smallcase': { get: (a) => a.misc.smallcase, set: (a, v) => { a.misc.smallcase = v; } },
  'misc.ulips': { get: (a) => a.misc.ulips, set: (a, v) => { a.misc.ulips = v; } },
};

/** True when a position's source can hold a name/units (an array row), so the
 *  Ledger can offer those fields (scalars are value-only). */
export function positionEditable(src: PositionSource): boolean {
  return src.kind === 'row' || src.path in SCALAR_PATHS;
}

/** Apply an edit to a Portfolio position from the Ledger (draft). Array-row
 *  positions accept name/value/units; scalar positions accept value only. */
export function editPosition(
  draft: FinancialPlan,
  src: PositionSource,
  patch: { name?: string; value?: number; units?: number },
): void {
  if (src.kind === 'row') {
    const arr = namedArray(draft, src.array);
    const row = arr?.find((r) => r.id === src.id);
    if (!row) return;
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.value !== undefined) row.value = patch.value;
    if (patch.units !== undefined) row.units = patch.units || undefined;
  } else {
    const field = SCALAR_PATHS[src.path];
    if (field && patch.value !== undefined) field.set(draft.assets, patch.value);
  }
}

