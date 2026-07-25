//
// Long-term capital-gains (LTCG) tax-harvesting for Indian EQUITY mutual funds.
//
// India taxes equity-MF gains as LONG-TERM once units are held > 12 months, and
// the first ₹1,25,000 of LTCG *per financial year* (Apr–Mar) is tax-free (12.5%
// above that). "Harvesting" means: near the financial-year end, sell just enough
// long-held units to realise LTCG up to that free limit, then re-buy — locking in
// tax-free profit and stepping up your cost basis.
//
// The hard part is per-LOT tracking: this month's SIP isn't a year old, last
// year's is. Each buy is a lot (date, units, NAV); we replay every fund's
// transactions FIFO (oldest units sold first) so we know, as of today, exactly
// which remaining units have crossed a year and what gain they carry. Redeems
// already made this FY also eat into the free limit, so we net those off too.
//
// Pure & dependency-free (unit-tested). Debt funds are excluded — they get no
// LTCG benefit (taxed at slab since Apr 2023).

import type { MFTransaction, MutualFundHolding } from '../types/models';

/** Units held longer than this are long-term (LTCG). 12 months. */
const LONG_TERM_MS = 365 * 24 * 60 * 60 * 1000;

/** Default tax-free LTCG allowance per financial year (₹1.25 lakh, post-Jul-2024). */
export const LTCG_EXEMPTION = 125000;

const EPS = 1e-6;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** One remaining (still-held) purchase lot as of the valuation date. */
export interface HarvestLot {
  date: string; // buy date (ISO)
  units: number; // units still held from this lot
  buyNav: number;
  costValue: number; // units × buyNav
  currentValue: number; // units × latest NAV
  gain: number; // currentValue − costValue (can be negative)
  ageDays: number;
  longTerm: boolean;
}

/** Harvest view for one equity fund. */
export interface FundHarvest {
  fundId: string;
  name: string;
  category: string;
  latestNav: number;
  currentUnits: number;
  currentValue: number;
  longTermUnits: number;
  longTermValue: number;
  longTermGain: number; // unrealised gain on long-term lots (positive lots only)
  shortTermUnits: number;
  shortTermValue: number;
  shortTermGain: number;
  /** When the oldest still-short-term lot crosses 1 year (and how many units
   *  cross then), so the owner can see what unlocks next. */
  nextLongTermDate?: string;
  nextLongTermUnits?: number;
  lots: HarvestLot[];
  // Suggested harvest for this fund (filled to fit the remaining FY allowance):
  sellUnits: number;
  sellProceeds: number;
  sellGain: number;
}

export interface HarvestPlan {
  asOf: string;
  fyLabel: string; // e.g. "2025–26"
  exemptionLimit: number;
  realizedLtcgThisFy: number; // LTCG already booked this FY (from prior redeems)
  remainingExemption: number; // tax-free room left this FY
  funds: FundHarvest[]; // equity funds that hold long-term units (gain>0), richest first
  holdings: FundHarvest[]; // ALL equity funds held (for the long-term vs short-term view)
  totalLongTermGain: number; // total unrealised LT gain available to harvest
  totalSuggestedGain: number;
  totalSuggestedProceeds: number;
  totalSuggestedUnits: number;
}

interface OpenLot {
  date: string;
  units: number;
  nav: number;
}

/** True if a fund's gains can be long-term (equity). Debt is excluded. */
export function isEquityCategory(category: string): boolean {
  return category !== 'debt';
}

/** The Indian financial year (Apr 1 – Mar 31) containing `d`. */
export function financialYear(d: Date): { start: Date; end: Date; label: string } {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; // Jan–Mar → previous FY
  const start = new Date(y, 3, 1, 0, 0, 0, 0);
  const end = new Date(y + 1, 2, 31, 23, 59, 59, 999);
  return { start, end, label: `${y}–${String((y + 1) % 100).padStart(2, '0')}` };
}

/** Replay a fund's transactions FIFO: returns the still-open lots (current
 *  holdings) and every long-term gain realised by past redeems. */
function replayFifo(txns: MFTransaction[]): { open: OpenLot[]; realizedLt: { date: Date; gain: number }[] } {
  const sorted = [...txns].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const open: OpenLot[] = [];
  const realizedLt: { date: Date; gain: number }[] = [];
  for (const t of sorted) {
    const u = num(t.units);
    const nav = Math.abs(num(t.nav));
    if (t.kind === 'redeem' || u < 0) {
      // A sale: consume oldest units first.
      let toSell = Math.abs(u);
      const saleDate = new Date(t.date);
      while (toSell > EPS && open.length) {
        const lot = open[0];
        const take = Math.min(lot.units, toSell);
        const heldMs = saleDate.getTime() - new Date(lot.date).getTime();
        if (heldMs >= LONG_TERM_MS) realizedLt.push({ date: saleDate, gain: take * (nav - lot.nav) });
        lot.units -= take;
        toSell -= take;
        if (lot.units <= EPS) open.shift();
      }
    } else if (u > EPS) {
      open.push({ date: t.date, units: u, nav });
    }
  }
  return { open, realizedLt };
}

/**
 * Compute the tax-harvest plan across all equity mutual funds.
 *
 * @param funds   the tracked MF holdings
 * @param opts.asOf            valuation date (default: now)
 * @param opts.exemptionLimit  tax-free LTCG per FY (default ₹1.25 L)
 */
