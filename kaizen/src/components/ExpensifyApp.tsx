import { useEffect, useRef, useState } from 'react';
import Summary from './Summary';
import Reels from './Reels';
import Categories from './Categories';
import Settings from './Settings';
import TabbedApp, { type TabDef } from './TabbedApp';
import AppIcon from './AppIcon';
import { RecurringRepository } from '../repository/recurringRepository';
import { CategoryRepository } from '../repository/categoryRepository';
import { GmailRepository } from '../repository/gmailRepository';

interface Props {
  /** Incremented by the reminders inbox after it adds an expense, so tabs reload. */
  refreshNonce?: number;
  /** Incremented to jump straight to the Reels tab (weekly review nudge). */
  openReelsNonce?: number;
}

/** The original expense-tracking app, now one sub-app inside Expensify. */
export default function ExpensifyApp({ refreshNonce = 0, openReelsNonce = 0 }: Props) {
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
    // Sync on open and whenever the app returns to the foreground. This also
    // retries after a service-worker update reloads the PWA.
    const syncGmail = () => GmailRepository.autoSync().then(({ imported, salary }) => {
      if (imported > 0 || salary > 0) setVersion((v) => v + 1);
    });
    void syncGmail();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncGmail();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', syncGmail);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', syncGmail);
    };
  }, []);

  const tabs: TabDef[] = [
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
      preserveEditorFocusOnActions
      controlledOpen={openReelsNonce ? { id: 'reels', nonce: openReelsNonce } : undefined}
    />
  );
}
