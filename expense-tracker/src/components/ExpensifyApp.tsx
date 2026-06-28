import { useEffect, useState } from 'react';
import Chat, { initialChatMessages, type ChatMessage } from './Chat';
import Summary from './Summary';
import Reels from './Reels';
import Categories from './Categories';
import Settings from './Settings';
import TabbedApp, { type TabDef } from './TabbedApp';
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

/** The original expense-tracking app, now one sub-app inside Expensify. */
export default function ExpensifyApp() {
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
      icon: '💬',
      render: () => (
        <Chat messages={chatMessages} setMessages={setChatMessages} onChange={onChange} />
      ),
    },
    { id: 'summary', label: 'Summary', icon: '📊', render: () => <Summary version={version} onChange={onChange} /> },
    { id: 'reels', label: 'Reels', icon: '🎞️', render: () => <Reels version={version} onChange={onChange} /> },
    {
      id: 'categories',
      label: 'Categories',
      icon: '🏷️',
      render: () => <Categories version={version} onChange={onChange} />,
    },
    { id: 'settings', label: 'Settings', icon: '⚙️', render: () => <Settings version={version} onChange={onChange} /> },
  ];

  return <TabbedApp tabs={tabs} />;
}
