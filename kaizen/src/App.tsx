import { useEffect, useState } from 'react';
import ExpensifyApp from './components/ExpensifyApp';
import GoalsApp from './components/GoalsApp';
import NotesApp from './components/NotesApp';
import FortunaApp from './components/FortunaApp';
import RemindersInbox from './components/RemindersInbox';
import BackupReminder from './components/BackupReminder';
import AppIcon, { type IconName } from './components/AppIcon';
import { RemindersRepository } from './repository/remindersRepository';
import { VaultRepository } from './repository/vaultRepository';
import { GoalRepository } from './repository/goalRepository';
import { getPrefs } from './core/preferences';
import { fireLocalNotification } from './core/notify';
import { isDemoMode, enterDemo, exitDemo } from './core/demoMode';

type AppId = 'expensify' | 'goals' | 'notes' | 'fortuna';

interface AppDef {
  id: AppId;
  name: string;
  icon: IconName;
  section: string;
}

const APPS: AppDef[] = [
  { id: 'expensify', name: 'Expensify', icon: 'expensify', section: 'Money' },
  { id: 'fortuna', name: 'Fortuna', icon: 'investments', section: 'Planning' },
  { id: 'goals', name: 'Abacus', icon: 'calculator', section: 'Studio' },
  { id: 'notes', name: 'Slate', icon: 'slate', section: 'Studio' },
];

// Listed in the drawer but not yet built.
const SOON: { name: string; icon: IconName; section: string }[] = [];

