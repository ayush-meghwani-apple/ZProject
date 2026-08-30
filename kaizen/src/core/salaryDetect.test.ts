import { describe, it, expect } from 'vitest';
import { detectSalary, expectedPayday, isNearPayday } from './salaryDetect';
import type { ParsedTxnEmail } from './emailParse';

function credit(amount: number, date: string | null): ParsedTxnEmail {
  return {
    amount,
    direction: 'credit',
    merchant: null,
    date,
    accountLast4: '4567',
    source: 'sbi-savings',
    kind: 'account',
    confidence: 0.8,
    raw: { from: 'SBI', subject: 'Credit alert' },
  };
}

describe('expectedPayday', () => {
  it('is the 28th on a weekday', () => {
    // 28 Aug 2025 is a Thursday.
    const d = expectedPayday(2025, 7);
    expect(d.getDate()).toBe(28);
  });
  it('pulls back to Friday when the 28th is a weekend', () => {
    // 28 Jun 2025 is a Saturday → 27th (Friday).
    const d = expectedPayday(2025, 5);
    expect(d.getDate()).toBe(27);
  });
});

describe('isNearPayday', () => {
  it('accepts a credit on the payday', () => {
    expect(isNearPayday('2025-08-28')).toBe(true);
  });
  it('accepts a credit a couple of days off', () => {
    expect(isNearPayday('2025-08-27')).toBe(true);
  });
  it('rejects a mid-month credit', () => {
    expect(isNearPayday('2025-08-12')).toBe(false);
  });
});

describe('detectSalary', () => {
  const opts = { minAmount: 20000, windowDays: 3 };

  it('detects via salary narration regardless of amount/date', () => {
    const v = detectSalary(credit(1000, '2025-08-12'), 'NEFT SALARY for Aug', opts);
    expect(v.isSalary).toBe(true);
  });

  it('detects a large credit near payday without a keyword', () => {
    const v = detectSalary(credit(150000, '2025-08-28'), 'Amount credited to your a/c', opts);
    expect(v.isSalary).toBe(true);
  });

  it('ignores a small credit near payday', () => {
    const v = detectSalary(credit(500, '2025-08-28'), 'Cashback credited', opts);
    expect(v.isSalary).toBe(false);
  });

  it('ignores a large credit mid-month with no keyword', () => {
    const v = detectSalary(credit(150000, '2025-08-12'), 'Amount credited', opts);
    expect(v.isSalary).toBe(false);
  });

  it('ignores debits', () => {
    const debit = { ...credit(150000, '2025-08-28'), direction: 'debit' as const };
    expect(detectSalary(debit, 'salary', opts).isSalary).toBe(false);
  });

  it('respects minAmount=0 disabling the amount path', () => {
    const v = detectSalary(credit(150000, '2025-08-28'), 'credited', { minAmount: 0 });
    expect(v.isSalary).toBe(false);
  });
});
