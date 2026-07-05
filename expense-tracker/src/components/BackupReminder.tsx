import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { BackupRepository } from '../repository/backupRepository';
import { getPrefs } from '../core/preferences';
import { saveBackupFile, backupDue } from '../core/backupFile';
import AppIcon from './AppIcon';

interface Props {
  /** Called after a successful backup so the surrounding UI can refresh. */
  onBackedUp?: () => void;
}

/**
 * A gentle, automatic "back up your data" prompt. Because everything lives only
 * on this device, one accidental delete wipes it — so on app open, if it's been
 * longer than the configured interval (default: daily) since the last backup,
 * we pop this up. One tap saves a backup file (via the iOS share sheet →
 * "Save to Files", or a download elsewhere). "Not now" just waits for next open.
 */
export default function BackupReminder({ onBackedUp }: Props) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const intervalDays = getPrefs().backupReminderDays ?? 1;
      if (intervalDays <= 0) return; // reminders turned off
      if (!backupDue(intervalDays)) return;
      // Don't nag a brand-new / empty app — nothing to lose yet.
      if (!(await BackupRepository.hasAnyData())) return;
      if (cancelled) return;
      setDays(BackupRepository.daysSinceBackup());
      setShow(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;

  async function backupNow() {
    setBusy(true);
    try {
      const ok = await saveBackupFile();
      if (ok) {
        setShow(false);
        onBackedUp?.();
      }
    } catch {
      /* leave the prompt open so they can retry */
    } finally {
      setBusy(false);
    }
  }

  const lastLine =
    days === null
      ? "You haven't backed up yet."
      : days <= 0
        ? 'Last backup was earlier today.'
        : `Last backup was ${days} day${days === 1 ? '' : 's'} ago.`;

  return createPortal(
    <div className="modal__backdrop">
      <div className="modal__card backupremind" onClick={(e) => e.stopPropagation()}>
        <div className="backupremind__icon">
          <AppIcon name="backup" size={30} />
        </div>
        <h3>Back up your data?</h3>
        <p className="backupremind__body">
          Everything in Kaizen is stored only on this device. Save a quick backup so a
          reinstall or accidental delete can never wipe it.
        </p>
        <p className="backupremind__meta">{lastLine}</p>
        <p className="backupremind__hint">
          Tap <strong>Back up now</strong>, then choose <strong>Save to Files</strong> (iCloud
          Drive) so it's kept safely off this device.
        </p>
        <div className="modal__footer">
          <button className="btn btn--ghost" onClick={() => setShow(false)} disabled={busy}>
            Not now
          </button>
          <button className="btn" onClick={backupNow} disabled={busy}>
            <AppIcon name="backup" size={16} /> {busy ? 'Saving…' : 'Back up now'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
