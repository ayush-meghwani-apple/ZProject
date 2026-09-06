import type { MFCategory, MutualFundHolding } from '../types/models';
import { dateInputToIso, newId, now } from './util';
import { MF_EMAIL_IMPORT_START } from './mfGmailSettings';
import type { ParsedMfSipEmail } from './mfEmailParse';

export interface MfEmailCandidate {
  messageId: string;
  parsed: ParsedMfSipEmail;
}

export interface MfSchemeResolution {
  emailSchemeName: string;
  schemeCode: number;
  schemeName: string;
}

export interface MfEmailMergeResult {
  imported: number;
  duplicates: number;
  removedGenerated: number;
  createdFunds: number;
}

export function normalizeMfSchemeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(?:direct|regular|plan|growth|option)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function inferMfCategory(name: string): MFCategory {
  const value = name.toLowerCase();
  if (/\bmid\s*cap\b/.test(value)) return 'midcap';
  if (/\bsmall\s*cap\b/.test(value)) return 'smallcap';
  if (/\blarge\s*cap\b/.test(value)) return 'largecap';
  if (/\b(flexi|multi)\s*cap\b/.test(value)) return 'flexicap';
  if (/\b(hybrid|balanced|arbitrage)\b/.test(value)) return 'hybrid';
  if (/\b(debt|liquid|gilt|bond|money market|overnight)\b/.test(value)) return 'debt';
  return 'other';
}

function localIso(date: string): string {
  return dateInputToIso(date);
}

function localMonth(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function mergeMfEmailCandidates(
  funds: MutualFundHolding[],
  candidates: MfEmailCandidate[],
  resolutions: MfSchemeResolution[],
): MfEmailMergeResult {
  let removedGenerated = 0;
  for (const fund of funds) {
    const confirmedMonths = new Set(
      fund.transactions
        .filter((transaction) => transaction.importSource === 'etmoney' && !!transaction.sourceId)
        .map((transaction) => localMonth(transaction.date))
        .filter((month) => month >= MF_EMAIL_IMPORT_START.slice(0, 7)),
    );
    fund.transactions = fund.transactions.filter((transaction) => {
      const replace =
        transaction.kind === 'sip' &&
        transaction.auto === true &&
        !transaction.sourceId &&
        confirmedMonths.has(localMonth(transaction.date));
      if (replace) removedGenerated++;
      return !replace;
    });
  }
  const resolutionMap = new Map(resolutions.map((item) => [normalizeMfSchemeName(item.emailSchemeName), item]));
  const knownSources = new Set(
    funds.flatMap((fund) => fund.transactions.map((transaction) => transaction.sourceId).filter(Boolean)),
  );
  let imported = 0;
  let duplicates = 0;
  let createdFunds = 0;

  for (const candidate of candidates) {
    const sourceId = `etmoney:${candidate.parsed.orderNumber}`;
    if (knownSources.has(sourceId)) {
      duplicates++;
      continue;
    }

    const normalized = normalizeMfSchemeName(candidate.parsed.schemeName);
    let fund = funds.find((item) => normalizeMfSchemeName(item.name) === normalized);
    if (!fund) {
      const resolution = resolutionMap.get(normalized);
      if (!resolution) throw new Error(`No AMFI match found for ${candidate.parsed.schemeName}.`);
      fund = {
        id: newId(),
        schemeCode: resolution.schemeCode,
        name: resolution.schemeName,
        category: inferMfCategory(candidate.parsed.schemeName),
        transactions: [],
        latestNav: candidate.parsed.nav,
        latestNavDate: localIso(candidate.parsed.investmentDate),
        createdAt: now(),
        updatedAt: now(),
      };
      funds.push(fund);
      createdFunds++;
    }

    const investmentMonth = candidate.parsed.investmentDate.slice(0, 7);
    if (candidate.parsed.investmentDate >= MF_EMAIL_IMPORT_START) {
      fund.transactions = fund.transactions.filter((transaction) => {
        const replace =
          transaction.kind === 'sip' &&
          transaction.auto === true &&
          !transaction.sourceId &&
          localMonth(transaction.date) === investmentMonth;
        if (replace) removedGenerated++;
        return !replace;
      });
    }

    fund.transactions.push({
      id: newId(),
      date: localIso(candidate.parsed.investmentDate),
      amount: candidate.parsed.amount,
      units: candidate.parsed.units,
      nav: candidate.parsed.nav,
      kind: 'sip',
      auto: true,
      reviewed: false,
      importSource: 'etmoney',
      sourceId,
    });
    fund.updatedAt = now();
    knownSources.add(sourceId);
    imported++;
  }

  return { imported, duplicates, removedGenerated, createdFunds };
}