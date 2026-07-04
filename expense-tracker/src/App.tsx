import { useEffect, useState } from 'react';
import ExpensifyApp from './components/ExpensifyApp';
import GoalsApp from './components/GoalsApp';
import NotesApp from './components/NotesApp';
import RemindersInbox from './components/RemindersInbox';
import { RemindersRepository } from './repository/remindersRepository';
import { getPrefs } from './core/preferences';
import { fireLocalNotification } from './core/notify';

type AppId = 'expensify' | 'goals' | 'notes';

interface AppDef {
  id: AppId;
  name: string;
  icon: string;
  section: string;
}

const APPS: AppDef[] = [
  { id: 'expensify', name: 'Expensify', icon: '🧾', section: 'Money' },
  { id: 'goals', name: 'Questify', icon: '🧭', section: 'Planning' },
  { id: 'notes', name: 'Slate', icon: '📝', section: 'Studio' },
];

// Listed in the drawer but not yet built.
const SOON: { name: string; icon: string; section: string }[] = [
  { name: 'Investments', icon: '📈', section: 'Planning' },
];

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
          ☰
        </button>
        <span className="app__icon">{current.icon}</span>
        <span className="app__title">{current.name}</span>
        <button
          className="bell"
          onClick={() => setInboxOpen(true)}
          aria-label={dueCount > 0 ? `${dueCount} reminders due` : 'Reminders'}
        >
          🔔
          {dueCount > 0 && <span className="bell__badge">{dueCount > 9 ? '9+' : dueCount}</span>}
        </button>
      </header>

      {drawerOpen && <div className="drawer-overlay" onClick={() => setDrawerOpen(false)} />}
      <aside className={`drawer ${drawerOpen ? 'drawer--open' : ''}`}>
        <div className="drawer__head">
          <span className="drawer__brand">Orbit</span>
          <button className="iconbtn" onClick={() => setDrawerOpen(false)} aria-label="Close menu">
            ✕
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
                <span className="drawer__icon">{a.icon}</span>
                {a.name}
              </button>
            ))}
            {SOON.filter((s) => s.section === section).map((s) => (
              <button key={s.name} className="drawer__item drawer__item--soon" disabled>
                <span className="drawer__icon">{s.icon}</span>
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
    </div>
  );
}
