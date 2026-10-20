import { describe, expect, it } from 'vitest';
import { duplicateGmailExpenseIds, gmailExpenseKey } from './gmailExpenseDedupe';

describe('gmailExpenseKey', () => {
  it('matches identical alerts despite merchant case and spacing differences', () => {
    const first = gmailExpenseKey({
      amount: 1700,
      date: '2026-08-29',
      paymentMethodId: 'icici-card',
      merchant: 'HAPPYBELLYBAKES',
    });

    describe('duplicateGmailExpenseIds', () => {
      const base = {
        amount: 500,
        date: '2026-10-20T00:00:00.000Z',
        paymentMethodId: 'sbi-card',
        note: 'CAFE',
        autoImported: true,
        createdAt: '2026-10-20T10:00:00.000Z',
      };

      it('removes a second row created from the same Gmail message', () => {
        expect(duplicateGmailExpenseIds([
          { ...base, id: 'first', gmailMessageId: 'gmail-1' },
          { ...base, id: 'second', gmailMessageId: 'gmail-1', createdAt: '2026-10-20T10:00:01.000Z' },
        ])).toEqual(['second']);
      });

      it('removes an overlapping-sync duplicate with a different message id but the same transaction key', () => {
        expect(duplicateGmailExpenseIds([
          { ...base, id: 'first', gmailMessageId: 'gmail-1', gmailTransactionKey: 'sbi|1234|2026-10-20|10:00:00|500.00' },
          { ...base, id: 'second', gmailMessageId: 'gmail-2', gmailTransactionKey: 'sbi|1234|2026-10-20|10:00:00|500.00' },
        ])).toEqual(['second']);
      });

      it('never removes a manually entered expense', () => {
        expect(duplicateGmailExpenseIds([
          { ...base, id: 'manual', autoImported: false, gmailMessageId: 'gmail-1' },
          { ...base, id: 'imported', gmailMessageId: 'gmail-1' },
        ])).toEqual([]);
      });

      it('keeps the reviewed copy when duplicate imported rows exist', () => {
        expect(duplicateGmailExpenseIds([
          { ...base, id: 'older', gmailMessageId: 'gmail-1' },
          { ...base, id: 'reviewed', gmailMessageId: 'gmail-1', reviewed: true, createdAt: '2026-10-20T10:00:01.000Z' },
        ])).toEqual(['older']);
      });
    });
    const duplicate = gmailExpenseKey({
      amount: 1700,
      date: '2026-08-29T00:00:00.000Z',
      paymentMethodId: 'icici-card',
      merchant: '  happybellybakes  ',
    });

    expect(duplicate).toBe(first);
  });

  it('keeps same-amount transactions at different merchants distinct', () => {
    const base = {
      amount: 500,
      date: '2026-09-18',
      paymentMethodId: 'hsbc-card',
    };

    expect(gmailExpenseKey({ ...base, merchant: 'CAFE ONE' })).not.toBe(
      gmailExpenseKey({ ...base, merchant: 'CAFE TWO' }),
    );
  });

  it('does not guess when merchant identity is missing', () => {
    expect(
      gmailExpenseKey({
        amount: 500,
        date: '2026-09-18',
        paymentMethodId: 'hsbc-card',
      }),
    ).toBeNull();
  });

  it('matches AU duplicate alerts by card and transaction time despite merchant variation', () => {
    const transaction = {
      source: 'au-cc',
      accountLast4: '7985',
      amount: 1178.82,
      date: '2026-09-03',
      transactionTime: '22:49:23',
      paymentMethodId: 'au-card',
    };

    expect(gmailExpenseKey({ ...transaction, merchant: 'UPI/KIWI SUBSCRIPTION' })).toBe(
      gmailExpenseKey({ ...transaction, merchant: 'KIWI SUBSCRIPTION' }),
    );
  });

  it('keeps same-card same-amount AU purchases at different times distinct', () => {
    const transaction = {
      source: 'au-cc',
      accountLast4: '7985',
      amount: 500,
      date: '2026-09-03',
      paymentMethodId: 'au-card',
      merchant: 'CAFE',
    };

    expect(gmailExpenseKey({ ...transaction, transactionTime: '10:00:00' })).not.toBe(
      gmailExpenseKey({ ...transaction, transactionTime: '10:01:00' }),
    );
  });
});