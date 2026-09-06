import { useEffect, useState } from 'react';
import { getGmailSettings } from '../../core/gmailSettings';
import { getMfGmailSettings } from '../../core/mfGmailSettings';
import { MfGmailRepository, type MfSyncState } from '../../repository/mfGmailRepository';
import AppIcon from '../AppIcon';

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
      await beforeImport();
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

  return (
    <section className="card scard--compact ft-settings__card">
      <div className="scard__head">
        <span className="scard__icon"><AppIcon name="email" size={22} /></span>
        <span className="scard__headtext">
          <span className="scard__title">Mutual fund email import</span>
          <span className="ft-settings__sub">ET Money SIP confirmations · last sync {lastSync}</span>
        </span>
      </div>
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
          {sync.phase === 'syncing' ? 'Importing…' : 'Import month'}
        </button>
      </div>
      {!hasGmail && <p className="ft-mfmail__note">Set up Gmail in Expensify Settings first. Fortuna reuses that connection.</p>}
      {sync.message && (
        <p className={`ft-mfmail__note ${sync.phase === 'error' ? 'ft-mfmail__note--error' : ''}`}>
          {sync.message}
        </p>
      )}
    </section>
  );
}