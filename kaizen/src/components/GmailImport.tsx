import { useEffect, useState } from 'react';
import { GmailRepository, type SyncState } from '../repository/gmailRepository';
import {
  getGmailSettings,
  setGmailSettings,
  clearImportMemory,
  clearImportedMemory,
} from '../core/gmailSettings';
import { ExpenseRepository } from '../repository/expenseRepository';
import { SalaryCycleRepository } from '../repository/salaryCycleRepository';
import CollapsibleCard from './CollapsibleCard';

interface Props {
  /** Bump the parent so Reels and Summary reload after an import. */
  onChange: () => void;
}

export default function GmailImport({ onChange }: Props) {
  const [clientId, setClientId] = useState(getGmailSettings().clientId);
  const [hasClientId, setHasClientId] = useState(!!getGmailSettings().clientId);
  const [connected, setConnected] = useState(GmailRepository.isConnected());
  const [days, setDays] = useState(getGmailSettings().syncDays);
  const [sync, setSync] = useState<SyncState>(GmailRepository.getSyncState());
  const [diag, setDiag] = useState<string[]>([]);
  const [diagnosing, setDiagnosing] = useState(false);
  const [authReady, setAuthReady] = useState(GmailRepository.isAuthorizationReady());
  const [authLoadError, setAuthLoadError] = useState('');

  const last = getGmailSettings();
  const lastSyncLabel = last.lastSyncAt
    ? new Date(last.lastSyncAt).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Never synced';

  // Reflect background/foreground syncs (incl. the silent one on app open).
  useEffect(
    () =>
      GmailRepository.subscribeSync((next) => {
        setSync(next);
        setConnected(GmailRepository.isConnected());
      }),
    [],
  );

  useEffect(() => {
    if (!hasClientId) return;
    setAuthLoadError('');
    GmailRepository.prepareAuthorization().then(
      () => setAuthReady(true),
      (error) => setAuthLoadError(error instanceof Error ? error.message : 'Google sign-in failed to load.'),
    );
  }, [hasClientId]);

  // After a "done" pill has shown for a moment, fade the button back to normal.
  useEffect(() => {
    if (sync.phase !== 'done') return;
    const t = setTimeout(
      () => setSync((s) => (s.phase === 'done' ? { phase: 'idle', message: '' } : s)),
      3500,
    );
    return () => clearTimeout(t);
  }, [sync.phase, sync.message]);

  const syncing = sync.phase === 'syncing';
  const done = sync.phase === 'done';

  function saveClientId() {
    const id = clientId.trim();
    setGmailSettings({ clientId: id });
    setClientId(id);
    setAuthReady(GmailRepository.isAuthorizationReady());
    setHasClientId(!!id);
  }

  async function runSync() {
    const window = Math.max(1, Math.floor(days) || 1);
    setGmailSettings({ syncDays: window });
    try {
      await GmailRepository.syncAndImport(window, { interactive: true });
      setConnected(GmailRepository.isConnected());
      onChange();
    } catch {
      /* error surfaced via sync state */
    }
  }

  async function resetForTest() {
    if (
      !confirm(
        'Remove ALL auto-imported expenses and salary cycles, and forget which emails were imported? ' +
          'Your manually-added expenses stay. Use this to re-test the import from scratch.',
      )
    )
      return;
    await ExpenseRepository.deleteAutoImported();
    await SalaryCycleRepository.clearAutoSalaryCycles();
    clearImportMemory();
    try {
      localStorage.removeItem('expense:salaryReelDismissed');
    } catch {
      /* ignore */
    }
    // Note: we intentionally do NOT sign out — keeping the Google grant lets the
    // silent on-open auto-sync re-import without a popup, so it can be tested.
    onChange();
  }

  async function restoreDeletedImports() {
    const window = Math.max(1, Math.floor(days) || 1);
    if (
      !confirm(
        `Re-scan imported emails from the last ${window} days? Existing expenses will not be duplicated, and dismissed emails stay hidden.`,
      )
    )
      return;
    clearImportedMemory();
    await runSync();
  }

  // Lists every email the sync fetches + how it's classified (fetch vs parse).
  async function runDiagnose() {
    setDiagnosing(true);
    setDiag(['Diagnosing…']);
    try {
      setDiag(await GmailRepository.diagnose(Math.max(1, Math.floor(days) || 7)));
    } catch (e) {
      setDiag([e instanceof Error ? e.message : 'Diagnose failed.']);
    } finally {
      setConnected(GmailRepository.isConnected());
      setDiagnosing(false);
    }
  }

  return (
    <CollapsibleCard
      title="Gmail auto-import"
      icon="add"
      compact
      subtitle={`Last sync: ${lastSyncLabel}`}
    >
      {!hasClientId && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <input
            className="input"
            style={{ flex: 1, minWidth: 200 }}
            placeholder="Google OAuth client id (…apps.googleusercontent.com)"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
          />
          <button className="btn btn--sm" onClick={saveClientId} disabled={!clientId.trim()}>
            Save
          </button>
        </div>
      )}

      {hasClientId && (
        <>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <span className={`pill ${connected ? 'pill--good' : ''}`}>
              {connected ? 'Connected' : 'Ready to renew'}
            </span>
            <span className="inline" style={{ gap: 8 }}>
              <label className="muted" style={{ fontSize: 13 }}>
                Last
                <input
                  className="input"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={365}
                  style={{ width: 56, margin: '0 6px' }}
                  value={days}
                  onChange={(e) => setDays(parseInt(e.target.value, 10) || 0)}
                />
                days
              </label>
              <button
                className="btn btn--sm"
                onClick={runSync}
                disabled={syncing || !authReady}
                style={done ? { background: '#10b981', borderColor: '#10b981' } : undefined}
              >
                {!authReady ? 'Loading Gmail…' : syncing ? 'Syncing…' : done ? '✓ Synced' : 'Sync now'}
              </button>
              <button
                className="btn btn--sm btn--ghost"
                onClick={() => {
                  GmailRepository.signOut();
                  setConnected(false);
                }}
              >
                Sign out
              </button>
            </span>
          </div>

          <button
            className="btn btn--sm btn--ghost"
            style={{ marginTop: 6 }}
            onClick={() => {
              setGmailSettings({ clientId: '' });
              setClientId('');
              setHasClientId(false);
            }}
          >
            Change client id
          </button>

          <button
            className="btn btn--sm btn--ghost"
            style={{ marginTop: 6, marginLeft: 8, color: 'var(--danger, #ef4444)' }}
            onClick={resetForTest}
          >
            Reset auto-imported
          </button>

          <button
            className="btn btn--sm btn--ghost"
            style={{ marginTop: 6, marginLeft: 8 }}
            onClick={() => void restoreDeletedImports()}
            disabled={syncing || !authReady}
          >
            Restore deleted imports
          </button>

          <button
            className="btn btn--sm btn--ghost"
            style={{ marginTop: 6, marginLeft: 8 }}
            onClick={() => void runDiagnose()}
            disabled={diagnosing || syncing || !authReady}
            title="List every email the sync fetches and how it's classified"
          >
            {diagnosing ? 'Diagnosing…' : 'Diagnose (list fetched)'}
          </button>

          {diag.length > 0 && (
            <pre
              style={{
                fontSize: 11,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 220,
                overflow: 'auto',
                marginTop: 8,
                marginBottom: 0,
                padding: 8,
                borderRadius: 8,
                background: 'rgba(0,0,0,0.25)',
              }}
            >
              {diag.join('\n')}
            </pre>
          )}
        </>
      )}

      {syncing && (
        <p className="muted" style={{ marginBottom: 0 }}>
          {sync.message || 'Syncing…'}
        </p>
      )}
      {done && (
        <p style={{ color: '#10b981', marginBottom: 0 }}>
          {sync.message}
          {sync.result && (sync.result.imported > 0 || sync.result.salary > 0)
            ? '. Review them in the Reels tab.'
            : ''}
        </p>
      )}
      {sync.phase === 'error' && (
        <p className="muted" style={{ color: 'var(--danger, #ef4444)', marginBottom: 0 }}>
          {sync.message}
        </p>
      )}
      {authLoadError && (
        <p className="muted" style={{ color: 'var(--danger, #ef4444)', marginBottom: 0 }}>
          {authLoadError}
        </p>
      )}
      {sync.phase === 'idle' && last.lastSyncAt && (
        <p className="muted" style={{ marginBottom: 0 }}>
          Last successful sync: {lastSyncLabel} · imported {last.lastImported}, skipped {last.lastSkipped}
          {last.lastSalary ? `, ${last.lastSalary} salary` : ''}.
        </p>
      )}
    </CollapsibleCard>
  );
}
