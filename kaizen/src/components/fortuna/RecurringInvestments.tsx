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

/** A stable, varied colour for a fund's SIP badge (brand-ish, from its scheme). */
const SIP_COLORS = ['#818cf8', '#f472b6', '#34d399', '#60a5fa', '#fbbf24', '#a78bfa', '#fb7185', '#22d3ee', '#f59e0b', '#4ade80'];
function fundColor(key: string | number): string {
  const s = String(key);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return SIP_COLORS[h % SIP_COLORS.length];
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
      icon="recurring"
      right={sips.length > 0 || fundSips.length > 0 ? <span className="ft-chip">{formatINR(monthlyTotal)}/mo</span> : undefined}
      collapsible
      defaultOpen={false}
    >
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
            const fc = fundColor(f.schemeCode ?? f.id);
            return (
              <div className={`ft-sip ft-mfsip ${!sip.active ? 'ft-sip--paused' : ''}`} key={f.id}>
                <div className="ft-mfsip__row">
                  <span className="ft-mfsip__icon" style={{ color: fc, background: `${fc}26` }}>
                    <AppIcon name="investments" size={16} />
                  </span>
                  <span className="ft-sip__title">
                    <span className="ft-sip__name">{f.name}</span>
                    <span className="ft-sip__meta">Monthly · Day {sip.dayOfMonth}{!sip.active && ' · paused'}</span>
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
                    className="ft-mfsip__btn"
                    title={sip.active ? 'Pause' : 'Resume'}
                    aria-label={sip.active ? 'Pause SIP' : 'Resume SIP'}
                    onPointerDown={(e) => e.preventDefault()}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => update((d) => { const fund = (d.mutualFunds ?? []).find((x) => x.id === f.id); if (fund?.sip) fund.sip.active = !fund.sip.active; })}
                  >
                    <AppIcon name={sip.active ? 'pause' : 'play'} size={15} />
                  </button>
                  <button
                    className="ft-mfsip__btn ft-mfsip__btn--del"
                    title="Stop this SIP"
                    aria-label="Stop this SIP"
                    onPointerDown={(e) => e.preventDefault()}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (confirm('Stop this recurring SIP? The fund stays on Pulse.')) {
                        update((d) => { const fund = (d.mutualFunds ?? []).find((x) => x.id === f.id); if (fund) fund.sip = undefined; });
                      }
                    }}
                  >
                    <AppIcon name="trash" size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}

      <button className="ft-addrec" onClick={addSip}>
        <span className="ft-addrec__icon"><AppIcon name="plus" size={18} /></span>
        <span className="ft-addrec__text">
          <span className="ft-addrec__title">Add recurring investment</span>
          <span className="ft-addrec__sub">Choose a fund and set your SIP</span>
        </span>
      </button>

      {fundSips.length > 0 && (
        <div className="ft-sipnote">
          <span className="ft-sipnote__icon"><AppIcon name="sparkle" size={16} /></span>
          <p className="ft-sipnote__text">Adjust a fund’s SIP amount here or on the Pulse tab — installments post automatically each month at that day’s NAV.</p>
        </div>
      )}
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
