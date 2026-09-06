import { describe, expect, it } from 'vitest';
import { readFreshCache, selectCategoryPeers, type PeerScheme } from './mfPeerRepository';

const scheme = (over: Partial<PeerScheme>): PeerScheme => ({
  schemeCode: 1,
  schemeName: 'Alpha Fund - Direct Plan - Growth',
  fundHouse: 'Alpha AMC',
  schemeCategory: 'Equity Scheme - Large Cap Fund',
  ...over,
});

describe('selectCategoryPeers', () => {
  it('keeps exact-category Direct Growth funds and excludes held schemes', () => {
    const peers = selectCategoryPeers([
      scheme({ schemeCode: 1 }),
      scheme({ schemeCode: 2, schemeName: 'Alpha Fund - Regular Plan - Growth' }),
      scheme({ schemeCode: 3, schemeName: 'Beta Fund - Direct Plan - IDCW', fundHouse: 'Beta AMC' }),
      scheme({ schemeCode: 4, schemeName: 'Gamma Fund - Direct Growth', fundHouse: 'Gamma AMC' }),
      scheme({ schemeCode: 5, schemeName: 'Debt Fund - Direct Growth', schemeCategory: 'Debt Scheme - Liquid Fund' }),
    ], 'Equity Scheme - Large Cap Fund', [1]);
    expect(peers.map((peer) => peer.schemeCode)).toEqual([4]);
  });

  it('prefers one fund per fund house and removes duplicate plan names', () => {
    const peers = selectCategoryPeers([
      scheme({ schemeCode: 1 }),
      scheme({ schemeCode: 2, schemeName: 'Alpha Fund Direct Growth' }),
      scheme({ schemeCode: 3, schemeName: 'Alpha Two Fund Direct Growth' }),
      scheme({ schemeCode: 4, schemeName: 'Beta Fund Direct Growth', fundHouse: 'Beta AMC' }),
    ], 'Equity Scheme - Large Cap Fund', [], 3);
    expect(peers.map((peer) => peer.schemeCode)).toEqual([1, 4, 3]);
  });
});

describe('readFreshCache', () => {
  it('accepts fresh values and rejects expired or malformed entries', () => {
    const now = 2_000_000_000;
    expect(readFreshCache<string>(JSON.stringify({ at: now - 1000, value: 'ok' }), now)).toBe('ok');
    expect(readFreshCache<string>(JSON.stringify({ at: now - 25 * 60 * 60 * 1000, value: 'old' }), now)).toBeNull();
    expect(readFreshCache<string>('not json', now)).toBeNull();
  });
});