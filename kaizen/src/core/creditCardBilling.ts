import type { Expense, PaymentMethod } from '../types/models';

export interface CreditCardBillingRule {
  id: 'au' | 'bob' | 'hsbc' | 'sbi-rupay' | 'icici';
  label: string;
  billDay: number;
  paymentMethodNames: string[];
}

export interface CreditCardCycleSummary extends CreditCardBillingRule {
  start: Date;
  end: Date;
  total: number;
  transactionCount: number;
  linked: boolean;
}

export const CREDIT_CARD_BILLING_RULES: CreditCardBillingRule[] = [
  { id: 'au', label: 'AU Bank', billDay: 18, paymentMethodNames: ['AU Bank Credit Card'] },
  { id: 'bob', label: 'BOB Card', billDay: 18, paymentMethodNames: ['BOB Credit Card', 'BOB Card'] },
  { id: 'hsbc', label: 'HSBC', billDay: 9, paymentMethodNames: ['HSBC Credit Card'] },
  { id: 'sbi-rupay', label: 'SBI RuPay', billDay: 2, paymentMethodNames: ['SBI Credit Card', 'SBI RuPay'] },
  { id: 'icici', label: 'ICICI', billDay: 28, paymentMethodNames: ['ICICI Credit Card'] },
];

function localMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function normalizeName(name: string): string {
  return name.toLocaleLowerCase('en-IN').replace(/[^a-z0-9]/g, '');
}

/** The active period starts the day after the previous bill and includes the next bill date. */
export function currentCreditCardCycle(billDay: number, referenceDate = new Date()): { start: Date; end: Date } {
  const reference = localMidnight(referenceDate);
  const thisMonthBill = new Date(reference.getFullYear(), reference.getMonth(), billDay);
  const end = reference.getTime() <= thisMonthBill.getTime()
    ? thisMonthBill
    : new Date(reference.getFullYear(), reference.getMonth() + 1, billDay);
  const start = new Date(end.getFullYear(), end.getMonth() - 1, billDay + 1);
  return { start, end };
}

export function getCreditCardCycleSummaries(
  expenses: Expense[],
  paymentMethods: PaymentMethod[],
  referenceDate = new Date(),
): CreditCardCycleSummary[] {
  return CREDIT_CARD_BILLING_RULES.map((rule) => {
    const acceptedNames = new Set(rule.paymentMethodNames.map(normalizeName));
    const methodIds = new Set(
      paymentMethods
        .filter((method) => acceptedNames.has(normalizeName(method.name)))
        .map((method) => method.id),
    );
    const { start, end } = currentCreditCardCycle(rule.billDay, referenceDate);
    const matching = expenses.filter((expense) => {
      if (!expense.paymentMethodId || !methodIds.has(expense.paymentMethodId)) return false;
      const expenseDate = localMidnight(new Date(expense.date));
      return expenseDate.getTime() >= start.getTime() && expenseDate.getTime() <= end.getTime();
    });

    return {
      ...rule,
      start,
      end,
      total: matching.reduce((sum, expense) => sum + expense.amount, 0),
      transactionCount: matching.length,
      linked: methodIds.size > 0,
    };
  });
}