export function computeHarvest(
  funds: MutualFundHolding[] = [],
  opts: { asOf?: Date; exemptionLimit?: number } = {},
): HarvestPlan {
  const asOf = opts.asOf ?? new Date();
  const exemptionLimit = opts.exemptionLimit ?? LTCG_EXEMPTION;
  const fy = financialYear(asOf);

  let realizedLtcgThisFy = 0;
  const fundViews: FundHarvest[] = [];

  for (const f of funds) {
    if (!isEquityCategory(f.category)) continue;
    const latestNav = num(f.latestNav);
    const { open, realizedLt } = replayFifo(f.transactions ?? []);

    for (const r of realizedLt) {
      if (r.date >= fy.start && r.date <= fy.end) realizedLtcgThisFy += r.gain;
    }

    const lots: HarvestLot[] = open
      .filter((l) => l.units > EPS)
      .map((l) => {
        const ageDays = Math.floor((asOf.getTime() - new Date(l.date).getTime()) / 86400000);
        const costValue = l.units * l.nav;
        const currentValue = l.units * latestNav;
        return {
          date: l.date,
          units: l.units,
          buyNav: l.nav,
          costValue,
          currentValue,
          gain: currentValue - costValue,
          ageDays,
          longTerm: asOf.getTime() - new Date(l.date).getTime() >= LONG_TERM_MS,
        };
      });

    let currentUnits = 0;
    let currentValue = 0;
    let longTermUnits = 0;
    let longTermValue = 0;
    let longTermGain = 0;
    let shortTermUnits = 0;
    let shortTermValue = 0;
    let shortTermGain = 0;
    let oldestShort: HarvestLot | undefined;
    for (const l of lots) {
      currentUnits += l.units;
      currentValue += l.currentValue;
      if (l.longTerm) {
        longTermUnits += l.units;
        longTermValue += l.currentValue;
        if (l.gain > 0) longTermGain += l.gain;
      } else {
        shortTermUnits += l.units;
        shortTermValue += l.currentValue;
        shortTermGain += l.gain;
        if (!oldestShort || new Date(l.date) < new Date(oldestShort.date)) oldestShort = l;
      }
    }
    // When the oldest short-term lot crosses 1 year (what unlocks next).
    let nextLongTermDate: string | undefined;
    let nextLongTermUnits: number | undefined;
    if (oldestShort) {
      nextLongTermDate = new Date(new Date(oldestShort.date).getTime() + LONG_TERM_MS).toISOString();
      nextLongTermUnits = oldestShort.units;
    }

    if (currentUnits <= EPS) continue;
    fundViews.push({
      fundId: f.id,
      name: f.name,
      category: f.category,
      latestNav,
      currentUnits,
      currentValue,
      longTermUnits,
      longTermValue,
      longTermGain,
      shortTermUnits,
      shortTermValue,
      shortTermGain,
      nextLongTermDate,
      nextLongTermUnits,
      lots,
      sellUnits: 0,
      sellProceeds: 0,
      sellGain: 0,
    });
  }

  const totalLongTermGain = fundViews.reduce((s, f) => s + f.longTermGain, 0);
  const remainingExemption = Math.max(0, exemptionLimit - Math.max(0, realizedLtcgThisFy));

  // Fill the remaining allowance from long-term, positive-gain lots. Sell the
  // oldest eligible units first (FIFO-friendly), partial on the lot that tips
  // over the limit so realised gain lands exactly on the free allowance.
  let budget = remainingExemption;
  const eligible = fundViews
    .flatMap((fv) => fv.lots.filter((l) => l.longTerm && l.gain > EPS).map((l) => ({ fv, l })))
    .sort((a, b) => a.l.ageDays === b.l.ageDays ? 0 : b.l.ageDays - a.l.ageDays); // oldest first

  for (const { fv, l } of eligible) {
    if (budget <= EPS) break;
    const gainPerUnit = l.currentValue / l.units - l.buyNav; // latestNav − buyNav
    if (gainPerUnit <= EPS) continue;
    let units: number;
    let gain: number;
    if (l.gain <= budget) {
      units = l.units;
      gain = l.gain;
    } else {
      units = budget / gainPerUnit;
      gain = budget;
    }
    const proceeds = units * (l.currentValue / l.units); // units × latestNav
    fv.sellUnits += units;
    fv.sellProceeds += proceeds;
    fv.sellGain += gain;
    budget -= gain;
  }

  // Show funds that carry harvestable long-term gains, richest first.
  const shownFunds = fundViews
    .filter((f) => f.longTermGain > EPS)
    .sort((a, b) => b.longTermGain - a.longTermGain);

  return {
    asOf: asOf.toISOString(),
    fyLabel: fy.label,
    exemptionLimit,
    realizedLtcgThisFy,
    remainingExemption,
    funds: shownFunds,
    holdings: [...fundViews].sort((a, b) => b.currentValue - a.currentValue),
    totalLongTermGain,
    totalSuggestedGain: shownFunds.reduce((s, f) => s + f.sellGain, 0),
    totalSuggestedProceeds: shownFunds.reduce((s, f) => s + f.sellProceeds, 0),
    totalSuggestedUnits: shownFunds.reduce((s, f) => s + f.sellUnits, 0),
  };
}
