import { useEffect, useMemo, useState } from 'react';
import type { FortunaTabProps } from '../FortunaApp';
import type { MFTransaction, MutualFundHolding } from '../../types/models';
import { formatINR, newId, now } from '../../core/util';
import AmountInput from '../AmountInput';
import AppIcon from '../AppIcon';

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtUnits(n: number): string {
  return (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
}
function todayInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A decimal input (units / NAV) backed by local text so a trailing "." isn't lost. */
function DecimalInput({ value, onChange, placeholder }: { value: number; onChange: (v: number) => void; placeholder?: string }) {
  const [text, setText] = useState(value ? String(value) : '');
  useEffect(() => {
    const parsed = parseFloat(text);
    if (!(Math.abs((parsed || 0) - (value || 0)) < 1e-9)) setText(value ? String(value) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      className="input"
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        const t = e.target.value.replace(/[^0-9.]/g, '');
        setText(t);
        const n = parseFloat(t);
        onChange(Number.isFinite(n) ? n : 0);
      }}
    />
  );
}

interface LedgerRow extends MFTransaction {
  fundId: string;
  fundName: string;
}

export default function TransactionsTab({ plan, update }: FortunaTabProps) {
  const funds = plan.mutualFunds ?? [];
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const rows = useMemo<LedgerRow[]>(
    () =>
      funds
        .flatMap((f) => f.transactions.map((t) => ({ ...t, fundId: f.id, fundName: f.name })))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [funds],
  );

  const invested = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  function editTxn(fundId: string, txnId: string, patch: Partial<MFTransaction>) {
    update((d) => {
      const f = (d.mutualFunds ?? []).find((x) => x.id === fundId);
      const t = f?.transactions.find((x) => x.id === txnId);
      if (t) {
        Object.assign(t, patch);
        t.auto = false;
        if (f) f.updatedAt = now();
      }
    });
  }
  function deleteTxn(fundId: string, txnId: string) {
    update((d) => {
      const f = (d.mutualFunds ?? []).find((x) => x.id === fundId);
      if (f) f.transactions = f.transactions.filter((x) => x.id !== txnId);
    });
  }

  return (
    <main className="app__body">
      <div className="page ft-mf">
        <div className="ft-mf__head">
          <div>
            <h2 className="ft-mf__h">Transactions</h2>
            <p className="ft-mf__sub">Every mutual-fund buy — the ledger the Pulse tab computes returns from</p>
          </div>
        </div>

        {funds.length === 0 ? (
          <div className="ft-mf__empty">
            <AppIcon name="investments" size={30} />
            <p>Add your mutual funds on the Pulse tab first — each fund’s buys (initial holding + SIP installments) show up here.</p>
          </div>
        ) : (
          <>
            <div className="ft-mf__total">
              <div className="ft-mf__totalrow">
                <span>Total invested (all buys)</span>
                <b>{formatINR(invested)}</b>
              </div>
              <div className="ft-mf__totalrow ft-mf__muted">
                <span>Entries</span>
                <span>{rows.length}</span>
              </div>
            </div>

            {rows.map((r) => (
              <div className={`ft-mf__fund ${r.auto ? 'ft-mf__txn--auto' : ''}`} key={r.id}>
                <button className="ft-mf__fundhead" onClick={() => setOpenId((id) => (id === r.id ? null : r.id))}>
                  <span className="ft-mf__fundname">
                    {r.fundName}
                    <span className="ft-mf__fundmeta">
                      {fmtDate(r.date)} · {r.kind === 'sip' ? 'SIP' : 'Lumpsum'} · {fmtUnits(r.units)} units @ ₹{r.nav}
                    </span>
                  </span>
                  <span className="ft-mf__fundright">
                    <b>{formatINR(r.amount)}</b>
                  </span>
                  <AppIcon name={openId === r.id ? 'chevronUp' : 'chevronDown'} size={16} className="ft-mf__chev" />
                </button>
                {openId === r.id && (
                  <div className="ft-mf__fundbody">
                    <div className="ft-mf__txn">
                      <input
                        className="input ft-mf__txndate"
                        type="date"
                        value={r.date.slice(0, 10)}
                        max={todayInput()}
                        onChange={(e) => editTxn(r.fundId, r.id, { date: new Date(e.target.value + 'T00:00:00').toISOString() })}
                      />
                      <label className="ft-mf__txnf">
                        <span>₹ Amount</span>
                        <AmountInput className="input" value={r.amount} onChange={(v) => editTxn(r.fundId, r.id, { amount: v })} placeholder="0" />
                      </label>
                      <label className="ft-mf__txnf">
                        <span>NAV</span>
                        <DecimalInput value={r.nav} onChange={(v) => editTxn(r.fundId, r.id, { nav: v })} placeholder="0" />
                      </label>
                      <label className="ft-mf__txnf">
                        <span>Units</span>
                        <DecimalInput value={r.units} onChange={(v) => editTxn(r.fundId, r.id, { units: v })} placeholder="0" />
                      </label>
                      <button
                        className="iconbtn ft-mf__txndel"
                        title="Delete"
                        aria-label="Delete transaction"
                        onPointerDown={(e) => e.preventDefault()}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => deleteTxn(r.fundId, r.id)}
                      >
                        <AppIcon name="trash" size={15} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {adding ? (
              <AddTxn funds={funds} onCancel={() => setAdding(false)} onAdd={(fundId, txn) => { update((d) => { const f = (d.mutualFunds ?? []).find((x) => x.id === fundId); if (f) { f.transactions.push(txn); f.updatedAt = now(); } }); setAdding(false); }} />
            ) : (
              <button className="btn ft-addclass" onClick={() => setAdding(true)}>
                <AppIcon name="plus" size={18} /> Add transaction
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function AddTxn({ funds, onCancel, onAdd }: { funds: MutualFundHolding[]; onCancel: () => void; onAdd: (fundId: string, txn: MFTransaction) => void }) {
  const [fundId, setFundId] = useState(funds[0]?.id ?? '');
  const [date, setDate] = useState(todayInput());
  const [amount, setAmount] = useState(0);
  const [nav, setNav] = useState(0);
  const [units, setUnits] = useState(0);
  const [kind, setKind] = useState<'sip' | 'lumpsum'>('lumpsum');

  return (
    <div className="ft-mf__add">
      <label className="ft-mf__addf">
        <span>Fund</span>
        <select className="input" value={fundId} onChange={(e) => setFundId(e.target.value)}>
          {funds.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <div className="ft-mf__sipfields">
        <label>
          <span>Date</span>
          <input className="input" type="date" value={date} max={todayInput()} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          <span>Kind</span>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as 'sip' | 'lumpsum')}>
            <option value="lumpsum">Lumpsum</option>
            <option value="sip">SIP</option>
          </select>
        </label>
      </div>
      <div className="ft-mf__sipfields">
        <label>
          <span>₹ Amount</span>
          <AmountInput className="input" value={amount} onChange={setAmount} placeholder="0" />
        </label>
        <label>
          <span>NAV</span>
          <DecimalInput value={nav} onChange={setNav} placeholder="0" />
        </label>
        <label>
          <span>Units</span>
          <DecimalInput value={units} onChange={setUnits} placeholder="0" />
        </label>
      </div>
      <div className="ft-mf__addactions">
        <button className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn"
          disabled={!fundId}
          onClick={() =>
            onAdd(fundId, {
              id: newId(),
              date: new Date(date + 'T00:00:00').toISOString(),
              amount,
              units: units || (nav > 0 ? amount / nav : 0),
              nav,
              kind,
            })
          }
        >
          Add
        </button>
      </div>
    </div>
  );
}
