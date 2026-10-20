import { searchSchemes } from '../core/amfi';
import {
  type MfEmailCandidate,
  type MfSchemeResolution,
  mergeMfEmailCandidates,
  normalizeMfSchemeName,
  reconcileMfSipActivity,
  selectMfSchemeMatch,
} from '../core/mfEmailImport';
import { buildMfMonthQuery, parseEtMoneyInvestmentEmail } from '../core/mfEmailParse';
import {
  getMfGmailSettings,
  isMfEmailHandled,
  markMfEmailsHandled,
  setMfGmailSettings,
  MF_EMAIL_IMPORT_START,
  MF_EMAIL_PARSER_REVISION,
} from '../core/mfGmailSettings';
import { getGmailSettings } from '../core/gmailSettings';
import { captureDailySnapshot } from '../core/planSnapshot';
import { PlannerRepository } from './plannerRepository';
import { GmailRepository } from './gmailRepository';

export interface MfImportResult {
  imported: number;
  duplicates: number;
  removedGenerated: number;
  createdFunds: number;
}

export type MfSyncPhase = 'idle' | 'syncing' | 'done' | 'error';
export interface MfSyncState {
  phase: MfSyncPhase;
  message: string;
  result?: MfImportResult;
}

let syncState: MfSyncState = { phase: 'idle', message: '' };
let syncPromise: Promise<MfImportResult> | null = null;
const listeners = new Set<(state: MfSyncState) => void>();

function emit(next: MfSyncState): void {
  syncState = next;
  listeners.forEach((listener) => listener(next));
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function monthOf(date: string): string {
  return date.slice(0, 7);
}

async function resolveScheme(emailSchemeName: string): Promise<MfSchemeResolution> {
  const matches = await searchSchemes(normalizeMfSchemeName(emailSchemeName));
  const best = selectMfSchemeMatch(emailSchemeName, matches);
  if (!best) {
    throw new Error(`No confident AMFI match found for ${emailSchemeName}.`);
  }
  return { emailSchemeName, schemeCode: best.schemeCode, schemeName: best.schemeName };
}

function summary(result: MfImportResult): string {
  if (!result.imported && !result.removedGenerated) return 'No new mutual fund investments found.';
  const parts = [`Imported ${result.imported} investment${result.imported === 1 ? '' : 's'}`];
  if (result.createdFunds) parts.push(`created ${result.createdFunds} fund${result.createdFunds === 1 ? '' : 's'}`);
  if (result.removedGenerated) parts.push(`replaced ${result.removedGenerated} generated entr${result.removedGenerated === 1 ? 'y' : 'ies'}`);
  return parts.join(' · ');
}

async function runMonthSync(year: number, month: number, interactive: boolean): Promise<MfImportResult> {
  const key = monthKey(year, month);
  if (key < MF_EMAIL_IMPORT_START.slice(0, 7)) throw new Error('MF email import starts from September 2026.');
  emit({ phase: 'syncing', message: `Reading ${new Date(year, month - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} emails…` });
  try {
    if (!GmailRepository.isConnected()) await GmailRepository.connect(interactive);
    const settings = getMfGmailSettings();
    const parserChanged = settings.parserRevision !== MF_EMAIL_PARSER_REVISION;
    const checkpoint = parserChanged ? undefined : settings.monthCheckpoints[key];
    const emails = await GmailRepository.fetchRawEmails(
      buildMfMonthQuery(year, month, checkpoint ? new Date(checkpoint) : undefined),
      parserChanged ? () => false : isMfEmailHandled,
    );
    const candidates: MfEmailCandidate[] = emails.flatMap((email) => {
      const parsed = parseEtMoneyInvestmentEmail(email);
      return parsed && monthOf(parsed.investmentDate) === key
        ? [{ messageId: email.id as string, parsed }]
        : [];
    });

    const plan = await PlannerRepository.load();
    const existingNames = new Set((plan.mutualFunds ?? []).map((fund) => normalizeMfSchemeName(fund.name)));
    const resolutions: MfSchemeResolution[] = [];
    for (const candidate of candidates) {
      const normalized = normalizeMfSchemeName(candidate.parsed.schemeName);
      if (existingNames.has(normalized) || resolutions.some((item) => normalizeMfSchemeName(item.emailSchemeName) === normalized)) continue;
      resolutions.push(await resolveScheme(candidate.parsed.schemeName));
    }

    const result = mergeMfEmailCandidates((plan.mutualFunds ??= []), candidates, resolutions);
    reconcileMfSipActivity(plan.mutualFunds, year, month);
    if (result.imported > 0 || result.removedGenerated > 0) captureDailySnapshot(plan);
    await PlannerRepository.save(plan);
    markMfEmailsHandled(candidates.map((candidate) => candidate.messageId));
    const completedAt = new Date().toISOString();
    setMfGmailSettings({
      monthCheckpoints: { ...settings.monthCheckpoints, [key]: completedAt },
      lastSyncAt: completedAt,
      lastImported: result.imported,
      lastCreatedFunds: result.createdFunds,
      parserRevision: MF_EMAIL_PARSER_REVISION,
    });
    emit({ phase: 'done', message: summary(result), result });
    return result;
  } catch (error) {
    emit({ phase: 'error', message: error instanceof Error ? error.message : 'MF email import failed.' });
    throw error;
  }
}

export function syncMonth(year: number, month: number, interactive = true): Promise<MfImportResult> {
  if (syncPromise) return syncPromise;
  syncPromise = runMonthSync(year, month, interactive).finally(() => {
    syncPromise = null;
  });
  return syncPromise;
}

export async function autoSync(): Promise<MfImportResult> {
  const zero: MfImportResult = { imported: 0, duplicates: 0, removedGenerated: 0, createdFunds: 0 };
  if (!getGmailSettings().clientId) return zero;
  const today = new Date();
  if (monthKey(today.getFullYear(), today.getMonth() + 1) < MF_EMAIL_IMPORT_START.slice(0, 7)) return zero;
  try {
    return await syncMonth(today.getFullYear(), today.getMonth() + 1, false);
  } catch {
    return zero;
  }
}

export const MfGmailRepository = {
  syncMonth,
  autoSync,
  getSyncState: () => syncState,
  subscribeSync(listener: (state: MfSyncState) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};