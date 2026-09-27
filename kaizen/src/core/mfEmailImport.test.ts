import { describe, expect, it } from 'vitest';
import type { MutualFundHolding } from '../types/models';
import { mergeMfEmailCandidates, reconcileMfSipActivity } from './mfEmailImport';

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
});