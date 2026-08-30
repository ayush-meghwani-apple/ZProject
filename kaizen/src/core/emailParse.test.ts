import { describe, it, expect } from 'vitest';
import {
  parseTransactionEmail,
  extractAmount,
  extractDate,
  extractLast4,
  extractMerchant,
  detectSource,
  buildGmailQuery,
} from './emailParse';

describe('extractAmount', () => {
  it('picks the transaction amount, not the available limit', () => {
    const body =
      'Rs.1,234.56 spent on your SBI Card ending 1234 at AMAZON. Available limit Rs.98,765.00.';
    expect(extractAmount(body)).toBe(1234.56);
  });

  it('handles INR and ₹ symbols with commas', () => {
    expect(extractAmount('debited by INR 2,000 for a purchase')).toBe(2000);
    expect(extractAmount('₹ 49.00 paid to VPA test@ybl')).toBe(49);
  });

  it('returns null when no currency figure is present', () => {
    expect(extractAmount('Your statement is ready to view online.')).toBeNull();
  });
});

describe('extractDate', () => {
  it('parses 30 Aug 2025', () => {
    expect(extractDate('on 30 Aug 2025 at')).toBe('2025-08-30');
  });
  it('parses Aug 30, 2025', () => {
    expect(extractDate('on Aug 30, 2025 at 14:30')).toBe('2025-08-30');
  });
  it('parses 30-08-25 day-first', () => {
    expect(extractDate('dated 30-08-25.')).toBe('2025-08-30');
  });
  it('parses 05/09/2025', () => {
    expect(extractDate('on 05/09/2025')).toBe('2025-09-05');
  });
});

describe('extractLast4', () => {
  it('reads "ending 1234"', () => {
    expect(extractLast4('your card ending 1234 was used')).toBe('1234');
  });
  it('reads "XX9876"', () => {
    expect(extractLast4('Credit Card XX9876 has been used')).toBe('9876');
  });
});

describe('extractMerchant', () => {
  it('reads "at MERCHANT on"', () => {
    expect(extractMerchant('spent at AMAZON INDIA on 30 Aug 2025')).toBe('AMAZON INDIA');
  });
  it('reads "Info: MERCHANT"', () => {
    expect(extractMerchant('transaction. Info: SWIGGY BANGALORE.')).toBe('SWIGGY BANGALORE');
  });
  it('reads a UPI VPA', () => {
    expect(extractMerchant('paid to VPA merchant@okhdfcbank on')).toBe('merchant@okhdfcbank');
  });
});

describe('detectSource', () => {
  it('detects SBI Card', () => {
    expect(detectSource('SBI Card <noreply@sbicard.com>', 'Txn alert', 'SBI Card')).toBe('sbicard');
  });
  it('detects HSBC credit card', () => {
    expect(detectSource('HSBC <alerts@hsbc.co.in>', 'HSBC Credit Card', 'x')).toBe('hsbc-cc');
  });
  it('detects ICICI only when it is a credit card', () => {
    expect(detectSource('ICICI <cc@icicibank.com>', 'ICICI Credit Card alert', 'x')).toBe('icici-cc');
    expect(detectSource('ICICI <alerts@icicibank.com>', 'Account update', 'x')).toBe('unknown');
  });
  it('detects SBI savings account alerts', () => {
    expect(
      detectSource('SBI <alerts@sbi.co.in>', 'Transaction alert', 'Your a/c is debited by UPI'),
    ).toBe('sbi-savings');
  });
});

describe('parseTransactionEmail', () => {
  it('parses an SBI Card spend', () => {
    const p = parseTransactionEmail({
      from: 'SBI Card <noreply@sbicard.com>',
      subject: 'Transaction alert on your SBI Credit Card',
      body: 'Rs.499.00 spent on your SBI Credit Card ending 1234 at NETFLIX on 30-08-25. Avl limit Rs.90,000.',
    });
    expect(p.source).toBe('sbicard');
    expect(p.amount).toBe(499);
    expect(p.direction).toBe('debit');
    expect(p.merchant).toBe('NETFLIX');
    expect(p.accountLast4).toBe('1234');
    expect(p.date).toBe('2025-08-30');
    expect(p.kind).toBe('card');
    expect(p.confidence).toBeGreaterThan(0.8);
  });

  it('parses an SBI savings UPI debit (covers Paytm/CRED/PhonePe)', () => {
    const p = parseTransactionEmail({
      from: 'SBI <alerts@sbi.co.in>',
      subject: 'Transaction alert for your SBI account',
      body: 'Dear Customer, your a/c no. XX4567 is debited by Rs.150.00 on 30-08-2025 to VPA store@paytm. -SBI',
    });
    expect(p.source).toBe('sbi-savings');
    expect(p.kind).toBe('account');
    expect(p.amount).toBe(150);
    expect(p.direction).toBe('debit');
    expect(p.merchant).toBe('store@paytm');
    expect(p.accountLast4).toBe('4567');
  });

  it('flags a credit-card statement as low-confidence, no merchant', () => {
    const p = parseTransactionEmail({
      from: 'HSBC <estatements@hsbc.co.in>',
      subject: 'Your HSBC Credit Card e-statement is ready',
      body: 'Total amount due Rs.15,000.00. Minimum amount due Rs.750.00. Due date 18 Sep 2025.',
    });
    expect(p.source).toBe('hsbc-cc');
    expect(p.kind).toBe('statement');
    expect(p.merchant).toBeNull();
    expect(p.confidence).toBeLessThanOrEqual(0.5);
  });

  it('detects a credit/refund direction', () => {
    const p = parseTransactionEmail({
      from: 'ICICI <cc@icicibank.com>',
      subject: 'ICICI Credit Card refund',
      body: 'INR 300.00 has been credited/refunded to your ICICI Credit Card XX1111 on Aug 12, 2025.',
    });
    expect(p.direction).toBe('credit');
    expect(p.amount).toBe(300);
  });

  it('reads a salary credit as CREDIT even when the body says "transaction of"', () => {
    const p = parseTransactionEmail({
      from: 'IDFC FIRST Bank <transaction.alerts@idfcfirstbank.com>',
      subject: 'Transaction alert',
      body: 'Dear Ayush, a transaction of INR 2,50,000.00 has been credited to your IDFC FIRST Bank account XX4321 on 28 Aug 2025.',
    });
    // "credited" must win over the weak "transaction of" so it is not a spend.
    expect(p.direction).toBe('credit');
    expect(p.source).toBe('idfc-savings');
  });

  it('falls back to receivedAt when no in-body date', () => {
    const p = parseTransactionEmail({
      from: 'SBI Card <noreply@sbicard.com>',
      subject: 'Txn alert',
      body: 'Rs.99 spent on your SBI Credit Card at SHOP.',
      receivedAt: Date.UTC(2025, 0, 15, 10, 0, 0),
    });
    expect(p.date).toBe('2025-01-15');
  });
});

describe('buildGmailQuery', () => {
  it('includes all tracked senders and a recency window', () => {
    const q = buildGmailQuery(60);
    expect(q).toContain('from:sbicard.com');
    expect(q).toContain('from:icicibank.com');
    expect(q).toContain('newer_than:60d');
  });
});
