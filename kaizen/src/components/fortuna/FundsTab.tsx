import { useCallback, useEffect, useRef, useState } from 'react';
import type { FortunaTabProps } from '../FortunaApp';
import type { MFCategory, MFTransaction, MutualFundHolding } from '../../types/models';
import { MF_CATEGORIES } from '../../types/models';
import { formatINR, newId, now } from '../../core/util';
import { fetchNavHistory, latestNav, searchSchemes, type SchemeMatch } from '../../core/amfi';
import { generateSipInstallments } from '../../core/mfSip';
import { byCategory, fundSummary, type ReturnSummary } from '../../core/mfReturns';
import AmountInput from '../AmountInput';
import AppIcon from '../AppIcon';

const catLabel = (c: MFCategory) => MF_CATEGORIES.find((x) => x.value === c)?.label ?? 'Other';

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtUnits(n: number): string {
  return (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
}
function fmtNav(n?: number): string {
  return n ? Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '—';
}
function fmtPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}
function todayInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A plain decimal input (units / NAV) — AmountInput is integer-rupees only. */
function DecimalInput({
  value,
  onChange,
  placeholder,
  className = 'input',
}: {
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
  className?: string;
}) {
  const [text, setText] = useState<string>(value ? String(value) : '');
  useEffect(() => {
    // Keep in sync when the external value changes (e.g. auto-fill), but don't
    // fight the user mid-edit.
    const parsed = parseFloat(text);
    if (!(Math.abs((parsed || 0) - (value || 0)) < 1e-9)) setText(value ? String(value) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      className={className}
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        const t = e.target.value.replace(/[^0-9.]/g, '');
        setText(t);
        const n = parseFloat(t);
        onChange(Number.isFinite(n) ? n : 0);
      }}
    />
  );
}

/** The XIRR / CAGR / absolute-return chips shown on a fund or a group. */
function ReturnPills({ s }: { s: ReturnSummary }) {
  const tone = (n: number | null) => (n == null ? '' : n >= 0 ? 'ft-mf__pos' : 'ft-mf__neg');
  return (
    <div className="ft-mf__returns">
      <span className={`ft-mf__pill ${tone(s.xirrPct)}`}>
        <b>XIRR</b> {fmtPct(s.xirrPct)}
      </span>
      <span className={`ft-mf__pill ${tone(s.cagrPct)}`}>
        <b>CAGR</b> {fmtPct(s.cagrPct)}
      </span>
      <span className={`ft-mf__pill ${tone(s.absReturnPct)}`}>
        <b>Abs</b> {fmtPct(s.absReturnPct)}
      </span>
    </div>
  );
}

