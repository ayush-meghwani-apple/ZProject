import { useState } from 'react';
import type { FortunaTabProps } from '../FortunaApp';
import { PlannerRepository } from '../../repository/plannerRepository';
import AppIcon from '../AppIcon';
import DataBackupCard from '../DataBackupCard';
import { Section } from './shared';
import { AssumptionsContent } from './AssumptionsTab';

interface Props extends FortunaTabProps {
  onLock: () => void;
  reload: () => Promise<void>;
}

export default function SettingsTab({ plan, update, reload }: Props) {
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
      <div className="page ft-page">
        <Section title="Planning" subtitle="Plan your investments and financial goals" icon="calendar">
          <button className="ft-navrow" onClick={() => setShowReturns(true)}>
            <span className="ft-navrow__main">
              <span className="ft-navrow__title">Returns &amp; assumptions</span>
              <span className="ft-navrow__sub">Expected returns per asset class · goal-type weights</span>
            </span>
            <AppIcon name="chevronRight" size={18} />
          </button>
        </Section>

        <DataBackupCard
          onReload={reload}
          beforeExport={async () => {
            // Flush the latest in-memory plan to storage FIRST, so a change made
            // moments ago (before the debounced auto-save fired) is captured.
            await PlannerRepository.save(plan);
          }}
        />

        <Section title="About" subtitle="Version & build info" icon="info">
          <div className="ft-total" style={{ borderTop: 'none', paddingTop: 0 }}>
            <span>Version</span>
            <span className="ft-total__val">
              <span className="ft-pill ft-pill--ok">v{__APP_VERSION__}</span>
              <span className="ft-about__built">
                {' · '}
                {new Date(__BUILD_TIME__).toLocaleString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </span>
          </div>
        </Section>
      </div>
    </main>
  );
}
