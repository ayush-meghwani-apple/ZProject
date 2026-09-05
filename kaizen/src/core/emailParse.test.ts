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

  it('prefers the amount followed by "spent" over an earlier promo/footer figure', () => {
    // Real SBI Card layout: promo banners appear BEFORE the transaction line.
    const body =
      'Get Rs.200 cashback on SimplyCLICK! Rs.170.00 spent on your SBI Credit Card ending with 6735 at TOGETHERPARTNERS on 29-08-26 via UPI (Ref No. 214400160341). Available limit Rs.90,000.';
    expect(extractAmount(body)).toBe(170);
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
  it('detects BOB and AU credit cards', () => {
    expect(detectSource('BOBCARD <donotreply@bobcard.in>', 'Transaction alert', 'BOBCARD')).toBe(
      'bobcard-cc',
    );
    expect(
      detectSource(
        'AU Bank <aucreditcards.alerts@aubank.in>',
        'AU Bank Credit Card Transaction Alert',
        '',
      ),
    ).toBe('au-cc');
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

  it('rejects an SBI Card Flexipay EMI-conversion promo', () => {
    const p = parseTransactionEmail({
      from: 'SBI Card <offers@sbicard.com>',
      subject: 'Convert your recent trans. into Flexipay EMI!',
      body: 'Enjoy ZERO Processing Fee on converting your transaction of Rs.7,296.30 into Flexipay EMIs for 24 months. Book Flexipay now.',
    });
    expect(p.kind).toBe('promo');
  });

  it('parses an ICICI credit-card alert from icici.bank.in', () => {
    const p = parseTransactionEmail({
      from: 'ICICI Bank <credit_cards@icici.bank.in>',
      subject: 'Transaction alert for your ICICI Bank Credit Card',
      body: 'Your ICICI Bank Credit Card XX6005 has been used for a transaction of INR 1,700.00 on Aug 29, 2026 at 02:18:05. Info: HAPPYBELLYBAKES. The Available Credit Limit on your card is INR 73,300.00.',
    });
    expect(p.source).toBe('icici-cc');
    expect(p.amount).toBe(1700);
    expect(p.direction).toBe('debit');
    expect(p.merchant).toBe('HAPPYBELLYBAKES');
  });

  it('parses a YONO SBI fund transfer (Transaction success) as an account debit', () => {
    const p = parseTransactionEmail({
      from: 'YONO SBI <yonobysbi@alerts.sbi.bank.in>',
      subject: 'Transaction success',
      body: 'Thank you for using YONO SBI for Fund Transfer. Transaction Status Successful Amount Rs.40,000.00 Transaction Number 624012821117 Date of Transaction 28.08.26 Debit account x7538 Beneficiary Name Mom Beneficiary Account Number x4779',
    });
    expect(p.source).toBe('sbi-savings');
    expect(p.amount).toBe(40000);
    expect(p.direction).toBe('debit');
    expect(p.merchant).toBe('Mom');
  });

  it('rejects a declined / failed transaction (no money moved)', () => {
    const p = parseTransactionEmail({
      from: 'YONO SBI <yonobysbi@alerts.sbi.bank.in>',
      subject: 'Transaction declined',
      body: 'Thank you for using YONO SBI for Fund Transfer. Transaction Status Declined due to incorrect OTP Amount Rs.40,000.00 Date of Transaction 28.08.26 Debit account x7538 Beneficiary Name Mom',
    });
    expect(p.kind).toBe('failed');
  });

  it('reads an HSBC card spend as debit despite a stray credit word in the footer', () => {
    const p = parseTransactionEmail({
      from: 'HSBC <hsbc@mail.hsbc.co.in>',
      subject: 'Credit Card Transaction Alert',
      body: "We're writing to confirm that your HSBC Credit Card xx6043 was used for a transaction of INR 1339.00 at CHINA PEARL ENTERPRISE on 29/08/26. Available limit: INR 320611.76. You received this email as an HSBC India customer.",
    });
    expect(p.source).toBe('hsbc-cc');
    expect(p.amount).toBe(1339);
    expect(p.direction).toBe('debit');
    expect(p.kind).toBe('card');
  });

  it('skips an OTP notification even though it carries a transaction amount', () => {
    const p = parseTransactionEmail({
      from: 'HSBC <hsbc@mail.hsbc.co.in>',
      subject: 'Your HSBC Credit Card OTP',
      body: 'Your OTP for the transaction of INR 2064.00 is 123456. Do not share this OTP with anyone.',
    });
    expect(p.kind).toBe('promo');
  });

  it('parses a BOB Card spend with a dotted merchant name', () => {
    const p = parseTransactionEmail({
      from: 'BOBCARD <donotreply@bobcard.in>',
      subject: 'Dear Customer',
      body: 'Thank you for using your BOBCARD **3643 for a transaction of INR 7,977.92 at raz*airbnb on 05-09-2026. Following this transaction, the available balance on your card is Rs 183,184.00.',
    });
    expect(p.source).toBe('bobcard-cc');
    expect(p.amount).toBe(7977.92);
    expect(p.direction).toBe('debit');
    expect(p.merchant).toBe('raz*airbnb');
    expect(p.accountLast4).toBe('3643');
    expect(p.date).toBe('2026-09-05');
  });

  it('keeps a BOB Card reversal as a credit so it is not imported as a spend', () => {
    const p = parseTransactionEmail({
      from: 'BOBCARD <donotreply@bobcard.in>',
      subject: 'Dear Customer',
      body: 'BOBCARD UPDATE: Transaction on your BOBCARD ending 3643 for INR 4,162.08 is credited/reversed by Agoda Com Ximen Le R on 05-09-2026.',
    });
    expect(p.source).toBe('bobcard-cc');
    expect(p.amount).toBe(4162.08);
    expect(p.direction).toBe('credit');
  });

  it('parses an AU Bank Credit Card spend', () => {
    const p = parseTransactionEmail({
      from: 'AU Bank Credit Card Alerts <aucreditcards.alerts@aubank.in>',
      subject: 'AU Bank Credit Card Transaction Alert',
      body: 'INR 1,178.82 were spent on your AU Bank Credit Card xx7985 at UPI/KIWI SUBSCRIPTION on 03-09-2026 at 10:49:23 pm.',
    });
    expect(p.source).toBe('au-cc');
    expect(p.amount).toBe(1178.82);
    expect(p.direction).toBe('debit');
    expect(p.merchant).toBe('UPI/KIWI SUBSCRIPTION');
    expect(p.accountLast4).toBe('7985');
    expect(p.date).toBe('2026-09-03');
  });
});

describe('buildGmailQuery', () => {
  it('includes all tracked senders and a recency window (no subject filter)', () => {
    const q = buildGmailQuery(60);
    expect(q).toContain('from:sbicard.com');
    expect(q).toContain('from:bobcard.in');
    expect(q).toContain('from:aubank.in');
    expect(q).toContain('from:icicibank.com');
    expect(q).toContain('from:icici.bank.in');
    expect(q).toContain('from:sbi.bank.in');
    expect(q).not.toContain('subject:');
    expect(q).toContain('newer_than:60d');
  });
});
