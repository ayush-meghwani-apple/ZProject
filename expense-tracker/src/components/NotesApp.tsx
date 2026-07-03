import { useState } from 'react';
import Notes from './Notes';
import Settings from './Settings';
import TabbedApp, { type TabDef } from './TabbedApp';

/** Notes: a simple place for rich notes (text, lists, images, links). */
export default function NotesApp() {
  const [version, setVersion] = useState(0);
  const onChange = () => setVersion((v) => v + 1);

  const tabs: TabDef[] = [
    { id: 'notes', label: 'Notes', icon: '📝', render: () => <Notes version={version} onChange={onChange} /> },
    {
      id: 'settings',
      label: 'Settings',
      icon: '⚙️',
      render: () => <Settings version={version} onChange={onChange} global />,
    },
  ];

  return <TabbedApp tabs={tabs} />;
}
