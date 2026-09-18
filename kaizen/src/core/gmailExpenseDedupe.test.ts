import { describe, expect, it } from 'vitest';
import { gmailExpenseKey } from './gmailExpenseDedupe';

describe('gmailExpenseKey', () => {
  it('matches identical alerts despite merchant case and spacing differences', () => {
    const first = gmailExpenseKey({
      amount: 1700,
      date: '2026-08-29',
      paymentMethodId: 'icici-card',
      merchant: 'HAPPYBELLYBAKES',
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
});