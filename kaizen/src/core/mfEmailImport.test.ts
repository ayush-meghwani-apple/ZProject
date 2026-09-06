import { describe, expect, it } from 'vitest';
import type { MutualFundHolding } from '../types/models';
import { mergeMfEmailCandidates } from './mfEmailImport';

function fund(): MutualFundHolding {
  return {
    id: 'fund-1',
    schemeCode: 123,
    name: 'Quant Mid Cap Fund Direct Plan Growth',
    category: 'midcap',
    transactions: [
      { id: 'old', date: '2026-08-01T00:00:00.000Z', amount: 5100, units: 21, nav: 242, kind: 'sip', auto: true },
      { id: 'generated', date: '2026-09-01T00:00:00.000Z', amount: 5100, units: 0, nav: 0, kind: 'sip', auto: true, processing: true },
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
    expect(funds[0]).toMatchObject({ schemeCode: 999, category: 'midcap' });
  });
});