export default function FundsTab({ plan, update }: FortunaTabProps) {
  const funds = plan.mutualFunds ?? [];
  const [status, setStatus] = useState<'idle' | 'syncing' | 'ok' | 'partial'>('idle');
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  // Always read the freshest funds inside async callbacks.
  const planRef = useRef(plan);
  planRef.current = plan;
  const didInitialSync = useRef(false);

  const syncAll = useCallback(
    async (force: boolean) => {
      const current = planRef.current.mutualFunds ?? [];
      if (!current.length) return;
      setStatus('syncing');
      setNote('');
      const results = await Promise.all(
        current.map(async (f) => {
          try {
            const points = await fetchNavHistory(f.schemeCode, force);
            const latest = latestNav(points);
            const newTxns = generateSipInstallments(f, points);
            return { id: f.id, ok: true as const, nav: latest?.nav, navDate: latest?.iso, newTxns };
          } catch {
            return { id: f.id, ok: false as const };
          }
        }),
      );
      update((draft) => {
        for (const r of results) {
          const f = (draft.mutualFunds ?? []).find((x) => x.id === r.id);
          if (!f || !r.ok) continue;
          if (r.nav != null) {
            f.latestNav = r.nav;
            f.latestNavDate = r.navDate;
          }
          if (r.newTxns && r.newTxns.length) {
            f.transactions.push(...r.newTxns);
            f.updatedAt = now();
          }
        }
      });
      const failed = results.filter((r) => !r.ok).length;
      const added = results.reduce((s, r) => s + (r.ok && r.newTxns ? r.newTxns.length : 0), 0);
      setStatus(failed ? 'partial' : 'ok');
      setNote(
        failed
          ? 'Some NAVs couldn’t update (offline?). Showing last known values.'
          : added
            ? `Updated NAVs · added ${added} SIP installment${added > 1 ? 's' : ''}.`
            : 'NAVs up to date.',
      );
    },
    [update],
  );

  useEffect(() => {
    if (!didInitialSync.current && funds.length) {
      didInitialSync.current = true;
      void syncAll(false);
    }
  }, [funds.length, syncAll]);

  const asOf = new Date();
  const { groups, total } = byCategory(funds, asOf);

  function addFund(match: SchemeMatch, category: MFCategory, sip?: { amount: number; dayOfMonth: number; startDate: string }) {
    const id = newId();
    const fund: MutualFundHolding = {
      id,
      schemeCode: match.schemeCode,
      name: match.schemeName,
      category,
      transactions: [],
      sip: sip && sip.amount > 0 ? { ...sip, active: true } : undefined,
      createdAt: now(),
      updatedAt: now(),
    };
    update((draft) => {
      (draft.mutualFunds ??= []).push(fund);
    });
    setAdding(false);
    setOpenId(id);
    // Backfill NAV + SIP installments right away.
    didInitialSync.current = true;
    setTimeout(() => void syncAll(false), 0);
  }

  return (
    <main className="app__body">
      <div className="page ft-mf">
        <div className="ft-mf__head">
          <div>
            <h2 className="ft-mf__h">Mutual funds</h2>
            <p className="ft-mf__sub">Auto-valued from AMFI NAVs · returns are money-weighted (XIRR)</p>
          </div>
          <button
            className="iconbtn ft-mf__refresh"
            title="Refresh NAVs"
            aria-label="Refresh NAVs"
            disabled={status === 'syncing' || !funds.length}
            onClick={() => void syncAll(true)}
          >
            <AppIcon name="recurring" size={18} className={status === 'syncing' ? 'ft-mf__spin' : ''} />
          </button>
        </div>

        {funds.length > 0 && (
          <div className="ft-mf__total">
            <div className="ft-mf__totalrow">
              <span>Current value</span>
              <b>{formatINR(total.currentValue)}</b>
            </div>
            <div className="ft-mf__totalrow ft-mf__muted">
              <span>Invested</span>
              <span>{formatINR(total.invested)}</span>
            </div>
            <div className={`ft-mf__totalrow ${total.gain >= 0 ? 'ft-mf__pos' : 'ft-mf__neg'}`}>
              <span>Gain</span>
              <span>
                {total.gain >= 0 ? '+' : ''}
                {formatINR(total.gain)}
              </span>
            </div>
            <ReturnPills s={total} />
          </div>
        )}

        {note && <p className={`ft-mf__note ${status === 'partial' ? 'ft-mf__note--warn' : ''}`}>{note}</p>}

        {funds.length === 0 && !adding && (
          <div className="ft-mf__empty">
            <AppIcon name="investments" size={30} />
            <p>Track your mutual funds with live NAVs and true XIRR/CAGR returns — set a SIP and Fortuna fills in each month’s units automatically.</p>
          </div>
        )}

        {groups.map((g) => (
          <div className="ft-mf__group" key={g.key}>
            <div className="ft-mf__grouphead">
              <span className="ft-mf__cat">{catLabel(g.key)}</span>
              <span className="ft-mf__groupval">{formatINR(g.summary.currentValue)}</span>
            </div>
            <div className="ft-mf__grouppills">
              <ReturnPills s={g.summary} />
            </div>
            {g.funds.map((f) => (
              <FundCard
                key={f.id}
                fund={f}
                summary={fundSummary(f, asOf)}
                open={openId === f.id}
                onToggle={() => setOpenId((id) => (id === f.id ? null : f.id))}
                update={update}
              />
            ))}
          </div>
        ))}

        {adding ? (
          <AddFund onCancel={() => setAdding(false)} onAdd={addFund} existing={funds.map((f) => f.schemeCode)} />
        ) : (
          <button className="btn ft-addclass" onClick={() => setAdding(true)}>
            <AppIcon name="plus" size={18} /> Add mutual fund
          </button>
        )}
      </div>
    </main>
  );
}

// --- one fund card ---------------------------------------------------------

