interface GmailExpenseIdentity {
  amount: number;
  date?: string | null;
  paymentMethodId?: string;
  merchant?: string | null;
}

function normalizeMerchant(merchant: string): string {
  return merchant.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Stable identity for duplicate bank alerts describing the same expense. */
export function gmailExpenseKey(expense: GmailExpenseIdentity): string | null {
  const merchant = expense.merchant ? normalizeMerchant(expense.merchant) : '';
  if (!expense.date || !expense.paymentMethodId || !merchant) return null;
  return [
    expense.paymentMethodId,
    expense.date.slice(0, 10),
    expense.amount.toFixed(2),
    merchant,
  ].join('|');
}