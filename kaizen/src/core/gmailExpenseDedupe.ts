interface GmailExpenseIdentity {
  amount: number;
  date?: string | null;
  paymentMethodId?: string;
  merchant?: string | null;
  source?: string;
  accountLast4?: string | null;
  transactionTime?: string | null;
  storedKey?: string;
}

function normalizeMerchant(merchant: string): string {
  return merchant
    .trim()
    .replace(/^(?:upi|pos|ecom|online)[\s/-]+/i, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Stable identity for duplicate bank alerts describing the same expense. */
export function gmailExpenseKey(expense: GmailExpenseIdentity): string | null {
  if (expense.storedKey) return expense.storedKey;
  if (
    expense.source &&
    expense.accountLast4 &&
    expense.date &&
    expense.transactionTime
  ) {
    return [
      expense.source,
      expense.accountLast4,
      expense.date.slice(0, 10),
      expense.transactionTime,
      expense.amount.toFixed(2),
    ].join('|');
  }
  const merchant = expense.merchant ? normalizeMerchant(expense.merchant) : '';
  if (!expense.date || !expense.paymentMethodId || !merchant) return null;
  return [
    expense.paymentMethodId,
    expense.date.slice(0, 10),
    expense.amount.toFixed(2),
    merchant,
  ].join('|');
}