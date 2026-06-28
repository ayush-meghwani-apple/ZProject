import { useEffect, useRef, useState } from 'react';
import Chat, { initialChatMessages, type ChatMessage } from './components/Chat';
import Dashboard from './components/Dashboard';
import Reports from './components/Reports';
import Reels from './components/Reels';
import Categories from './components/Categories';
import Settings from './components/Settings';
import { RecurringRepository } from './repository/recurringRepository';

type Tab = 'chat' | 'dashboard' | 'reports' | 'reels' | 'categories' | 'settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'chat', label: 'Add', icon: '💬' },
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'reports', label: 'Reports', icon: '📈' },
  { id: 'reels', label: 'Reels', icon: '🎞️' },
  { id: 'categories', label: 'Categories', icon: '🏷️' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

const CHAT_KEY = 'expense:chat';

function loadChat(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length) return parsed as ChatMessage[];
  } catch {
    /* ignore corrupt/unavailable storage */
  }
  return initialChatMessages;
}

export default function App() {
  const [tab, setTab] = useState<Tab>('chat');
  // Chat history persists across app restarts so typed notes/reminders stay.
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(loadChat);

  useEffect(() => {
    try {
      // Cap history so storage can't grow without bound.
      localStorage.setItem(CHAT_KEY, JSON.stringify(chatMessages.slice(-200)));
    } catch {
      /* ignore */
    }
  }, [chatMessages]);
  // Bumped whenever data changes, so other tabs reload when shown.
  const [version, setVersion] = useState(0);
  const onChange = () => setVersion((v) => v + 1);

  // Generate any due recurring expenses once when the app loads.
  useEffect(() => {
    RecurringRepository.runDue().then((created) => {
      if (created > 0) setVersion((v) => v + 1);
    });
  }, []);

  // Horizontal swipe to move between tabs (left = next, right = previous).
  // We lock to a horizontal or vertical gesture on the first real movement so a
  // mostly-vertical scroll never accidentally flips the tab, and we show a live
  // hint of where the swipe is heading instead of switching with a jolt.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const dirLock = useRef<'h' | 'v' | null>(null);
  const noSwipe = useRef(false);
  const [swipeX, setSwipeX] = useState(0);

  const tabIdx = TABS.findIndex((x) => x.id === tab);
  // While dragging horizontally, which tab would we land on?
  const swipeTarget =
    swipeX < -20 && tabIdx < TABS.length - 1
      ? TABS[tabIdx + 1]
      : swipeX > 20 && tabIdx > 0
        ? TABS[tabIdx - 1]
        : null;

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
    dirLock.current = null;
    // Don't steal the gesture from horizontally-scrollable areas (e.g. the
    // category suggestion strip or the symbol bar in chat).
    noSwipe.current = !!(e.target as HTMLElement).closest?.('[data-noswipe]');
    setSwipeX(0);
  }

  function onTouchMove(e: React.TouchEvent) {
    const start = touchStart.current;
    if (!start || noSwipe.current) return;
    const t = e.touches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (dirLock.current === null && Math.abs(dx) + Math.abs(dy) > 12) {
      dirLock.current = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v';
    }
    if (dirLock.current === 'h') {
      // Resist at the ends so it feels bounded, not broken.
      const atEnd =
        (dx < 0 && tabIdx === TABS.length - 1) || (dx > 0 && tabIdx === 0);
      setSwipeX(atEnd ? dx * 0.25 : dx);
    }
  }

  function onTouchEnd() {
    const horizontal = dirLock.current === 'h' && !noSwipe.current;
    const dx = swipeX;
    touchStart.current = null;
    dirLock.current = null;
    noSwipe.current = false;
    setSwipeX(0);
    if (!horizontal || Math.abs(dx) < 60) return;
    if (dx < 0 && tabIdx < TABS.length - 1) setTab(TABS[tabIdx + 1].id);
    else if (dx > 0 && tabIdx > 0) setTab(TABS[tabIdx - 1].id);
  }

  return (
    <div className="app">
      <header className="app__header">
        <span>Expense Tracker</span>
        <span className="pill">{TABS.find((t) => t.id === tab)?.label}</span>
      </header>

      <main
        className="app__body"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {swipeTarget && (
          <div className={`swipe-hint swipe-hint--${swipeX < 0 ? 'next' : 'prev'}`}>
            {swipeX < 0 ? (
              <>
                {swipeTarget.icon} {swipeTarget.label} ›
              </>
            ) : (
              <>
                ‹ {swipeTarget.icon} {swipeTarget.label}
              </>
            )}
          </div>
        )}
        <div
          key={tab}
          className="app__view"
          style={
            swipeX !== 0
              ? { transform: `translateX(${swipeX * 0.18}px)`, transition: 'none' }
              : undefined
          }
        >
          {tab === 'chat' && (
            <Chat messages={chatMessages} setMessages={setChatMessages} onChange={onChange} />
          )}
          {tab === 'dashboard' && <Dashboard version={version} onChange={onChange} />}
          {tab === 'reports' && <Reports version={version} />}
          {tab === 'reels' && <Reels version={version} onChange={onChange} />}
          {tab === 'categories' && <Categories version={version} onChange={onChange} />}
          {tab === 'settings' && <Settings version={version} onChange={onChange} />}
        </div>
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
