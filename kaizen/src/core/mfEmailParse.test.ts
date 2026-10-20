import { describe, expect, it } from 'vitest';
import { buildMfMonthQuery, parseEtMoneyInvestmentEmail } from './mfEmailParse';

describe('parseEtMoneyInvestmentEmail', () => {
  it('parses an ET Money SIP confirmation', () => {
    const parsed = parseEtMoneyInvestmentEmail({
      from: 'ET Money <help@etmoneycare.com>',
      subject: 'Your savings just went up',
      body: `
        SIP of ₹5,100 added to your savings
        Scheme name Quant Mid Cap Fund Direct-Growth
        Amount ₹5,100
        Units 20.4850
        Price(NAV) ₹248.95
        Folio No. 5102963484
        Date of Investment Sep. 1st, 2026
        Order Number 101-0100455-0060687
        EOP Code EOP-0002
      `,
    });

    expect(parsed).toEqual({
      schemeName: 'Quant Mid Cap Fund Direct-Growth',
      amount: 5100,
      units: 20.485,
      nav: 248.95,
      folio: '5102963484',
      investmentDate: '2026-09-01',
      orderNumber: '101-0100455-0060687',
      kind: 'sip',
    });
  });

  it('parses a one-time ET Money investment without marking it as SIP', () => {
    const parsed = parseEtMoneyInvestmentEmail({
      from: 'ET Money <help@etmoneycare.com>',
      subject: 'Your savings just went up',
      body: `
        Investment of ₹23,000 is processed
        Scheme name UTI Arbitrage Fund Direct-Growth
        Amount ₹23,000
        Units 607.3350
        Price(NAV) ₹37.87
        Folio No. 509382960481
        Date of Investment Oct. 5th, 2025
        Order Number 101-0240169-0028619
        EOP Code CAT-1-EOP-0002
      `,
    });

    expect(parsed).toMatchObject({
      schemeName: 'UTI Arbitrage Fund Direct-Growth',
      amount: 23000,
      kind: 'lumpsum',
    });
  });

  it.each([
    ['Edelweiss Mid Cap Direct Plan-Growth', '₹18,000', '147.0550', '₹122.40', '91026243894', '101-0220461-0083506', 18000],
    ['Invesco India Small Cap Fund Direct-Growth', '₹15,000', '287.0120', '₹52.26', '31053109112', '101-0220461-0083306', 15000],
    ['Quant Flexi Cap Fund Direct-Growth', '₹12,000', '102.3370', '₹117.25', '5102963484', '101-0220461-0083461', 12000],
    ['DSP Nifty 50 Equal Weight Index Fund Direct-Growth', '₹15,000', '583.2200', '₹25.72', '11520806/40', '101-0220461-0083365', 15000],
  ])('parses the October SIP confirmation for %s', (
    schemeName,
    amount,
    units,
    nav,
    folio,
    orderNumber,
    expectedAmount,
  ) => {
    const parsed = parseEtMoneyInvestmentEmail({
      from: 'ET Money <help@etmoneycare.com>',
      subject: 'Your savings just went up',
      body: `
        SIP of ${amount} added to your savings
        Your monthly SIP amount has been invested.
        Scheme name ${schemeName}
        Amount ${amount}
        Units ${units}
        Price(NAV) ${nav}
        Folio No. ${folio}
        Date of Investment Oct. 1st, 2026
        Order Number ${orderNumber}
        EOP Code EOP-0002
      `,
    });

    expect(parsed).toMatchObject({
      schemeName,
      amount: expectedAmount,
      investmentDate: '2026-10-01',
      orderNumber,
      kind: 'sip',
    });
  });

  it('rejects non-ET Money and unrelated mail', () => {
    expect(parseEtMoneyInvestmentEmail({ from: 'Bank <alerts@example.com>', subject: '', body: '' })).toBeNull();
    expect(parseEtMoneyInvestmentEmail({ from: 'ET Money <help@etmoneycare.com>', subject: 'Statement', body: 'Statement ready' })).toBeNull();
  });
});

describe('buildMfMonthQuery', () => {
  it('uses the later of month start and last sync', () => {
    const query = buildMfMonthQuery(2026, 9, new Date('2026-09-06T08:00:00+05:30'));
    expect(query).toContain('from:etmoneycare.com');
    expect(query).toContain(`after:${Math.floor(new Date('2026-09-05T08:00:00+05:30').getTime() / 1000)}`);
    expect(query).toContain(`before:${Math.floor(new Date(2026, 9, 1).getTime() / 1000)}`);
  });
});