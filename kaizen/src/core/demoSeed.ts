/**
 * Generates a realistic — but entirely fake — dataset so the app looks alive
 * when shown to someone for feedback. Runs ONLY against the demo database (see
 * demoMode.ts); the real database is never touched.
 *
 * Values are deliberately modest (salary ~₹1L, most figures well under ₹5L) but
 * there are lots of transactions across several months so every screen (Reels,
 * Summary, Fortuna Net Worth / Portfolio / Pulse) feels populated and real.
 */
import { storage } from '../storage';
import { PlannerRepository } from '../repository/plannerRepository';
import { newId, now } from './util';
import type {
  Category,
  Expense,
  HoldingRow,
  MFCategory,
  MutualFundHolding,
  MFTransaction,
  PaymentMethod,
  RecurringExpense,
  SalaryCycle,
  Subcategory,
} from '../types/models';

const rand = () => Math.random();
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const iso = (d: Date) => d.toISOString();
const roundTo = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);

/** Spend range (min, max, rounding) chosen by a category's name. */
function rangeFor(name: string): [number, number, number] {
  const n = name.toLowerCase();
  if (/food|dining|restaurant|eat/.test(n)) return [40, 900, 5];
  if (/grocer/.test(n)) return [120, 2600, 10];
  if (/transport|travel|cab|fuel|commut/.test(n)) return [20, 900, 5];
  if (/bill|utilit|recharge|electric/.test(n)) return [200, 3200, 10];
  if (/shop|cloth|fashion/.test(n)) return [150, 4800, 10];
  if (/health|medic|pharma|doctor/.test(n)) return [80, 2400, 10];
  if (/entertain|movie|subscription|fun/.test(n)) return [90, 1600, 10];
  if (/rent|home|house/.test(n)) return [6000, 15000, 100];
  if (/educat|course|book/.test(n)) return [200, 3000, 10];
  return [40, 1500, 5];
}

/** A few natural-sounding notes per category flavour. */
function noteFor(name: string): string | undefined {
  if (rand() > 0.42) return undefined;
  const n = name.toLowerCase();
  if (/food|dining/.test(n)) return pick(['lunch with team', 'dinner', 'coffee & snacks', 'weekend brunch', 'chai']);
  if (/grocer/.test(n)) return pick(['weekly groceries', 'veggies & fruits', 'monthly stock-up']);
  if (/transport|travel|cab/.test(n)) return pick(['auto', 'cab home', 'metro card', 'fuel']);
  if (/bill|utilit/.test(n)) return pick(['electricity', 'broadband', 'mobile recharge', 'water bill']);
  if (/shop/.test(n)) return pick(['new shoes', 'kurta', 'headphones', 'gift']);
  if (/health/.test(n)) return pick(['pharmacy', 'consultation', 'vitamins']);
  if (/entertain/.test(n)) return pick(['movie night', 'Netflix', 'concert tickets']);
  return undefined;
}

/** Set a named cash-flow / liability row's value (adds it if missing). */
function setRow(rows: HoldingRow[], name: string, value: number) {
  const r = rows.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (r) r.value = value;
  else rows.push({ id: newId(), name, value });
}

/** Build one auto-tracked mutual fund with a monthly-SIP buy ledger. */
function makeFund(
  name: string,
  category: MFCategory,
  schemeCode: number,
  startNav: number,
  monthly: number,
  months: number,
): MutualFundHolding {
  const first = new Date();
  first.setMonth(first.getMonth() - months);
  first.setDate(5);
  let nav = startNav;
  const transactions: MFTransaction[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(first);
    d.setMonth(first.getMonth() + i);
    const units = +(monthly / nav).toFixed(3);
    transactions.push({ id: newId(), date: iso(d), amount: monthly, units, nav: +nav.toFixed(2), kind: 'sip', auto: true });
    nav = nav * (1 + (rand() * 0.08 - 0.028));
  }
  return {
    id: newId(),
    schemeCode,
    name,
    category,
    transactions,
    sip: { amount: monthly, dayOfMonth: 5, startDate: iso(first), active: true },
    latestNav: +(nav * 1.02).toFixed(2),
    latestNavDate: now(),
    createdAt: now(),
    updatedAt: now(),
  };
}

/**
 * Seed the demo database with fake expenses, cycles, recurring rules and a full
 * Fortuna plan. Idempotent: does nothing if the demo DB already has expenses.
 */