function FundCard({
  fund,
  summary,
  open,
  onToggle,
  update,
}: {
  fund: MutualFundHolding;
  summary: ReturnSummary;
  open: boolean;
  onToggle: () => void;
  update: FortunaTabProps['update'];
}) {
  function mutate(fn: (f: MutualFundHolding) => void) {
    update((draft) => {
      const f = (draft.mutualFunds ?? []).find((x) => x.id === fund.id);
      if (f) {
        fn(f);
        f.updatedAt = now();
      }
    });
  }

  function addLumpsum() {
    const nav = fund.latestNav || 0;
    mutate((f) =>
      f.transactions.push({
        id: newId(),
        date: new Date().toISOString(),
        amount: 0,
        units: 0,
        nav,
        kind: 'lumpsum',
      }),
    );
  }

  const sortedTxns = [...fund.transactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  return (
    <div className="ft-mf__fund">
      <button className="ft-mf__fundhead" onClick={onToggle}>
        <span className="ft-mf__fundname">
          {fund.name}
          <span className="ft-mf__fundmeta">
            {fmtUnits(summary.units)} units · NAV {fmtNav(fund.latestNav)}
            {fund.sip?.active ? ` · SIP ${formatINR(fund.sip.amount)}/mo` : ''}
          </span>
        </span>
        <span className="ft-mf__fundright">
          <b>{formatINR(summary.currentValue)}</b>
          <span className={summary.absReturnPct != null && summary.absReturnPct >= 0 ? 'ft-mf__pos' : 'ft-mf__neg'}>
            {fmtPct(summary.xirrPct)} XIRR
          </span>
        </span>
        <AppIcon name={open ? 'chevronUp' : 'chevronDown'} size={16} className="ft-mf__chev" />
      </button>

      {open && (
        <div className="ft-mf__fundbody">
          <div className="ft-mf__stats">
            <div>
              <span>Invested</span>
              <b>{formatINR(summary.invested)}</b>
            </div>
            <div>
              <span>Value</span>
              <b>{formatINR(summary.currentValue)}</b>
            </div>
            <div className={summary.gain >= 0 ? 'ft-mf__pos' : 'ft-mf__neg'}>
              <span>Gain</span>
              <b>
                {summary.gain >= 0 ? '+' : ''}
                {formatINR(summary.gain)}
              </b>
            </div>
          </div>
          <ReturnPills s={summary} />

          <SipEditor fund={fund} mutate={mutate} />

          <div className="ft-mf__txnhead">
            <span>Transactions</span>
            <span className="ft-mf__navdate">NAV as of {fmtDate(fund.latestNavDate)}</span>
          </div>
          {sortedTxns.length === 0 && <p className="ft-mf__hint">No transactions yet. Set a SIP above, or add a lumpsum.</p>}
          {sortedTxns.map((t) => (
            <TxnRow
              key={t.id}
              txn={t}
              onChange={(patch) =>
                mutate((f) => {
                  const row = f.transactions.find((x) => x.id === t.id);
                  if (row) {
                    Object.assign(row, patch);
                    row.auto = false; // a manual correction is no longer "auto"
                  }
                })
              }
              onDelete={() => mutate((f) => { f.transactions = f.transactions.filter((x) => x.id !== t.id); })}
            />
          ))}

          <div className="ft-mf__fundactions">
            <button className="ft-addrow" onClick={addLumpsum}>
              <AppIcon name="plus" size={16} /> Add lumpsum
            </button>
            <button
              className="ft-mf__del"
              onClick={() => update((draft) => { draft.mutualFunds = (draft.mutualFunds ?? []).filter((x) => x.id !== fund.id); })}
            >
              <AppIcon name="trash" size={14} /> Remove fund
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SipEditor({ fund, mutate }: { fund: MutualFundHolding; mutate: (fn: (f: MutualFundHolding) => void) => void }) {
  const sip = fund.sip;
  return (
    <div className="ft-mf__sip">
      <div className="ft-mf__siprow">
        <span className="ft-mf__siplabel">Monthly SIP</span>
        <label className="ft-mf__sipactive">
          <input
            type="checkbox"
            checked={!!sip?.active}
            onChange={(e) =>
              mutate((f) => {
                if (!f.sip) f.sip = { amount: 0, dayOfMonth: 1, startDate: new Date().toISOString(), active: e.target.checked };
                else f.sip.active = e.target.checked;
              })
            }
          />
          {sip?.active ? 'On' : 'Off'}
        </label>
      </div>
      {(sip?.active || sip) && (
        <div className="ft-mf__sipfields">
          <label>
            <span>Amount</span>
            <AmountInput
              className="input"
              value={sip?.amount ?? 0}
              onChange={(v) => mutate((f) => { (f.sip ??= { amount: 0, dayOfMonth: 1, startDate: new Date().toISOString(), active: true }).amount = v; })}
              placeholder="0"
            />
          </label>
          <label>
            <span>Day</span>
            <input
              className="input"
              type="number"
              min={1}
              max={28}
              value={sip?.dayOfMonth ?? 1}
              onChange={(e) =>
                mutate((f) => {
                  const day = Math.min(28, Math.max(1, parseInt(e.target.value, 10) || 1));
                  (f.sip ??= { amount: 0, dayOfMonth: 1, startDate: new Date().toISOString(), active: true }).dayOfMonth = day;
                })
              }
            />
          </label>
          <label>
            <span>Start</span>
            <input
              className="input"
              type="date"
              value={(sip?.startDate ?? new Date().toISOString()).slice(0, 10)}
              max={todayInput()}
              onChange={(e) =>
                mutate((f) => {
                  const iso = new Date(e.target.value + 'T00:00:00').toISOString();
                  (f.sip ??= { amount: 0, dayOfMonth: 1, startDate: iso, active: true }).startDate = iso;
                })
              }
            />
          </label>
        </div>
      )}
      <p className="ft-mf__hint">Installments auto-fill from the start date using each month’s NAV. Refresh to catch up.</p>
    </div>
  );
}

function TxnRow({ txn, onChange, onDelete }: { txn: MFTransaction; onChange: (patch: Partial<MFTransaction>) => void; onDelete: () => void }) {
  return (
    <div className={`ft-mf__txn ${txn.auto ? 'ft-mf__txn--auto' : ''}`}>
      <input
        className="input ft-mf__txndate"
        type="date"
        value={txn.date.slice(0, 10)}
        max={todayInput()}
        onChange={(e) => onChange({ date: new Date(e.target.value + 'T00:00:00').toISOString() })}
      />
      <label className="ft-mf__txnf">
        <span>₹ Amount</span>
        <AmountInput className="input" value={txn.amount} onChange={(v) => onChange({ amount: v })} placeholder="0" />
      </label>
      <label className="ft-mf__txnf">
        <span>NAV</span>
        <DecimalInput value={txn.nav} onChange={(v) => onChange({ nav: v })} placeholder="0" />
      </label>
      <label className="ft-mf__txnf">
        <span>Units</span>
        <DecimalInput value={txn.units} onChange={(v) => onChange({ units: v })} placeholder="0" />
      </label>
      <button
        className="iconbtn ft-mf__txndel"
        title="Delete"
        aria-label="Delete transaction"
        onPointerDown={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onDelete}
      >
        <AppIcon name="trash" size={15} />
      </button>
    </div>
  );
}

// --- add-fund flow ---------------------------------------------------------

function AddFund({
  onCancel,
  onAdd,
  existing,
}: {
  onCancel: () => void;
  onAdd: (m: SchemeMatch, cat: MFCategory, sip?: { amount: number; dayOfMonth: number; startDate: string }) => void;
  existing: number[];
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SchemeMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState('');
  const [picked, setPicked] = useState<SchemeMatch | null>(null);
  const [category, setCategory] = useState<MFCategory>('flexicap');
  const [sipAmount, setSipAmount] = useState(0);
  const [sipDay, setSipDay] = useState(1);
  const [sipStart, setSipStart] = useState(todayInput());
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (picked) return;
    if (debounce.current) clearTimeout(debounce.current);
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      setErr('');
      try {
        const r = await searchSchemes(query);
        setResults(r.slice(0, 25));
      } catch {
        setErr('Couldn’t search AMFI (offline?). Try again.');
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, picked]);

  if (picked) {
    return (
      <div className="ft-mf__add">
        <div className="ft-mf__addpicked">
          <b>{picked.schemeName}</b>
          <button className="ft-mf__link" onClick={() => setPicked(null)}>
            Change
          </button>
        </div>
        <label className="ft-mf__addf">
          <span>Category</span>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value as MFCategory)}>
            {MF_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <div className="ft-mf__addsip">
          <div className="ft-mf__siplabel">Monthly SIP (optional — leave amount 0 for a lumpsum-only fund)</div>
          <div className="ft-mf__sipfields">
            <label>
              <span>Amount</span>
              <AmountInput className="input" value={sipAmount} onChange={setSipAmount} placeholder="0" />
            </label>
            <label>
              <span>Day</span>
              <input className="input" type="number" min={1} max={28} value={sipDay} onChange={(e) => setSipDay(Math.min(28, Math.max(1, parseInt(e.target.value, 10) || 1)))} />
            </label>
            <label>
              <span>Start</span>
              <input className="input" type="date" value={sipStart} max={todayInput()} onChange={(e) => setSipStart(e.target.value)} />
            </label>
          </div>
        </div>
        <div className="ft-mf__addactions">
          <button className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn"
            onClick={() =>
              onAdd(
                picked,
                category,
                sipAmount > 0 ? { amount: sipAmount, dayOfMonth: sipDay, startDate: new Date(sipStart + 'T00:00:00').toISOString() } : undefined,
              )
            }
          >
            Add fund
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ft-mf__add">
      <input
        className="input"
        value={query}
        autoFocus
        placeholder="Search fund name (e.g. Parag Parikh Flexi Cap Direct)"
        onChange={(e) => setQuery(e.target.value)}
      />
      {searching && <p className="ft-mf__hint">Searching…</p>}
      {err && <p className="ft-mf__note ft-mf__note--warn">{err}</p>}
      <div className="ft-mf__results">
        {results.map((r) => {
          const already = existing.includes(r.schemeCode);
          return (
            <button key={r.schemeCode} className="ft-mf__result" disabled={already} onClick={() => setPicked(r)}>
              <span>{r.schemeName}</span>
              {already && <span className="ft-mf__added">Added</span>}
            </button>
          );
        })}
      </div>
      <button className="btn btn--ghost ft-btn--full" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
