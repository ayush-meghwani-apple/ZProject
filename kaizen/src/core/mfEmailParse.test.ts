import { describe, expect, it } from 'vitest';
import { buildMfMonthQuery, parseEtMoneySipEmail } from './mfEmailParse';

describe('parseEtMoneySipEmail', () => {
  it('parses an ET Money SIP confirmation', () => {
    const parsed = parseEtMoneySipEmail({
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
    });
  });

  it('rejects non-ET Money and non-SIP mail', () => {
    expect(parseEtMoneySipEmail({ from: 'Bank <alerts@example.com>', subject: '', body: '' })).toBeNull();
    expect(parseEtMoneySipEmail({ from: 'ET Money <help@etmoneycare.com>', subject: 'Statement', body: 'Statement ready' })).toBeNull();
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