export async function seedDemoDataIfNeeded(): Promise<void> {
  const existing = await storage.expenses.getAll();
  if (existing.length > 0) return; // already seeded this demo DB

  const categories: Category[] = await storage.categories.getAll();
  const subcategories: Subcategory[] = await storage.subcategories.getAll();
  const methods: PaymentMethod[] = await storage.paymentMethods.getAll();
  if (categories.length === 0) return; // defaults not seeded yet — bail safely

  // ---- Salary cycles: the last 6 paydays (28th of each month) ----
  const anchor = new Date();
  let y = anchor.getFullYear();
  let m = anchor.getMonth();
  if (anchor.getDate() < 28) {
    m -= 1;
    if (m < 0) { m = 11; y -= 1; }
  }
  const starts: Date[] = [];
  for (let i = 5; i >= 0; i--) starts.push(new Date(y, m - i, 28, 0, 0, 0, 0));

  const cycles: SalaryCycle[] = starts.map((s, idx) => ({
    id: newId(),
    startDate: iso(s),
    endDate: idx === starts.length - 1 ? undefined : iso(starts[idx + 1]),
    salaryReceived: roundTo(95000 + rand() * 16000, 500),
  }));
  await storage.salaryCycles.bulkPut(cycles);

  // ---- Expenses: many per cycle, spread across its dates ----
  const today = new Date();
  const expenses: Expense[] = [];
  cycles.forEach((cycle, idx) => {
    const start = starts[idx].getTime();
    const end = Math.min(idx === cycles.length - 1 ? today.getTime() : starts[idx + 1].getTime(), today.getTime());
    if (end <= start) return;
    const count = 32 + Math.floor(rand() * 22);
    for (let k = 0; k < count; k++) {
      const cat = pick(categories);
      const subs = subcategories.filter((s) => s.categoryId === cat.id);
      const sub = subs.length && rand() > 0.25 ? pick(subs) : undefined;
      const [lo, hi, step] = rangeFor(cat.name);
      // Bias towards the lower end, with the occasional bigger spend.
      const base = lo + Math.pow(rand(), 2.2) * (hi - lo);
      const amount = roundTo(base, step);
      const when = new Date(start + rand() * (end - start));
      const method = methods.length && rand() > 0.25 ? pick(methods) : undefined;
      const ts = iso(when);
      expenses.push({
        id: newId(),
        amount,
        date: ts,
        salaryCycleId: cycle.id,
        categoryId: cat.id,
        subcategoryId: sub?.id,
        paymentMethodId: method?.id,
        note: noteFor(cat.name),
        createdAt: ts,
        updatedAt: ts,
      });
    }
  });
  await storage.expenses.bulkPut(expenses);

  // ---- A couple of recurring rules ----
  const billsCat = categories.find((c) => /bill/i.test(c.name)) ?? categories[0];
  const entCat = categories.find((c) => /entertain/i.test(c.name)) ?? categories[0];
  const nextOfMonth = (day: number) => {
    const d = new Date(today.getFullYear(), today.getMonth(), day, 0, 0, 0, 0);
    if (d.getTime() < today.getTime()) d.setMonth(d.getMonth() + 1);
    return iso(d);
  };
  const recurring: RecurringExpense[] = [
    { id: newId(), amount: 12000, categoryId: billsCat.id, note: 'Rent', frequency: 'monthly', dayOfMonth: 5, nextDate: nextOfMonth(5), active: true, createdAt: now(), updatedAt: now() },
    { id: newId(), amount: 649, categoryId: entCat.id, note: 'Netflix', frequency: 'monthly', dayOfMonth: 2, nextDate: nextOfMonth(2), active: true, createdAt: now(), updatedAt: now() },
    { id: newId(), amount: 999, categoryId: billsCat.id, note: 'Broadband', frequency: 'monthly', dayOfMonth: 8, nextDate: nextOfMonth(8), active: true, createdAt: now(), updatedAt: now() },
  ];
  await storage.recurring.bulkPut(recurring);

  // ---- Fortuna plan (all figures modest, most well under ₹5L) ----
  const plan = await PlannerRepository.load(); // creates + returns a default plan in the demo DB
  setRow(plan.cashFlow.inflows, 'Post-tax salary', 102000);
  setRow(plan.cashFlow.inflows, 'Others', 4000);
  setRow(plan.cashFlow.outflows, 'Monthly expenses', 46000);
  setRow(plan.cashFlow.outflows, 'Compulsory investments', 19000);
  setRow(plan.cashFlow.outflows, 'Loan EMIs', 11500);
  setRow(plan.cashFlow.outflows, 'Insurance premiums', 2800);

  plan.assets.realEstate.reits = 60000;
  plan.assets.debt.liquidCash = 240000;
  plan.assets.debt.fds = [{ id: newId(), name: 'HDFC FD', value: 150000 }];
  plan.assets.debt.epfPpfVpf = [{ id: newId(), name: 'EPF', value: 310000 }];
  plan.assets.gold.jewellery = 130000;
  plan.assets.gold.sgb = 45000;
  plan.assets.domesticEquity.stocks = [
    { id: newId(), name: 'HDFC Bank', category: 'Largecap', value: 82000, units: 45 },
    { id: newId(), name: 'Tata Motors', category: 'Midcap', value: 41000, units: 42 },
    { id: newId(), name: 'Zomato', category: 'Smallcap', value: 23000, units: 120 },
  ];
  plan.assets.usEquity.others = [{ id: newId(), name: 'S&P 500 ETF (VOO)', value: 72000 }];

  plan.mutualFunds = [
    makeFund('Parag Parikh Flexi Cap Fund', 'flexicap', 122639, 55, 8000, 11),
    makeFund('Nippon India Small Cap Fund', 'smallcap', 118778, 95, 5000, 9),
    makeFund('ICICI Prudential Nifty 50 Index', 'largecap', 120620, 130, 6000, 12),
  ];

  plan.goals = [
    { id: newId(), name: 'Emergency fund', goalTypeId: 'short', yearsLeft: 1, amountRequiredToday: 300000, amountAvailableToday: 140000, inflationPct: 6, stepUpPct: 5 },
    { id: newId(), name: 'New car', goalTypeId: 'medium', yearsLeft: 3, amountRequiredToday: 450000, amountAvailableToday: 60000, inflationPct: 7, stepUpPct: 10 },
    { id: newId(), name: 'Home downpayment', goalTypeId: 'long', yearsLeft: 8, amountRequiredToday: 500000, amountAvailableToday: 80000, inflationPct: 6, stepUpPct: 10 },
  ];

  setRow(plan.liabilities.items, 'Car loan', 180000);
  setRow(plan.liabilities.items, 'Credit card', 18000);

  await PlannerRepository.save(plan);
}
