import { useCallback, useEffect, useRef, useState } from 'react';
import TabbedApp, { type TabDef } from './TabbedApp';
import AppIcon from './AppIcon';
import { hasPin, createPin, unlock } from '../core/vaultLock';
import { PlannerRepository } from '../repository/plannerRepository';
import { applyDueRecurringInvestments } from '../core/recurringInvestments';
import type { FinancialPlan } from '../types/models';
import NetWorthTab from './fortuna/NetWorthTab';
import CashFlowTab from './fortuna/CashFlowTab';
import PortfolioTab from './fortuna/PortfolioTab';
import GoalsTab from './fortuna/GoalsTab';
import AssumptionsTab from './fortuna/AssumptionsTab';
import SettingsTab from './fortuna/SettingsTab';

/**
 * A draft-mutator update: receives a mutable clone of the plan, mutates it in
 * place, and the shell re-renders + persists (debounced). Keeps tab code simple
 * without an immer dependency.
 */
export type PlanUpdate = (mutator: (draft: FinancialPlan) => void) => void;

export interface FortunaTabProps {
  plan: FinancialPlan;
  update: PlanUpdate;
}

/** Plain-JSON deep clone — the plan is pure data (numbers/strings/arrays), so
 *  this is guaranteed-correct and dependency-free. */
function clone(plan: FinancialPlan): FinancialPlan {
  return JSON.parse(JSON.stringify(plan)) as FinancialPlan;
}

/**
 * Fortuna — the PIN-gated Financial Planning section. The PIN is the SAME as the
 * Vault's (shared lock), used here purely as an access gate: the derived key is
 * discarded and the plan itself is stored unencrypted, so a forgotten PIN can
 * never make the plan unrecoverable. Leaving the sub-app re-locks it.
 */
export default function FortunaApp() {
  const [unlocked, setUnlocked] = useState(false);
  return unlocked ? <Fortuna onLock={() => setUnlocked(false)} /> : <FortunaLock onUnlock={() => setUnlocked(true)} />;
}

function FortunaLock({ onUnlock }: { onUnlock: () => void }) {
  const creating = !hasPin();
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (busy) return;
    if (creating) {
      if (!/^\d{4,6}$/.test(pin)) return setErr('PIN must be 4–6 digits.');
      if (pin !== pin2) return setErr('The PINs don’t match.');
      setBusy(true);
      await createPin(pin); // shared with the Vault; key discarded (gate only)
      setBusy(false);
      onUnlock();
    } else {
      setBusy(true);
      const key = await unlock(pin);
      setBusy(false);
      if (key) onUnlock();
      else {
        setErr('Wrong PIN.');
        setPin('');
      }
    }
  }

  return (
    <main className="app__body">
      <div className="page vaultlock">
        <div className="vaultlock__card">
          <div className="vaultlock__icon">
            <AppIcon name="investments" size={30} />
          </div>
          <h2>{creating ? 'Create a PIN' : 'Enter PIN'}</h2>
          <p className="muted">
            {creating
              ? 'Set a 4–6 digit PIN to lock your financial plan. It’s the same PIN as your Vault and is stored only on this device.'
              : 'Enter your PIN to open your financial plan.'}
          </p>
          <form onSubmit={submit} className="vaultlock__form">
            <input
              className="input vaultlock__pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="PIN"
              autoFocus
            />
            {creating && (
              <input
                className="input vaultlock__pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={pin2}
                onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))}
                placeholder="Confirm PIN"
              />
            )}
            {err && <div className="vaultlock__err">{err}</div>}
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Working…' : creating ? 'Create & open' : 'Unlock'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

function Fortuna({ onLock }: { onLock: () => void }) {
  const [plan, setPlan] = useState<FinancialPlan | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<FinancialPlan | null>(null);

  useEffect(() => {
    let alive = true;
    PlannerRepository.load().then((p) => {
      // Apply any due recurring investments (SIPs) so the portfolio is up to
      // date the moment the plan opens; persist only if something changed.
      const applied = applyDueRecurringInvestments(p);
      if (applied > 0) void PlannerRepository.save(p);
      if (alive) setPlan(p);
    });
    return () => {
      alive = false;
    };
  }, []);

  const flush = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (pendingSave.current) {
      const toSave = pendingSave.current;
      pendingSave.current = null;
      void PlannerRepository.save(toSave);
    }
  }, []);

  // Persist on unmount / lock so nothing in-flight is lost.
  useEffect(() => flush, [flush]);

  const update = useCallback<PlanUpdate>((mutator) => {
    setPlan((prev) => {
      if (!prev) return prev;
      const draft = clone(prev);
      mutator(draft);
      pendingSave.current = draft;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        if (pendingSave.current) {
          void PlannerRepository.save(pendingSave.current);
          pendingSave.current = null;
        }
      }, 350);
      return draft;
    });
  }, []);

  // Re-load the plan from storage, cancelling any pending save so an in-flight
  // debounce can't clobber freshly-imported/restored data.
  const reload = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    pendingSave.current = null;
    const p = await PlannerRepository.load();
    const applied = applyDueRecurringInvestments(p);
    if (applied > 0) await PlannerRepository.save(p);
    setPlan(p);
  }, []);

  if (!plan) {
    return (
      <main className="app__body">
        <div className="page">
          <p className="muted" style={{ padding: 24 }}>
            Opening your plan…
          </p>
        </div>
      </main>
    );
  }

  const props: FortunaTabProps = { plan, update };
  const tabs: TabDef[] = [
    { id: 'networth', label: 'Net Worth', icon: <AppIcon name="networth" size={20} />, render: () => <NetWorthTab {...props} /> },
    { id: 'cashflow', label: 'Cash Flow', icon: <AppIcon name="cashflow" size={20} />, render: () => <CashFlowTab {...props} /> },
    { id: 'portfolio', label: 'Portfolio', icon: <AppIcon name="portfolio" size={20} />, render: () => <PortfolioTab {...props} /> },
    { id: 'goals', label: 'Goals', icon: <AppIcon name="goals" size={20} />, render: () => <GoalsTab {...props} /> },
    { id: 'assumptions', label: 'Returns', icon: <AppIcon name="assumptions" size={20} />, render: () => <AssumptionsTab {...props} /> },
    { id: 'settings', label: 'Settings', icon: <AppIcon name="settings" size={20} />, render: () => <SettingsTab {...props} reload={reload} onLock={() => { flush(); onLock(); }} /> },
  ];

  return <TabbedApp tabs={tabs} initialId="networth" />;
}
