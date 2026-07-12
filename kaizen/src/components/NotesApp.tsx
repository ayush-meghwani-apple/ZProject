import { useState } from 'react';
import Notes from './Notes';
import Settings from './Settings';
import TabbedApp, { type TabDef } from './TabbedApp';
import AppIcon from './AppIcon';
import type { ID } from '../types/models';

/** Notes: a simple place for rich notes (text, lists, images, links). */
export default function NotesApp() {
  const [version, setVersion] = useState(0);
  // Held here (above the tab shell) so switching tabs and coming back re-opens
  // the same note instead of dropping you on the notes home list.
  const [openId, setOpenId] = useState<ID | null>(null);
  const onChange = () => setVersion((v) => v + 1);

  const tabs: TabDef[] = [
    {
      id: 'notes',
      label: 'Notes',
      icon: <AppIcon name="notes" size={22} />,
      render: () => (
        <Notes version={version} onChange={onChange} openId={openId} setOpenId={setOpenId} />
      ),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <AppIcon name="settings" size={22} />,
      render: () => <Settings version={version} onChange={onChange} global />,
    },
  ];

  return <TabbedApp tabs={tabs} />;
}
