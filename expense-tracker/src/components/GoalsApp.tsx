import { useState } from 'react';
import Goals from './Goals';
import Calculator from './Calculator';
import Settings from './Settings';
import TabbedApp, { type TabDef } from './TabbedApp';

/** Questify: plan financial goals and run quick money what-ifs. */
export default function GoalsApp() {
  const [version, setVersion] = useState(0);
  const onChange = () => setVersion((v) => v + 1);

  const tabs: TabDef[] = [
    { id: 'goals', label: 'Goals', icon: '🎯', render: () => <Goals version={version} onChange={onChange} /> },
    { id: 'calculator', label: 'Calculator', icon: '🧮', render: () => <Calculator /> },
    {
      id: 'settings',
      label: 'Settings',
      icon: '⚙️',
      render: () => <Settings version={version} onChange={onChange} global />,
    },
  ];

  return <TabbedApp tabs={tabs} />;
}
