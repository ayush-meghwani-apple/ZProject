import { useState } from 'react';
import type { FortunaTabProps } from '../FortunaApp';
import AppIcon from '../AppIcon';
import Settings from '../Settings';
import { AssumptionsContent } from './AssumptionsTab';
import MfGmailImport from './MfGmailImport';

interface Props extends FortunaTabProps {
  onLock: () => void;
  reload: () => Promise<void>;
  beforeExternalChange: () => Promise<void>;
}

export default function SettingsTab({ plan, update, reload, beforeExternalChange }: Props) {
  // Returns/assumptions used to be its own tab; it now lives here as a drill-in.
  const [showReturns, setShowReturns] = useState(false);

  if (showReturns) {
    return (
      <main className="app__body">
        <div className="page ft-page">
          <button className="ft-backrow" onClick={() => setShowReturns(false)}>
            <AppIcon name="back" size={18} /> Settings
          </button>
          <AssumptionsContent plan={plan} update={update} />
        </div>
      </main>
    );
  }

  return (
    <main className="app__body">
      <div className="page ft-page ft-settings">
        <button type="button" className="card scard--compact ft-settings__card" onClick={() => setShowReturns(true)}>
          <span className="scard__head">
            <span className="scard__icon"><AppIcon name="calendar" size={22} /></span>
            <span className="scard__headtext">
              <span className="scard__title">Returns &amp; assumptions</span>
            </span>
            <AppIcon name="chevronRight" size={18} />
          </span>
        </button>

        <MfGmailImport beforeImport={beforeExternalChange} onChange={reload} />

        <Settings
          version={0}
          onChange={() => {}}
          global
          embedded
          onReload={reload}
          beforeExport={beforeExternalChange}
        />
      </div>
    </main>
  );
}
