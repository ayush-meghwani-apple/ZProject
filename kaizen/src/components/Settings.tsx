import { useEffect, useRef, useState } from 'react';
import { getPrefs, setPrefs } from '../core/preferences';
import { playSound } from '../core/sound';
import { isDemoMode, enterDemo, exitDemo } from '../core/demoMode';
import RecurringManager from './RecurringManager';
import PaymentMethodsManager from './PaymentMethodsManager';
import GmailImport from './GmailImport';
import DataBackupCard from './DataBackupCard';

type UpdateStatus = 'idle' | 'checking' | 'current' | 'updated' | 'error';

const UPDATE_VERSION_KEY = 'kaizen:updateVersion';

interface Props {
  version: number;
  onChange: () => void;
  /** When true (shared Settings inside a sub-app), show only the cross-app
   * cards: Data & Backup and About. */
  global?: boolean;
  /** Avoid adding a second page wrapper when embedded in another settings tab. */
  embedded?: boolean;
  /** Reload the host after a backup merge/replace. */
  onReload?: () => void | Promise<void>;
  /** Flush host state before exporting a backup. */
  beforeExport?: () => Promise<void>;
}

/** Full date + time, e.g. "25 Jul 2026, 2:34 pm" — used for the build stamp. */
function fmtDayTime(d: Date): string {
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function updateStatusAfterReload(): UpdateStatus {
  try {
    const previousVersion = sessionStorage.getItem(UPDATE_VERSION_KEY);
    sessionStorage.removeItem(UPDATE_VERSION_KEY);
    if (!previousVersion) return 'idle';
    return previousVersion === __APP_VERSION__ ? 'current' : 'updated';
  } catch {
    return 'idle';
  }
}

/** Check for a new worker without reloading when this build is already current. */
async function checkForUpdates(onStatus: (status: UpdateStatus) => void): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    onStatus('current');
    return;
  }

  onStatus('checking');
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      onStatus('current');
      return;
    }

    let completed = false;
    const activate = (worker: ServiceWorker) => {
      if (completed) return;
      completed = true;
      try {
        sessionStorage.setItem(UPDATE_VERSION_KEY, __APP_VERSION__);
      } catch {
        // Reload still applies the update even if status cannot be persisted.
      }
      worker.postMessage({ type: 'SKIP_WAITING' });
      window.setTimeout(() => window.location.reload(), 1200);
    };
    const watchInstalling = () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed') activate(registration.waiting ?? worker);
      });
    };

    registration.addEventListener('updatefound', watchInstalling);
    await registration.update();
    if (registration.waiting) {
      registration.removeEventListener('updatefound', watchInstalling);
      activate(registration.waiting);
      return;
    }
    watchInstalling();
    window.setTimeout(() => {
      if (!completed) {
        completed = true;
        registration.removeEventListener('updatefound', watchInstalling);
        onStatus('current');
      }
    }, 2500);
  } catch {
    onStatus('error');
  }
}

export default function Settings({
  version,
  onChange,
  global = false,
  embedded = false,
  onReload,
  beforeExport,
}: Props) {
  const [soundOn, setSoundOn] = useState(true);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>(updateStatusAfterReload);

  async function load() {
    setSoundOn(getPrefs().soundEnabled);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  // Tap the version 5× to toggle the on-screen viewport-diagnostics overlay —
  // the only way to enable it inside an installed PWA (no address bar for
  // `?kbdebug=1`). Handy for pinning down device-only layout gaps.
  const tapCount = useRef(0);
  const tapTimer = useRef<number | null>(null);
  function bumpVersionTap() {
    if (tapTimer.current) window.clearTimeout(tapTimer.current);
    tapCount.current += 1;
    if (tapCount.current >= 5) {
      tapCount.current = 0;
      let on = false;
      try {
        on = localStorage.getItem('kaizen.kbdebug') === '1';
        localStorage.setItem('kaizen.kbdebug', on ? '0' : '1');
      } catch {
        /* ignore */
      }
      alert(`Viewport debug ${on ? 'OFF' : 'ON'} — reloading.`);
      location.reload();
      return;
    }
    tapTimer.current = window.setTimeout(() => {
      tapCount.current = 0;
    }, 1200);
  }

  return (
    <div className={embedded ? 'page--settings' : 'page page--settings'}>
      {!global && <GmailImport onChange={onChange} />}

      <DataBackupCard onReload={onReload ?? load} beforeExport={beforeExport} />

      {!global && (
        <>
          <RecurringManager version={version} onChange={onChange} />

          <PaymentMethodsManager />
        </>
      )}

      <div className="card settings-hub">
        <h3>App</h3>
        {!global && (
          <div className="row">
            <span>Sound effects</span>
            <button
              className={`btn btn--sm${soundOn ? '' : ' btn--ghost'}`}
              onClick={() => {
                const next = !soundOn;
                setSoundOn(next);
                setPrefs({ soundEnabled: next });
                if (next) playSound('success');
                onChange();
              }}
            >
              {soundOn ? '🔊 On' : '🔇 Off'}
            </button>
          </div>
        )}
        <div className="row settings-hub__row">
          <span>
            <strong>Demo mode</strong>
          </span>
          <button
            className={`btn btn--sm${isDemoMode() ? '' : ' btn--ghost'}`}
            onClick={() => {
              if (isDemoMode()) {
                exitDemo();
                return;
              }
              const ok = window.confirm(
                'Fill the app with DEMO sample data to show someone?\n\n' +
                  'Your real data and backups are NOT touched — turn this off any time and everything comes back exactly as it was.',
              );
              if (ok) enterDemo();
            }}
          >
            {isDemoMode() ? '✨ On' : 'Off'}
          </button>
        </div>
        <div className="row">
          <span>Version</span>
          <span>
            <span
              className={`pill ${
                updateStatus === 'updated'
                  ? 'pill--updated'
                  : updateStatus === 'error'
                    ? 'pill--warn'
                    : 'pill--good'
              }`}
              onClick={bumpVersionTap}
              style={{ cursor: 'default' }}
            >
              v{__APP_VERSION__}
            </span>
            <span className="muted"> · {fmtDayTime(new Date(__BUILD_TIME__))}</span>
          </span>
        </div>
        <div className="row">
          <span>App update</span>
          <span className="settings-update">
            <button
              className="btn btn--sm"
              disabled={updateStatus === 'checking'}
              onClick={() => void checkForUpdates(setUpdateStatus)}
            >
              {updateStatus === 'checking' ? 'Checking…' : 'Check for updates'}
            </button>
            <small className={`settings-update__status settings-update__status--${updateStatus}`} aria-live="polite">
              {updateStatus === 'current'
                ? 'Already up to date'
                : updateStatus === 'updated'
                  ? 'Updated successfully'
                  : updateStatus === 'error'
                    ? 'Could not check'
                    : ''}
            </small>
          </span>
        </div>
      </div>
    </div>
  );
}
