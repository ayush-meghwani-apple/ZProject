import { useEffect, useState } from 'react';
import Chat, { initialChatMessages, type ChatMessage } from './components/Chat';
import Dashboard from './components/Dashboard';
import Reports from './components/Reports';
import Categories from './components/Categories';
import Settings from './components/Settings';
import { ExpenseRepository } from './repository/expenseRepository';
import { BackupRepository } from './repository/backupRepository';

type Tab = 'chat' | 'dashboard' | 'reports' | 'categories' | 'settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'chat', label: 'Add', icon: '💬' },
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'reports', label: 'Reports', icon: '📈' },
  { id: 'categories', label: 'Categories', icon: '🏷️' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('chat');
  // Chat history lives here so it survives tab switches (until page refresh).
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(initialChatMessages);
  // Bumped whenever data changes, so other tabs reload when shown.
  const [version, setVersion] = useState(0);
  const [expenseCount, setExpenseCount] = useState(0);
  const onChange = () => setVersion((v) => v + 1);

  useEffect(() => {
    ExpenseRepository.getExpenses().then((e) => setExpenseCount(e.length));
  }, [version]);

  const days = BackupRepository.daysSinceBackup();
  const backupStale = days === null || days >= 7;
  const showBackupReminder = expenseCount > 0 && backupStale;
  const reminderText = days === null ? 'no backup yet' : `last backup ${days}d ago`;

  return (
    <div className="app">
      <header className="app__header">
        <span>Expense Tracker</span>
        <span className="pill">{TABS.find((t) => t.id === tab)?.label}</span>
      </header>

      {showBackupReminder && (
        <button className="banner" onClick={() => setTab('settings')}>
          ⚠️ Back up your expenses — {reminderText}. Tap to export.
        </button>
      )}

      <main className="app__body">
        {tab === 'chat' && (
          <Chat messages={chatMessages} setMessages={setChatMessages} onChange={onChange} />
        )}
        {tab === 'dashboard' && <Dashboard version={version} onChange={onChange} />}
        {tab === 'reports' && <Reports version={version} />}
        {tab === 'categories' && <Categories version={version} onChange={onChange} />}
        {tab === 'settings' && <Settings version={version} onChange={onChange} />}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            <span className="icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
