import { useEffect, useRef, useState } from 'react';
import Chat, { initialChatMessages, type ChatMessage } from './Chat';
import Summary from './Summary';
import Reels from './Reels';
import Categories from './Categories';
import Settings from './Settings';
import TabbedApp, { type TabDef } from './TabbedApp';
import AppIcon from './AppIcon';
import { RecurringRepository } from '../repository/recurringRepository';
import { CategoryRepository } from '../repository/categoryRepository';

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

interface Props {
  /** Incremented by the reminders inbox after it adds an expense, so tabs reload. */
  refreshNonce?: number;
  /** Incremented to jump straight to the Reels tab (weekly review nudge). */
  openReelsNonce?: number;
}

/** The original expense-tracking app, now one sub-app inside Expensify. */
export default function ExpensifyApp({ refreshNonce = 0, openReelsNonce = 0 }: Props) {
  // Chat history persists across app restarts so typed notes/reminders stay.
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(loadChat);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_KEY, JSON.stringify(chatMessages.slice(-200)));
    } catch {
      /* ignore */
    }
  }, [chatMessages]);

  // Bumped whenever data changes, so other tabs reload when shown.
  const [version, setVersion] = useState(0);
  const onChange = () => setVersion((v) => v + 1);

  // Reload when the reminders inbox adds an expense from outside this tree.
  const firstRefresh = useRef(true);
  useEffect(() => {
    if (firstRefresh.current) {
      firstRefresh.current = false;
      return;
    }
    setVersion((v) => v + 1);
  }, [refreshNonce]);

  useEffect(() => {
    RecurringRepository.runDue().then((created) => {
      if (created > 0) setVersion((v) => v + 1);
    });
    CategoryRepository.ensureDistinctColors().then((changed) => {
      if (changed > 0) setVersion((v) => v + 1);
    });
  }, []);

  const tabs: TabDef[] = [
    {
      id: 'chat',
      label: 'Add',
      icon: <AppIcon name="add" size={22} />,
      render: () => (
        <Chat messages={chatMessages} setMessages={setChatMessages} onChange={onChange} />
      ),
    },
    { id: 'summary', label: 'Summary', icon: <AppIcon name="summary" size={22} />, render: () => <Summary version={version} onChange={onChange} /> },
    { id: 'reels', label: 'Reels', icon: <AppIcon name="reels" size={22} />, render: () => <Reels version={version} onChange={onChange} /> },
    {
      id: 'categories',
      label: 'Categories',
      icon: <AppIcon name="categories" size={22} />,
      render: () => <Categories version={version} onChange={onChange} />,
    },
    { id: 'settings', label: 'Settings', icon: <AppIcon name="settings" size={22} />, render: () => <Settings version={version} onChange={onChange} /> },
  ];

  return (
    <TabbedApp
      tabs={tabs}
      controlledOpen={openReelsNonce ? { id: 'reels', nonce: openReelsNonce } : undefined}
    />
  );
}
