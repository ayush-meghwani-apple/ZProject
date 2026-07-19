//
// General-ledger ↔ portfolio linking. A non-mutual-fund ledger entry (a gold-coin
// buy, a US stock, an FD…) maintains a single Portfolio holding row (1:1, linked
// by `holdingId`) inside its asset class, so adding/editing/deleting the entry
// keeps the portfolio in sync. Mutual funds are NOT handled here — they live in
// their own fund ledger and are valued from live NAV.

import type { AssetClassKey, FinancialPlan, HoldingRow, LedgerEntry } from '../types/models';
import { newId } from './util';

const BUILTIN_LABELS: Record<AssetClassKey, string> = {
  domestic_equity: 'Domestic Equity',
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

/** The mutable holdings array a class's linked ledger holdings live in, or null
 *  if the key is unknown. Operates on a draft plan. */
export function classHoldings(draft: FinancialPlan, key: string): HoldingRow[] | null {
  const a = draft.assets;
  switch (key) {
    case 'domestic_equity':
      return a.domesticEquity.stocks;
    case 'us_equity':
      return a.usEquity.others;
    case 'debt':
      return a.debt.debtFunds;
    case 'gold':
      return a.gold.others;
    case 'crypto':
      return a.crypto.others;
    case 'real_estate':
      return a.realEstate.others;
    default: {
      const c = (draft.customClasses ?? []).find((x) => x.id === key);
      return c ? c.holdings : null;
    }
  }
}

/** A sell reduces the class value; a buy/sip increases it. */
function signedValue(e: LedgerEntry): number {
  return e.kind === 'sell' ? -Math.abs(e.amount) : Math.abs(e.amount);
}

/** Create or refresh the Portfolio holding linked to a ledger entry (draft). */
export function syncEntryHolding(draft: FinancialPlan, entry: LedgerEntry): void {
  const rows = classHoldings(draft, entry.assetClassKey);
  if (!rows) return;
  const value = signedValue(entry);
  const existing = entry.holdingId ? rows.find((r) => r.id === entry.holdingId) : undefined;
  if (existing) {
    existing.name = entry.name;
    existing.value = value;
    existing.units = entry.units;
  } else {
    const id = entry.holdingId ?? newId();
    entry.holdingId = id;
    rows.push({ id, name: entry.name, value, units: entry.units });
  }
}

/** Remove the Portfolio holding linked to a ledger entry (draft). */
export function removeEntryHolding(draft: FinancialPlan, entry: LedgerEntry): void {
  if (!entry.holdingId) return;
  const rows = classHoldings(draft, entry.assetClassKey);
  if (!rows) return;
  const i = rows.findIndex((r) => r.id === entry.holdingId);
  if (i >= 0) rows.splice(i, 1);
}
