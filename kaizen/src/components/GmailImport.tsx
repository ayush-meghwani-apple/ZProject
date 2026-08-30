import { useEffect, useState } from 'react';
import { GmailRepository, type SyncState } from '../repository/gmailRepository';
import { getGmailSettings, setGmailSettings, clearImportMemory } from '../core/gmailSettings';
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

  const last = getGmailSettings();

  // Reflect background/foreground syncs (incl. the silent one on app open).
  useEffect(() => GmailRepository.subscribeSync(setSync), []);

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
    setHasClientId(!!id);
  }

  async function runSync() {
    const window = Math.max(1, Math.floor(days) || 1);
    setGmailSettings({ syncDays: window });
    try {
      if (!GmailRepository.isConnected()) await GmailRepository.connect(true);
      setConnected(true);
      await GmailRepository.syncAndImport(window, { interactive: true });
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

  // Runs the exact code path used automatically when the app opens (silent, no
  // popup) — so the auto-import behaviour can be verified on demand.
  async function testAutoSync() {
    await GmailRepository.autoSync();
    onChange();
  }

  return (
    <CollapsibleCard
      title="Auto-import from Gmail"
      subtitle="Bank & card emails → expenses"
      icon="add"
    >
      <p className="muted" style={{ marginTop: 0 }}>
        Reads bank &amp; card alert emails (HSBC, ICICI, SBI Card, SBI &amp; IDFC a/c) and adds the
        spends straight into your expenses — review them in the <strong>Reels</strong> tab.
        Salary credits start a new cycle. Read-only; nothing leaves your device.
      </p>

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
              {connected ? 'Connected' : 'Not connected'}
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
                disabled={syncing}
                style={done ? { background: '#10b981', borderColor: '#10b981' } : undefined}
              >
                {syncing ? 'Syncing…' : done ? '✓ Synced' : 'Sync now'}
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
            Reset auto-imported (test)
          </button>

          <button
            className="btn btn--sm btn--ghost"
            style={{ marginTop: 6, marginLeft: 8 }}
            onClick={testAutoSync}
            disabled={syncing}
            title="Runs the same silent import that happens automatically when the app opens"
          >
            Test auto-sync (as if app opened)
          </button>
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
      {sync.phase === 'idle' && last.lastSyncAt && (
        <p className="muted" style={{ marginBottom: 0 }}>
          Last sync imported {last.lastImported}, skipped {last.lastSkipped}
          {last.lastSalary ? `, ${last.lastSalary} salary` : ''}.
        </p>
      )}
    </CollapsibleCard>
  );
}