export default function App() {
  // Not persisted on purpose: the app always opens on Expensify.
  const [activeApp, setActiveApp] = useState<AppId>('expensify');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [dueCount, setDueCount] = useState(0);
  // Bumped to make Expensify reload / jump to Reels from the reminders inbox.
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [openReelsNonce, setOpenReelsNonce] = useState(0);

  const current = APPS.find((a) => a.id === activeApp)!;
  const demo = isDemoMode();

  function handleDemoToggle() {
    if (isDemoMode()) {
      exitDemo();
      return;
    }
    const ok = window.confirm(
      'Fill the app with DEMO sample data to show someone?\n\n' +
        'Your real data and backups are NOT touched — turn this off any time and everything comes back exactly as it was.',
    );
    if (ok) enterDemo();
  }

  function refreshCounts() {
    setDueCount(RemindersRepository.getDue().length);
  }

  // On open: create the weekly nudge if it's time, count what's due, and fire a
  // best-effort local notification for anything due we haven't flagged yet.
  useEffect(() => {
    RemindersRepository.ensureWeeklyNudge();
    const due = RemindersRepository.getDue();
    setDueCount(due.length);
    if (getPrefs().reminderNotifications) {
      due
        .filter((r) => !r.notified)
        .forEach((r) => {
          fireLocalNotification('Expensify reminder', r.label);
          RemindersRepository.markNotified(r.id);
        });
    }
  }, []);

  // The Vault sub-app was removed; purge its stored data once (the shared PIN
  // in vaultLock stays — Fortuna's lock still uses it).
  useEffect(() => {
    if (localStorage.getItem('kaizen:vaultRemoved') === '1') return;
    VaultRepository.clearAll().finally(() => localStorage.setItem('kaizen:vaultRemoved', '1'));
  }, []);

  // Questify's goal planner moved into Fortuna and the app is now Abacus
  // (calculators only); purge the old standalone goal data once.
  useEffect(() => {
    if (localStorage.getItem('kaizen:questifyGoalsRemoved') === '1') return;
    GoalRepository.clearAll().finally(() => localStorage.setItem('kaizen:questifyGoalsRemoved', '1'));
  }, []);

  function openApp(id: AppId) {
    setActiveApp(id);
    setDrawerOpen(false);
  }

  function openReels() {
    setActiveApp('expensify');
    setOpenReelsNonce((n) => n + 1);
    setInboxOpen(false);
  }

  // Sections in drawer order, de-duplicated.
  const sections = Array.from(
    new Set([...APPS.map((a) => a.section), ...SOON.map((s) => s.section)]),
  );

  return (
    <div className="app">
      <header className="app__header">
        <button className="hamburger" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
          <AppIcon name="menu" size={22} />
        </button>
        <span className="app__icon">
          <AppIcon name={current.icon} size={20} />
        </span>
        <span className="app__title">{current.name}</span>
        {activeApp === 'expensify' && (
          <button
            className="topswitch"
            onClick={() => setActiveApp('fortuna')}
            aria-label="Open Fortuna"
            title="Open Fortuna"
          >
            <AppIcon name="investments" size={20} />
          </button>
        )}
        <button
          className={`demotoggle${demo ? ' demotoggle--on' : ''}`}
          onClick={handleDemoToggle}
          aria-label={demo ? 'Exit demo mode' : 'Show demo data'}
          title={demo ? 'Exit demo mode (restore your real data)' : 'Show demo data (your real data stays safe)'}
        >
          <AppIcon name="sparkle" size={18} />
        </button>
        <button
          className="bell"
          onClick={() => setInboxOpen(true)}
          aria-label={dueCount > 0 ? `${dueCount} reminders due` : 'Reminders'}
        >
          <AppIcon name="bell" size={20} />
          {dueCount > 0 && <span className="bell__badge">{dueCount > 9 ? '9+' : dueCount}</span>}
        </button>
      </header>

      {demo && (
        <button className="demobanner" onClick={exitDemo} title="Exit demo mode">
          <AppIcon name="sparkle" size={14} />
          <span><strong>Demo data</strong> — your real data is safe. Tap to exit.</span>
        </button>
      )}

      {drawerOpen && <div className="drawer-overlay" onClick={() => setDrawerOpen(false)} />}
      <aside className={`drawer ${drawerOpen ? 'drawer--open' : ''}`}>
        <div className="drawer__head">
          <div className="drawer__brandwrap">
            <span className="drawer__brand">
              <span className="drawer__brand-icon">
                <AppIcon name="brand" size={22} />
              </span>
              <span className="drawer__brand-text">Kaizen</span>
            </span>
            <span className="drawer__subtitle">continuous improvement</span>
          </div>
          <button className="iconbtn" onClick={() => setDrawerOpen(false)} aria-label="Close menu">
            <AppIcon name="close" size={18} />
          </button>
        </div>
        {sections.map((section) => (
          <div className="drawer__section" key={section}>
            <div className="drawer__section-title">{section}</div>
            {APPS.filter((a) => a.section === section).map((a) => (
              <button
                key={a.id}
                className={`drawer__item ${a.id === activeApp ? 'drawer__item--active' : ''}`}
                onClick={() => openApp(a.id)}
              >
                <span className="drawer__icon">
                  <AppIcon name={a.icon} size={20} />
                </span>
                {a.name}
              </button>
            ))}
            {SOON.filter((s) => s.section === section).map((s) => (
              <button key={s.name} className="drawer__item drawer__item--soon" disabled>
                <span className="drawer__icon">
                  <AppIcon name={s.icon} size={20} />
                </span>
                {s.name}
                <span className="drawer__badge">soon</span>
              </button>
            ))}
          </div>
        ))}
      </aside>

      <div className="app__swap" key={activeApp}>
        {activeApp === 'expensify' ? (
          <ExpensifyApp refreshNonce={refreshNonce} openReelsNonce={openReelsNonce} />
        ) : activeApp === 'goals' ? (
          <GoalsApp />
        ) : activeApp === 'fortuna' ? (
          <FortunaApp />
        ) : (
          <NotesApp />
        )}
      </div>

      {inboxOpen && (
        <RemindersInbox
          onClose={() => setInboxOpen(false)}
          onDataChanged={() => setRefreshNonce((n) => n + 1)}
          onOpenReels={openReels}
          onCountsChanged={refreshCounts}
        />
      )}

      {!demo && <BackupReminder />}
    </div>
  );
}
