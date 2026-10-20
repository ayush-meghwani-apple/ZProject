import { describe, expect, it } from 'vitest';
import type { MutualFundHolding } from '../types/models';
import {
  mergeMfEmailCandidates,
  reconcileMfSipActivity,
  selectMfSchemeMatch,
} from './mfEmailImport';

function fund(): MutualFundHolding {
  return {
    id: 'fund-1',
    schemeCode: 123,
    name: 'Quant Mid Cap Fund Direct Plan Growth',
    category: 'midcap',
    transactions: [
      { id: 'old', date: '2026-08-01T00:00:00.000Z', amount: 5100, units: 21, nav: 242, kind: 'sip', auto: true },
      { id: 'generated', date: new Date(2026, 8, 1).toISOString(), amount: 5100, units: 0, nav: 0, kind: 'sip', auto: true, processing: true },
      { id: 'manual', date: '2026-09-02T00:00:00.000Z', amount: 1000, units: 4, nav: 250, kind: 'lumpsum' },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const candidate = {
  messageId: 'gmail-1',
  parsed: {
    schemeName: 'Quant Mid Cap Fund Direct-Growth',
    amount: 5100,
    units: 20.485,
    nav: 248.95,
    folio: '5102963484',
    investmentDate: '2026-09-01',
    orderNumber: '101-0100455-0060687',
    kind: 'sip' as const,
  },
};

describe('mergeMfEmailCandidates', () => {
  it('replaces generated September SIPs while preserving older and manual entries', () => {
    const funds = [fund()];
    const result = mergeMfEmailCandidates(funds, [candidate], []);

    expect(result).toEqual({ imported: 1, duplicates: 0, removedGenerated: 1, createdFunds: 0 });
    expect(funds[0].transactions.map((transaction) => transaction.id)).toContain('old');
    expect(funds[0].transactions.map((transaction) => transaction.id)).toContain('manual');
    expect(funds[0].transactions.find((transaction) => transaction.sourceId)?.importSource).toBe('etmoney');
  });

  it('deduplicates by ET Money order number', () => {
    const funds = [fund()];
    mergeMfEmailCandidates(funds, [candidate], []);
    const result = mergeMfEmailCandidates(funds, [candidate], []);
    expect(result.imported).toBe(0);
    expect(result.duplicates).toBe(1);
  });

  it('removes a stale generated SIP when its Gmail confirmation was already imported', () => {
    const funds = [fund()];
    mergeMfEmailCandidates(funds, [candidate], []);
    funds[0].transactions.push({
      id: 'stale-generated',
      date: new Date(2026, 8, 1).toISOString(),
      amount: 5100,
      units: 0,
      nav: 0,
      kind: 'sip',
      auto: true,
      processing: true,
    });

    const result = mergeMfEmailCandidates(funds, [], []);

    expect(result).toMatchObject({ imported: 0, duplicates: 0, removedGenerated: 1 });
    expect(funds[0].transactions.some((transaction) => transaction.id === 'stale-generated')).toBe(false);
  });

  it('does not remove generated entries unless that fund-month has a confirmation', () => {
    const funds = [fund()];
    const result = mergeMfEmailCandidates(funds, [], []);
    expect(result.removedGenerated).toBe(0);
    expect(funds[0].transactions.some((transaction) => transaction.id === 'generated')).toBe(true);
  });

  it('auto-creates a missing AMFI fund and infers its category', () => {
    const funds: MutualFundHolding[] = [];
    const result = mergeMfEmailCandidates(funds, [candidate], [{
      emailSchemeName: candidate.parsed.schemeName,
      schemeCode: 999,
      schemeName: 'Quant Mid Cap Fund - Direct Plan - Growth',
    }]);
    expect(result.createdFunds).toBe(1);
    expect(funds[0]).toMatchObject({
      schemeCode: 999,
      category: 'midcap',
      sip: { amount: 5100, dayOfMonth: 1, active: true },
    });
  });

  it('imports a one-time investment without activating a SIP', () => {
    const funds = [fund()];
    funds[0].sip = undefined;
    const result = mergeMfEmailCandidates(funds, [{
      ...candidate,
      messageId: 'gmail-lumpsum',
      parsed: {
        ...candidate.parsed,
        kind: 'lumpsum',
        orderNumber: 'lumpsum-order',
      },
    }], []);

    expect(result.imported).toBe(1);
    expect(funds[0].transactions[funds[0].transactions.length - 1]?.kind).toBe('lumpsum');
    expect(funds[0].sip).toBeUndefined();
  });
});

describe('reconcileMfSipActivity', () => {
  it('keeps confirmed SIPs active and updates their amount and day', () => {
    const funds = [fund()];
    funds[0].sip = { amount: 1000, dayOfMonth: 5, startDate: '2026-01-05T00:00:00.000Z', active: true };
    funds[0].transactions.push({
      id: 'confirmed',
      date: new Date(2026, 8, 12).toISOString(),
      amount: 7500,
      units: 30,
      nav: 250,
      kind: 'sip',
      importSource: 'etmoney',
      sourceId: 'etmoney:new-order',
    });

    reconcileMfSipActivity(funds, 2026, 9, new Date(2026, 8, 27));

    expect(funds[0].sip).toMatchObject({ amount: 7500, dayOfMonth: 12, active: true });
  });

  it('pauses a previously active SIP after its expected day passes without confirmation', () => {
    const funds = [fund()];
    funds[0].sip = { amount: 5100, dayOfMonth: 5, startDate: '2026-01-05T00:00:00.000Z', active: true };

    reconcileMfSipActivity(funds, 2026, 9, new Date(2026, 8, 27));

    expect(funds[0].sip.active).toBe(false);
  });

  it('does not pause a SIP before its expected day', () => {
    const funds = [fund()];
    funds[0].sip = { amount: 5100, dayOfMonth: 20, startDate: '2026-01-20T00:00:00.000Z', active: true };

    reconcileMfSipActivity(funds, 2026, 9, new Date(2026, 8, 10));

    expect(funds[0].sip.active).toBe(true);
  });

  it('keeps only the four October-confirmed SIPs active without removing old funds', () => {
    const oldFund = fund();
    oldFund.sip = { amount: 5100, dayOfMonth: 1, startDate: '2026-01-01T00:00:00.000Z', active: true };
    const edelweiss: MutualFundHolding = {
      ...fund(),
      id: 'edelweiss',
      schemeCode: 140228,
      name: 'Edelweiss Mid Cap Fund',
      transactions: [],
      sip: { amount: 6000, dayOfMonth: 1, startDate: '2024-10-01T00:00:00.000Z', active: true },
    };
    const funds = [oldFund, edelweiss];
    const octoberSips = [
      ['Edelweiss Mid Cap Direct Plan-Growth', 18000, 147.055, 122.4, '101-0220461-0083506'],
      ['Invesco India Small Cap Fund Direct-Growth', 15000, 287.012, 52.26, '101-0220461-0083306'],
      ['Quant Flexi Cap Fund Direct-Growth', 12000, 102.337, 117.25, '101-0220461-0083461'],
      ['DSP Nifty 50 Equal Weight Index Fund Direct-Growth', 15000, 583.22, 25.72, '101-0220461-0083365'],
    ] as const;
    const resolutions = [
      { emailSchemeName: octoberSips[1][0], schemeCode: 145137, schemeName: 'Invesco India Small Cap Fund - Direct Plan - Growth' },
      { emailSchemeName: octoberSips[2][0], schemeCode: 120843, schemeName: 'Quant Flexi Cap Fund - Direct Plan - Growth Option' },
      { emailSchemeName: octoberSips[3][0], schemeCode: 141877, schemeName: 'DSP Nifty 50 Equal Weight Index Fund - Direct Plan - Growth' },
    ];

    mergeMfEmailCandidates(
      funds,
      octoberSips.map(([schemeName, amount, units, nav, orderNumber], index) => ({
        messageId: `october-${index}`,
        parsed: {
          schemeName,
          amount,
          units,
          nav,
          folio: `folio-${index}`,
          investmentDate: '2026-10-01',
          orderNumber,
          kind: 'sip',
        },
      })),
      resolutions,
    );
    reconcileMfSipActivity(funds, 2026, 10, new Date(2026, 9, 21));

    expect(funds).toHaveLength(5);
    expect(funds.find((item) => item.id === oldFund.id)?.transactions).toHaveLength(3);
    expect(funds.filter((item) => item.sip?.active).map((item) => [item.name, item.sip?.amount])).toEqual([
      ['Edelweiss Mid Cap Fund', 18000],
      ['Invesco India Small Cap Fund - Direct Plan - Growth', 15000],
      ['Quant Flexi Cap Fund - Direct Plan - Growth Option', 12000],
      ['DSP Nifty 50 Equal Weight Index Fund - Direct Plan - Growth', 15000],
    ]);
  });
});

describe('selectMfSchemeMatch', () => {
  it.each([
    [
      'Invesco India Small Cap Fund Direct-Growth',
      145137,
      [
        { schemeCode: 145137, schemeName: 'Invesco India Small Cap Fund - Direct Plan - Growth' },
        { schemeCode: 145138, schemeName: 'Invesco India Small Cap Fund - Direct Plan - IDCW' },
        { schemeCode: 145139, schemeName: 'Invesco India Small Cap Fund - Regular Plan - Growth' },
      ],
    ],
    [
      'Quant Flexi Cap Fund Direct-Growth',
      120843,
      [
        { schemeCode: 109830, schemeName: 'Quant Flexi Cap Fund - Regular Plan - Growth Option' },
        { schemeCode: 120842, schemeName: 'Quant Flexi Cap Fund - Direct Plan - IDCW Option' },
        { schemeCode: 120843, schemeName: 'Quant Flexi Cap Fund - Direct Plan - Growth Option' },
      ],
    ],
    [
      'DSP Nifty 50 Equal Weight Index Fund Direct-Growth',
      141877,
      [
        { schemeCode: 141875, schemeName: 'DSP Nifty 50 Equal Weight Index Fund - Regular Plan - Growth' },
        { schemeCode: 141877, schemeName: 'DSP Nifty 50 Equal Weight Index Fund - Direct Plan - Growth' },
      ],
    ],
  ])('selects the Direct Growth AMFI variant for %s', (emailName, expectedCode, matches) => {
    expect(selectMfSchemeMatch(emailName, matches)?.schemeCode).toBe(expectedCode);
  });
});