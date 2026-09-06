import { useEffect, useState } from 'react';
import { getGmailSettings } from '../../core/gmailSettings';
import { getMfGmailSettings } from '../../core/mfGmailSettings';
import { GmailRepository } from '../../repository/gmailRepository';
import { MfGmailRepository, type MfSyncState } from '../../repository/mfGmailRepository';
import CollapsibleCard from '../CollapsibleCard';

function currentMonth(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

export default function MfGmailImport({
  beforeImport,
  onChange,
}: {
  beforeImport: () => Promise<void>;
  onChange: () => Promise<void>;
}) {
  const [month, setMonth] = useState(currentMonth);
  const [sync, setSync] = useState<MfSyncState>(MfGmailRepository.getSyncState());
  const hasGmail = !!getGmailSettings().clientId;
  const saved = getMfGmailSettings();

  useEffect(() => MfGmailRepository.subscribeSync(setSync), []);

  async function importMonth(): Promise<void> {
    const [year, monthNumber] = month.split('-').map(Number);
    try {
      // Start Google auth synchronously from the tap. Awaiting the plan flush
      // first can lose the browser's permission to open the OAuth window.
      const connection = GmailRepository.isConnected()
        ? Promise.resolve()
        : GmailRepository.connect(true);
      await Promise.all([beforeImport(), connection]);
      await MfGmailRepository.syncMonth(year, monthNumber, true);
      await onChange();
    } catch {
      /* repository state displays the error */
    }
  }

  const lastSync = saved.lastSyncAt
    ? new Date(saved.lastSyncAt).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Never synced';
  const subtitle = sync.phase === 'syncing'
    ? sync.message
    : sync.phase === 'error'
      ? sync.message
      : `Automatic · ${lastSync}`;

  return (
    <CollapsibleCard title="Email import" subtitle={subtitle} icon="email" compact>
      <div className="ft-mfmail__controls">
        <input
          className="input"
          type="month"
          min="2026-09"
          max={currentMonth()}
          value={month}
          onChange={(event) => setMonth(event.target.value)}
        />
        <button className="btn btn--sm" disabled={!hasGmail || sync.phase === 'syncing'} onClick={() => void importMonth()}>
          {sync.phase === 'syncing' ? 'Importing…' : sync.phase === 'error' ? 'Reconnect & import' : 'Import month'}
        </button>
      </div>
      {!hasGmail && <p className="ft-mfmail__note">Add Gmail once in Expensify Settings.</p>}
      {sync.message && (
        <p className={`ft-mfmail__note ${sync.phase === 'error' ? 'ft-mfmail__note--error' : ''}`}>
          {sync.message}
        </p>
      )}
    </CollapsibleCard>
  );
}