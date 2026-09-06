import { useEffect, useRef, useState } from 'react';
import { getPrefs, setPrefs } from '../core/preferences';
import { playSound } from '../core/sound';
import { isDemoMode, enterDemo, exitDemo } from '../core/demoMode';
import RecurringManager from './RecurringManager';
import PaymentMethodsManager from './PaymentMethodsManager';
import GmailImport from './GmailImport';
import DataBackupCard from './DataBackupCard';

interface Props {
  version: number;
  onChange: () => void;
  /** When true (shared Settings inside a sub-app), show only the cross-app
   * cards: Data & Backup and About. */
  global?: boolean;
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

/** Force the service worker to check for a new version, then reload. */
async function checkForUpdates(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
    reg?.waiting?.postMessage({ type: 'SKIP_WAITING' });
  } catch {
    /* ignore */
  }
  window.setTimeout(() => window.location.reload(), 1200);
}

export default function Settings({ version, onChange, global = false }: Props) {
  const [soundOn, setSoundOn] = useState(true);

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
    <div className="page page--settings">
      {!global && <GmailImport onChange={onChange} />}

      <DataBackupCard onReload={load} defaultOpen={global} />

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
              className="pill pill--good"
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
          <button className="btn btn--sm" onClick={checkForUpdates}>
            Check for updates
          </button>
        </div>
      </div>
    </div>
  );
}
