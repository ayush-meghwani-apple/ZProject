import type { MFCategory, MutualFundHolding } from '../types/models';
import { dateInputToIso, newId, now } from './util';
import { MF_EMAIL_IMPORT_START } from './mfGmailSettings';
import type { ParsedMfInvestmentEmail } from './mfEmailParse';

export interface MfEmailCandidate {
  messageId: string;
  parsed: ParsedMfInvestmentEmail;
}

export interface MfSchemeResolution {
  emailSchemeName: string;
  schemeCode: number;
  schemeName: string;
}

export interface MfSchemeMatch {
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

function schemeMatchScore(query: string, match: MfSchemeMatch): number {
  const wanted = new Set(normalizeMfSchemeName(query).split(' '));
  const actual = new Set(normalizeMfSchemeName(match.schemeName).split(' '));
  let shared = 0;
  wanted.forEach((token) => {
    if (actual.has(token)) shared++;
  });
  return wanted.size ? shared / wanted.size : 0;
}

function matchesEmailVariant(emailSchemeName: string, candidateName: string): boolean {
  const email = emailSchemeName.toLowerCase();
  const candidate = candidateName.toLowerCase();
  if (/\bdirect\b/.test(email) && /\bregular\b/.test(candidate)) return false;
  if (/\bregular\b/.test(email) && /\bdirect\b/.test(candidate)) return false;
  if (/\bgrowth\b/.test(email) && /\b(?:idcw|dividend)\b/.test(candidate)) return false;
  if (/\b(?:idcw|dividend)\b/.test(email) && /\bgrowth\b/.test(candidate)) return false;
  return true;
}

export function selectMfSchemeMatch(
  emailSchemeName: string,
  matches: MfSchemeMatch[],
): MfSchemeMatch | null {
  const compatible = matches.filter((match) => matchesEmailVariant(emailSchemeName, match.schemeName));
  const normalized = normalizeMfSchemeName(emailSchemeName);
  const exact = compatible.filter((match) => normalizeMfSchemeName(match.schemeName) === normalized);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  const ranked = compatible
    .map((match) => ({ match, score: schemeMatchScore(emailSchemeName, match) }))
    .sort((left, right) => right.score - left.score || left.match.schemeCode - right.match.schemeCode);
  const best = ranked[0];
  if (!best || best.score < 0.75 || ranked[1]?.score === best.score) return null;
  return best.match;
}

function findExistingFund(
  emailSchemeName: string,
  funds: MutualFundHolding[],
): MutualFundHolding | undefined {
  const emailTokens = new Set(normalizeMfSchemeName(emailSchemeName).split(' '));
  const candidates = funds.filter((fund) => {
    const fundTokens = new Set(normalizeMfSchemeName(fund.name).split(' '));
    const emailContainsFund = [...fundTokens].every((token) => emailTokens.has(token));
    const fundContainsEmail = [...emailTokens].every((token) => fundTokens.has(token));
    return emailContainsFund || fundContainsEmail;
  });
  return candidates.length === 1 ? candidates[0] : undefined;
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
        .filter((transaction) =>
          transaction.kind === 'sip'
          && transaction.importSource === 'etmoney'
          && !!transaction.sourceId)
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
    let fund = funds.find((item) => normalizeMfSchemeName(item.name) === normalized)
      ?? findExistingFund(candidate.parsed.schemeName, funds);
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
    if (candidate.parsed.kind === 'sip' && candidate.parsed.investmentDate >= MF_EMAIL_IMPORT_START) {
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

    const transactionDate = localIso(candidate.parsed.investmentDate);
    fund.transactions.push({
      id: newId(),
      date: transactionDate,
      amount: candidate.parsed.amount,
      units: candidate.parsed.units,
      nav: candidate.parsed.nav,
      kind: candidate.parsed.kind,
      auto: true,
      reviewed: false,
      importSource: 'etmoney',
      sourceId,
    });
    if (candidate.parsed.kind === 'sip') {
      fund.sip = {
        amount: candidate.parsed.amount,
        dayOfMonth: Math.min(28, Math.max(1, Number(candidate.parsed.investmentDate.slice(8, 10)))),
        startDate: fund.sip?.startDate ?? transactionDate,
        active: true,
      };
    }
    fund.updatedAt = now();
    knownSources.add(sourceId);
    imported++;
  }

  return { imported, duplicates, removedGenerated, createdFunds };
}

/** Reconcile current-month SIP status after importing all confirmations seen so far. */
export function reconcileMfSipActivity(
  funds: MutualFundHolding[],
  year: number,
  month: number,
  asOf = new Date(),
): void {
  if (asOf.getFullYear() !== year || asOf.getMonth() + 1 !== month) return;
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const today = asOf.getDate();

  for (const fund of funds) {
    const confirmed = fund.transactions
      .filter((transaction) =>
        transaction.kind === 'sip'
        && transaction.importSource === 'etmoney'
        && !!transaction.sourceId
        && localMonth(transaction.date) === monthKey)
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
    const latest = confirmed[0];
    if (latest) {
      const investmentDay = new Date(latest.date).getDate();
      fund.sip = {
        amount: latest.amount,
        dayOfMonth: Math.min(28, Math.max(1, investmentDay)),
        startDate: fund.sip?.startDate ?? latest.date,
        active: true,
      };
      continue;
    }
    if (fund.sip?.active && today >= fund.sip.dayOfMonth) fund.sip.active = false;
  }
}