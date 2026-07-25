import { useState } from 'react';
import Calculator from './Calculator';
import Settings from './Settings';
import TabbedApp, { type TabDef } from './TabbedApp';
import AppIcon from './AppIcon';

/** Abacus: quick financial what-if calculators (step-up SIP, retirement, …).
 *  (Formerly Questify — goal planning moved into Fortuna's Goals tab.) */
export default function GoalsApp() {
  const [version, setVersion] = useState(0);
  const onChange = () => setVersion((v) => v + 1);

  const tabs: TabDef[] = [
    { id: 'calculator', label: 'Calculators', icon: <AppIcon name="calculator" size={22} />, render: () => <Calculator /> },
    {
      id: 'settings',
      label: 'Settings',
      icon: <AppIcon name="settings" size={22} />,
      render: () => <Settings version={version} onChange={onChange} global />,
    },
  ];

  return <TabbedApp tabs={tabs} />;
}
