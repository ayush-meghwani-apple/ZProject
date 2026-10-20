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

interface StoredGmailExpenseIdentity extends GmailExpenseIdentity {
  id: string;
  autoImported?: boolean;
  reviewed?: boolean;
  createdAt?: string;
  gmailMessageId?: string;
  gmailTransactionKey?: string;
  note?: string | null;
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

/** Find duplicate rows created by overlapping Gmail imports. */
export function duplicateGmailExpenseIds(expenses: StoredGmailExpenseIdentity[]): string[] {
  const seenMessageIds = new Set<string>();
  const seenTransactionKeys = new Set<string>();
  const duplicates: string[] = [];
  const imported = expenses
    .filter((expense) => expense.autoImported)
    .sort((left, right) =>
      Number(!!right.reviewed) - Number(!!left.reviewed)
      || (left.createdAt ?? '').localeCompare(right.createdAt ?? '')
      || left.id.localeCompare(right.id));

  for (const expense of imported) {
    const messageId = expense.gmailMessageId;
    const transactionKey = expense.gmailTransactionKey;
    if (
      (messageId && seenMessageIds.has(messageId))
      || (transactionKey && seenTransactionKeys.has(transactionKey))
    ) {
      duplicates.push(expense.id);
      continue;
    }
    if (messageId) seenMessageIds.add(messageId);
    if (transactionKey) seenTransactionKeys.add(transactionKey);
  }
  return duplicates;
}