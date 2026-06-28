import { useState } from 'react';
import ExpensifyApp from './components/ExpensifyApp';
import GoalsApp from './components/GoalsApp';

type AppId = 'expensify' | 'goals';

interface AppDef {
  id: AppId;
  name: string;
  icon: string;
  section: string;
}

const APPS: AppDef[] = [
  { id: 'expensify', name: 'Expensify', icon: '🧾', section: 'Money' },
  { id: 'goals', name: 'Goals', icon: '🎯', section: 'Planning' },
];

// Listed in the drawer but not yet built.
const SOON: { name: string; icon: string; section: string }[] = [
  { name: 'Investments', icon: '📈', section: 'Planning' },
];

export default function App() {
  // Not persisted on purpose: the app always opens on Expensify.
  const [activeApp, setActiveApp] = useState<AppId>('expensify');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const current = APPS.find((a) => a.id === activeApp)!;

  function openApp(id: AppId) {
    setActiveApp(id);
    setDrawerOpen(false);
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
        <span className="app__title">
          {current.icon} {current.name}
        </span>
      </header>

      {drawerOpen && <div className="drawer-overlay" onClick={() => setDrawerOpen(false)} />}
      <aside className={`drawer ${drawerOpen ? 'drawer--open' : ''}`}>
        <div className="drawer__head">
          <span className="drawer__brand">Expensify</span>
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

      {activeApp === 'expensify' ? <ExpensifyApp /> : <GoalsApp />}
    </div>
  );
}
