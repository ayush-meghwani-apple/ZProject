import { useMemo, useState } from 'react';
import type { PlanUpdate } from '../FortunaApp';
import type { FinancialPlan, RecurringInvestment, SipDestination, SipFrequency } from '../../types/models';
import { newSip, firstSipDate, SIP_DESTINATIONS, destinationIsEquity } from '../../core/recurringInvestments';
import { formatINR, formatDate } from '../../core/util';
import AmountInput from '../AmountInput';
import AppIcon from '../AppIcon';
import { Section } from './shared';

const EQUITY_CATS = ['Largecap', 'Midcap', 'Smallcap', 'Flexi/Multi cap'];
const FREQ: { value: SipFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
];

/** Group the destinations for the <select> (optgroups). */
const DEST_GROUPS = Array.from(new Set(SIP_DESTINATIONS.map((d) => d.group)));

function destLabel(dest: SipDestination): string {
  return SIP_DESTINATIONS.find((d) => d.value === dest)?.label ?? dest;
}
function freqLabel(f: SipFrequency): string {
  return FREQ.find((x) => x.value === f)?.label ?? f;
}

export default function RecurringInvestments({
  plan,
  update,
}: {
  plan: FinancialPlan;
  update: PlanUpdate;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const sips = plan.recurringInvestments;
  // Mutual-fund SIPs live on each fund (Pulse tab), not in recurringInvestments —
  // surface them here too so ALL recurring contributions are visible in one place.
  const fundSips = (plan.mutualFunds ?? []).filter((f) => f.sip);

  const monthlyTotal = useMemo(
    () =>
      sips.filter((s) => s.active).reduce((sum, s) => sum + perMonth(s), 0) +
      fundSips.filter((f) => f.sip?.active).reduce((sum, f) => sum + (f.sip?.amount ?? 0), 0),
    [sips, fundSips],
  );

  function addSip() {
    const s = newSip({ label: '', amount: 0, destination: 'domesticMF', category: 'Flexi/Multi cap', frequency: 'monthly' });
    update((d) => { d.recurringInvestments.push(s); });
    setOpenId(s.id);
  }

  return (
    <Section
      title="Recurring investments (SIPs)"
      subtitle="Auto-add contributions to your portfolio"
      right={sips.length > 0 || fundSips.length > 0 ? <span className="ft-chip">{formatINR(monthlyTotal)}/mo</span> : undefined}
      collapsible
      defaultOpen={sips.length > 0 || fundSips.length > 0}
    >
      <p className="ft-note" style={{ marginTop: 0 }}>
        Each SIP adds its amount to the chosen holding on schedule — it runs automatically whenever you open Fortuna,
        catching up any missed contributions, so your portfolio stays current without manual edits.
      </p>

      {sips.map((s, i) => {
        const open = openId === s.id;
        return (
          <div className={`ft-sip ${open ? 'ft-sip--open' : ''} ${!s.active ? 'ft-sip--paused' : ''}`} key={s.id}>
            <button className="ft-sip__head" onClick={() => setOpenId(open ? null : s.id)}>
              <span className="ft-sip__title">
                <span className="ft-sip__name">{s.label.trim() || 'Untitled SIP'}</span>
                <span className="ft-sip__meta">
                  {freqLabel(s.frequency)} · {destLabel(s.destination)}
                  {!s.active && ' · paused'}
                </span>
              </span>
              <span className="ft-sip__amt">
                <span className="ft-sip__amtv">{formatINR(s.amount)}</span>
              </span>
              <AppIcon name={open ? 'chevronUp' : 'chevronDown'} size={18} />
            </button>

            {open && (
              <div className="ft-sip__body">
                <label className="ft-row">
                  <span className="ft-row__label">Name</span>
                  <span className="ft-row__field">
                    <input
                      className="input ft-row__input"
                      value={s.label}
                      placeholder="e.g. Nifty 50 Index SIP"
                      onChange={(e) => update((d) => { d.recurringInvestments[i].label = e.target.value; })}
                    />
                  </span>
                </label>

                <label className="ft-row">
                  <span className="ft-row__label">Amount / contribution</span>
                  <span className="ft-row__field">
                    <span className="ft-row__cur">₹</span>
                    <AmountInput
                      className="input ft-row__input"
                      value={s.amount}
                      onChange={(v) => update((d) => { d.recurringInvestments[i].amount = v; })}
                      placeholder="0"
                    />
                  </span>
                </label>

                <label className="ft-row">
                  <span className="ft-row__label">Invests into</span>
                  <span className="ft-row__field">
                    <select
                      className="input ft-row__input"
                      value={s.destination}
                      onChange={(e) =>
                        update((d) => {
                          const dest = e.target.value as SipDestination;
                          d.recurringInvestments[i].destination = dest;
                          if (destinationIsEquity(dest) && !d.recurringInvestments[i].category) {
                            d.recurringInvestments[i].category = 'Flexi/Multi cap';
                          }
                        })
                      }
                    >
                      {DEST_GROUPS.map((g) => (
                        <optgroup key={g} label={g}>
                          {SIP_DESTINATIONS.filter((d) => d.group === g).map((d) => (
                            <option key={d.value} value={d.value}>
                              {d.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </span>
                </label>

                {destinationIsEquity(s.destination) && (
                  <label className="ft-row">
                    <span className="ft-row__label">Cap category</span>
                    <span className="ft-row__field">
                      <select
                        className="input ft-row__input"
                        value={s.category ?? EQUITY_CATS[3]}
                        onChange={(e) => update((d) => { d.recurringInvestments[i].category = e.target.value; })}
                      >
                        {EQUITY_CATS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </span>
                  </label>
                )}

                <label className="ft-row">
                  <span className="ft-row__label">Frequency</span>
                  <span className="ft-row__field">
                    <select
                      className="input ft-row__input"
                      value={s.frequency}
                      onChange={(e) =>
                        update((d) => {
                          const f = e.target.value as SipFrequency;
                          d.recurringInvestments[i].frequency = f;
                          d.recurringInvestments[i].nextDate = firstSipDate(f, d.recurringInvestments[i].dayOfMonth, d.recurringInvestments[i].dayOfWeek);
                        })
                      }
                    >
                      {FREQ.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>

                {s.frequency !== 'weekly' && (
                  <label className="ft-row">
                    <span className="ft-row__label">Day of month</span>
                    <span className="ft-row__field ft-row__field--pct">
                      <input
                        className="input ft-row__input"
                        inputMode="numeric"
                        value={String(s.dayOfMonth ?? '')}
                        placeholder="1–31"
                        onChange={(e) =>
                          update((d) => {
                            const raw = e.target.value.replace(/[^0-9]/g, '');
                            const dom = raw === '' ? undefined : Math.min(31, Math.max(1, parseInt(raw, 10)));
                            d.recurringInvestments[i].dayOfMonth = dom;
                            d.recurringInvestments[i].nextDate = firstSipDate(d.recurringInvestments[i].frequency, dom, d.recurringInvestments[i].dayOfWeek);
                          })
                        }
                      />
                    </span>
                  </label>
                )}

                <div className="ft-sip__info">
                  <div className="ft-sip__inforow">
                    <span>Next contribution</span>
                    <span>{formatDate(s.nextDate)}</span>
                  </div>
                  {s.lastRunAt && (
                    <div className="ft-sip__inforow">
                      <span>Last added</span>
                      <span>{formatDate(s.lastRunAt)}</span>
                    </div>
                  )}
                </div>

                <div className="ft-sip__actions">
                  <button
                    className="btn btn--ghost ft-btn"
                    onClick={() => update((d) => { d.recurringInvestments[i].active = !d.recurringInvestments[i].active; })}
                  >
                    <AppIcon name={s.active ? 'pause' : 'play'} size={16} /> {s.active ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    className="btn btn--ghost btn--danger ft-btn"
                    onClick={() => {
                      update((d) => { d.recurringInvestments.splice(i, 1); });
                      setOpenId(null);
                    }}
                  >
                    <AppIcon name="trash" size={16} /> Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {fundSips.length > 0 && (
        <>
          <div className="ft-sublabel">Mutual fund SIPs · from Pulse</div>
          {fundSips.map((f) => {
            const sip = f.sip;
            if (!sip) return null;
            return (
              <div className={`ft-sip ft-mfsip ${!sip.active ? 'ft-sip--paused' : ''}`} key={f.id}>
                <div className="ft-mfsip__row">
                  <span className="ft-sip__title">
                    <span className="ft-sip__name">{f.name}</span>
                    <span className="ft-sip__meta">Monthly · day {sip.dayOfMonth}{!sip.active && ' · paused'}</span>
                  </span>
                  <span className="ft-mfsip__amt">
                    <span className="ft-row__cur">₹</span>
                    <AmountInput
                      className="input"
                      value={sip.amount}
                      onChange={(v) => update((d) => { const fund = (d.mutualFunds ?? []).find((x) => x.id === f.id); if (fund?.sip) fund.sip.amount = v; })}
                      placeholder="0"
                    />
                  </span>
                  <button
                    className="iconbtn"
                    title={sip.active ? 'Pause' : 'Resume'}
                    aria-label={sip.active ? 'Pause SIP' : 'Resume SIP'}
                    onPointerDown={(e) => e.preventDefault()}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => update((d) => { const fund = (d.mutualFunds ?? []).find((x) => x.id === f.id); if (fund?.sip) fund.sip.active = !fund.sip.active; })}
                  >
                    <AppIcon name={sip.active ? 'pause' : 'play'} size={16} />
                  </button>
                </div>
              </div>
            );
          })}
          <p className="ft-note">Adjust a fund’s SIP amount here or on the Pulse tab — installments post automatically each month at that day’s NAV.</p>
        </>
      )}

      <button className="ft-addrow ft-addrow--full" onClick={addSip}>
        <AppIcon name="plus" size={16} /> Add recurring investment
      </button>
    </Section>
  );
}

/** Normalise a SIP's contribution to a monthly figure (for the header total). */
function perMonth(s: RecurringInvestment): number {
  const amt = Number(s.amount) || 0;
  if (s.frequency === 'weekly') return (amt * 52) / 12;
  if (s.frequency === 'quarterly') return amt / 3;
  return amt;
}
