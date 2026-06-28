import { useState } from 'react';
import Goals from './Goals';
import Settings from './Settings';
import TabbedApp, { type TabDef } from './TabbedApp';

/** The Goals sub-app: plan future goals and run step-up SIP projections. */
export default function GoalsApp() {
  const [version, setVersion] = useState(0);
  const onChange = () => setVersion((v) => v + 1);

  const tabs: TabDef[] = [
    { id: 'goals', label: 'Goals', icon: '🎯', render: () => <Goals version={version} onChange={onChange} /> },
    {
      id: 'settings',
      label: 'Settings',
      icon: '⚙️',
      render: () => <Settings version={version} onChange={onChange} global />,
    },
  ];

  return <TabbedApp tabs={tabs} />;
}
