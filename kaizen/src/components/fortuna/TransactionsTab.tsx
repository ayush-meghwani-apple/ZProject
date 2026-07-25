import { useEffect, useMemo, useRef, useState } from 'react';
import type { FortunaTabProps } from '../FortunaApp';
import type { LedgerEntry, LedgerKind, MFCategory, MFTransaction, MutualFundHolding } from '../../types/models';
import { MF_CATEGORIES } from '../../types/models';
import { formatINR, newId, now } from '../../core/util';
import {
  assignableClasses,
  assignableSubcats,
  classLabel,
  editPosition,
  removeEntryHolding,
  syncEntryHolding,
  type PositionSource,
} from '../../core/ledger';
import { searchSchemes, type SchemeMatch } from '../../core/amfi';
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
const mfCatLabel = (c: string) => MF_CATEGORIES.find((x) => x.value === c)?.label ?? 'Other';

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

/** One unified ledger line — either a mutual-fund buy or a general asset entry. */
/** One unified ledger line — a mutual-fund buy, a general asset entry, or a
 *  read-only current position from the Portfolio. */
interface UnifiedRow {
  id: string;
  source: 'mf' | 'ledger' | 'holding';
  date: string;
  name: string;
  classKey: string; // asset class this belongs to
  isMF: boolean; // is a mutual fund (for the "All mutual funds" filter)
  groupKey: string; // 'mf:largecap' | 'cls:gold'
  groupLabel: string;
  amount: number;
  units: number;
  nav?: number;
  isSip: boolean;
  isSell: boolean;
  auto: boolean;
  reviewed: boolean;
  fundId?: string;
  entryId?: string;
  /** For read-only Portfolio positions: where the value lives, so it can be
   *  edited in place from the Ledger. */
  posSource?: PositionSource;
}

const BUILTIN_CLASS_LABEL: Record<string, string> = {
  domestic_equity: 'Equity stocks',
  equity_mf: 'Equity mutual funds',
  us_equity: 'US equity',
  debt: 'Debt',
  gold: 'Gold',
  crypto: 'Crypto',
  real_estate: 'Real estate',
};

export default function TransactionsTab({ plan, update }: FortunaTabProps) {
  const funds = plan.mutualFunds ?? [];
  const ledger = plan.ledger ?? [];
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<string>('all'); // 'all' | groupKey

  const rows = useMemo<UnifiedRow[]>(() => {
    const mfRows: UnifiedRow[] = funds.flatMap((f) =>
      f.transactions.map((t) => ({
        id: t.id,
        source: 'mf' as const,
        date: t.date,
        name: f.name,
        classKey: f.category === 'debt' ? 'debt' : 'equity_mf',
        isMF: true,
        groupKey: `mf:${f.category}`,
        groupLabel: mfCatLabel(f.category),
        amount: Number(t.amount) || 0,
        units: Number(t.units) || 0,
        nav: t.nav,
        isSip: t.kind === 'sip',
        isSell: false,
        auto: t.auto === true,
        reviewed: t.reviewed === true,
        fundId: f.id,
      })),
    );
    const genRows: UnifiedRow[] = ledger.map((e) => ({
      id: e.id,
      source: 'ledger' as const,
      date: e.date,
      name: e.name,
      classKey: e.assetClassKey,
      isMF: false,
      groupKey: `cls:${e.assetClassKey}`,
      groupLabel: classLabel(plan, e.assetClassKey),
      amount: Number(e.amount) || 0,
      units: Number(e.units) || 0,
      isSip: e.kind === 'sip',
      isSell: e.kind === 'sell',
      auto: e.auto === true,
      reviewed: e.reviewed === true,
      entryId: e.id,
    }));

    // Read-only current positions from the Portfolio, so the ledger reflects the
    // WHOLE portfolio (stocks, gold, FDs, EPF, REITs…), not just fund buys.
    const a = plan.assets;
    const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const holdRows: UnifiedRow[] = [];
    let hid = 0;
    const pos = (classKey: string, name: string, value: number, source: PositionSource, units = 0, isMF = false) => {
      if (!(value > 0)) return;
      holdRows.push({
        id: `hold:${hid++}`,
        source: 'holding',
        date: '',
        name,
        classKey,
        isMF,
        groupKey: `cls:${classKey}`,
        groupLabel: classLabel(plan, classKey),
        amount: value,
        units,
        isSip: false,
        isSell: false,
        auto: false,
        reviewed: true,
        posSource: source,
      });
    };
    const rowSrc = (classKey: string, array: string, id: string): PositionSource => ({ kind: 'row', classKey, array, id });
    const scalar = (path: string): PositionSource => ({ kind: 'scalar', path });
    for (const r of a.domesticEquity.stocks) pos('domestic_equity', r.name || 'Stock', num(r.value), rowSrc('domestic_equity', 'domesticEquity.stocks', r.id), num(r.units));
    for (const r of a.domesticEquity.mutualFunds) pos('equity_mf', r.name || 'Fund', num(r.value), rowSrc('equity_mf', 'domesticEquity.mutualFunds', r.id), num(r.units), true);
    if (num(a.misc.smallcase) > 0) pos('domestic_equity', 'Smallcase', num(a.misc.smallcase), scalar('misc.smallcase'));
    if (num(a.misc.ulips) > 0) pos('domestic_equity', 'ULIPs / insurance', num(a.misc.ulips), scalar('misc.ulips'));
    for (const r of a.usEquity.others) pos('us_equity', r.name || 'US holding', num(r.value), rowSrc('us_equity', 'usEquity.others', r.id), num(r.units));
    if (num(a.debt.liquidCash) > 0) pos('debt', 'Liquid / cash', num(a.debt.liquidCash), scalar('debt.liquidCash'));
    for (const r of a.debt.fds) pos('debt', r.name || 'FD', num(r.value), rowSrc('debt', 'debt.fds', r.id));
    for (const r of a.debt.debtFunds) pos('debt', r.name || 'Debt fund', num(r.value), rowSrc('debt', 'debt.debtFunds', r.id), num(r.units), true);
    for (const r of a.debt.epfPpfVpf) pos('debt', r.name || 'EPF / PPF', num(r.value), rowSrc('debt', 'debt.epfPpfVpf', r.id));
    if (num(a.gold.goldEtf) > 0) pos('gold', 'Gold ETF', num(a.gold.goldEtf), scalar('gold.goldEtf'));
    if (num(a.gold.jewellery) > 0) pos('gold', 'Jewellery', num(a.gold.jewellery), scalar('gold.jewellery'));
    if (num(a.gold.sgb) > 0) pos('gold', 'SGB', num(a.gold.sgb), scalar('gold.sgb'));
    for (const r of a.gold.others) pos('gold', r.name || 'Gold', num(r.value), rowSrc('gold', 'gold.others', r.id));
    if (num(a.crypto.crypto) > 0) pos('crypto', 'Crypto', num(a.crypto.crypto), scalar('crypto.crypto'));
    for (const r of a.crypto.others) pos('crypto', r.name || 'Crypto', num(r.value), rowSrc('crypto', 'crypto.others', r.id));
    if (num(a.realEstate.home) > 0) pos('real_estate', 'Home', num(a.realEstate.home), scalar('realEstate.home'));
    if (num(a.realEstate.otherRealEstate) > 0) pos('real_estate', 'Other real estate', num(a.realEstate.otherRealEstate), scalar('realEstate.otherRealEstate'));
    if (num(a.realEstate.reits) > 0) pos('real_estate', 'REITs', num(a.realEstate.reits), scalar('realEstate.reits'));
    for (const r of a.realEstate.others) pos('real_estate', r.name || 'Property', num(r.value), rowSrc('real_estate', 'realEstate.others', r.id));
    for (const c of plan.customClasses ?? []) for (const r of c.holdings) pos(c.id, r.name || 'Holding', num(r.value), rowSrc(c.id, `custom:${c.id}`, r.id), num(r.units));

    const ts = (r: UnifiedRow) => {
      const t = new Date(r.date).getTime();
      return Number.isFinite(t) ? t : -Infinity; // undated positions sink below dated txns
    };
    return [...mfRows, ...genRows, ...holdRows].sort((x, y) => ts(y) - ts(x));
  }, [funds, ledger, plan]);

  // Dropdown filter options: All, All mutual funds, per asset class, per MF cap.
  const filterOptions = useMemo(() => {
    const opts: { key: string; label: string }[] = [{ key: 'all', label: 'All transactions' }];
    if (rows.some((r) => r.isMF)) opts.push({ key: 'mf', label: 'All mutual funds' });
    const classes = new Map<string, string>();
    for (const r of rows) if (r.classKey && !classes.has(r.classKey)) classes.set(r.classKey, BUILTIN_CLASS_LABEL[r.classKey] ?? classLabel(plan, r.classKey));
    for (const [k, l] of classes) opts.push({ key: `cls:${k}`, label: `All ${l.toLowerCase()}` });
    const caps = new Map<string, string>();
    for (const r of rows) if (r.isMF && r.groupKey.startsWith('mf:') && !caps.has(r.groupKey)) caps.set(r.groupKey, r.groupLabel);
    for (const [k, l] of caps) opts.push({ key: k, label: l });
    return opts;
  }, [rows, plan]);

  const shown = rows.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'mf') return r.isMF;
    if (filter.startsWith('cls:')) return r.classKey === filter.slice(4);
    return r.groupKey === filter;
  });
  const invested = shown.reduce((s, r) => (r.source === 'holding' ? s : s + (r.isSell ? -r.amount : r.amount)), 0);
  const needsReview = rows.filter((r) => r.auto && !r.reviewed).length;
  const matchCount = (key: string) =>
    key === 'all'
      ? rows.length
      : rows.filter((r) => (key === 'mf' ? r.isMF : key.startsWith('cls:') ? r.classKey === key.slice(4) : r.groupKey === key)).length;

  // ---- mutations ----------------------------------------------------------
  function editTxn(fundId: string, txnId: string, patch: Partial<MFTransaction>) {
    update((d) => {
      const f = (d.mutualFunds ?? []).find((x) => x.id === fundId);
      const t = f?.transactions.find((x) => x.id === txnId);
      if (t) {
        Object.assign(t, patch);
        t.auto = false; // a manual edit takes the buy out of auto-management
        if (f) f.updatedAt = now();
      }
    });
  }
  function reviewRow(row: UnifiedRow) {
    update((d) => {
      if (row.source === 'mf') {
        const f = (d.mutualFunds ?? []).find((x) => x.id === row.fundId);
        const t = f?.transactions.find((x) => x.id === row.id);
        if (t) t.reviewed = true; // keep `auto` so the SIP stays auto-managed
      } else {
        const e = (d.ledger ?? []).find((x) => x.id === row.entryId);
        if (e) e.reviewed = true;
      }
    });
  }
  function deleteRow(row: UnifiedRow) {
    update((d) => {
      if (row.source === 'mf') {
        const f = (d.mutualFunds ?? []).find((x) => x.id === row.fundId);
        if (f) f.transactions = f.transactions.filter((x) => x.id !== row.id);
      } else {
        const e = (d.ledger ?? []).find((x) => x.id === row.entryId);
        if (e) removeEntryHolding(d, e);
        d.ledger = (d.ledger ?? []).filter((x) => x.id !== row.entryId);
      }
    });
    setOpenId(null);
  }
  function editEntry(entryId: string, patch: Partial<LedgerEntry>) {
    update((d) => {
      const e = (d.ledger ?? []).find((x) => x.id === entryId);
      if (!e) return;
      Object.assign(e, patch);
      e.reviewed = true; // editing acknowledges it
      e.updatedAt = now();
      syncEntryHolding(d, e); // keep the linked portfolio holding in step
    });
  }
  function editPos(source: PositionSource, patch: { name?: string; value?: number; units?: number }) {
    update((d) => editPosition(d, source, patch));
  }

  return (
    <main className="app__body">
      <div className="page ft-mf">
        <div className="ft-mf__head">
          <div>
            <h2 className="ft-mf__h">Ledger</h2>
            <p className="ft-mf__sub">Every investment transaction across your portfolio · mutual funds feed the Pulse tab</p>
          </div>
        </div>

        {rows.length === 0 && !adding ? (
          <div className="ft-mf__empty">
            <AppIcon name="table" size={30} />
            <p>No transactions yet. Add a mutual-fund buy (from the Pulse tab, or here) or record any other asset — a gold coin, a US stock, an FD — and it updates your Portfolio.</p>
          </div>
        ) : (
          <>
            <div className="ft-mf__total">
              <div className="ft-mf__totalrow">
                <span>{filter === 'all' ? 'Net invested (all buys)' : 'Net invested (filtered)'}</span>
                <b>{formatINR(invested)}</b>
              </div>
              <div className="ft-mf__totalrow ft-mf__muted">
                <span>Entries</span>
                <span>{shown.length}</span>
              </div>
              {needsReview > 0 && (
                <div className="ft-mf__totalrow ft-led__reviewnote">
                  <span>
                    <AppIcon name="reviewed" size={13} /> {needsReview} auto-added {needsReview === 1 ? 'entry' : 'entries'} to review
                  </span>
                </div>
              )}
            </div>

            {filterOptions.length > 2 && (
              <div className="ft-led__filterbar">
                <select className="input ft-led__filtersel" value={filter} onChange={(e) => setFilter(e.target.value)}>
                  {filterOptions.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label} ({matchCount(o.key)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {shown.map((r) => {
              const review = r.auto && !r.reviewed;
              const isPos = r.source === 'holding';
              return (
                <div className={`ft-led__item ${review ? 'ft-led__item--review' : ''} ${isPos ? 'ft-led__item--pos' : ''}`} key={r.id}>
                  <div className="ft-led__row">
                    <button className="ft-led__main" onClick={() => setOpenId((id) => (id === r.id ? null : r.id))}>
                      {r.isSip && (
                        <span className="ft-led__badge ft-led__badge--sip" title="SIP installment">
                          <AppIcon name="recurring" size={12} />
                        </span>
                      )}
                      <span className="ft-led__name">
                        {r.name}
                        <span className="ft-led__meta">
                          {isPos ? 'Position' : fmtDate(r.date)} · {r.groupLabel}
                          {r.units > 0 ? ` · ${fmtUnits(r.units)} units` : ''}
                          {r.nav ? ` @ ₹${r.nav}` : ''}
                          {r.isSell ? ' · Sell' : ''}
                        </span>
                      </span>
                      <b className={`ft-led__amt ${r.isSell ? 'ft-mf__neg' : ''}`}>
                        {r.isSell ? '−' : ''}
                        {formatINR(r.amount)}
                      </b>
                      <AppIcon name={openId === r.id ? 'chevronUp' : 'chevronDown'} size={16} className="ft-mf__chev" />
                    </button>
                    {review && (
                      <button
                        className="iconbtn ft-led__review"
                        title="Mark reviewed"
                        aria-label="Mark reviewed"
                        onPointerDown={(e) => e.preventDefault()}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => reviewRow(r)}
                      >
                        <AppIcon name="reviewed" size={18} />
                      </button>
                    )}
                  </div>

                  {openId === r.id && !isPos && (
                    <div className="ft-mf__fundbody">
                      {r.source === 'mf' ? (
                        <div className="ft-mf__txn">
                          <input
                            className="input ft-mf__txndate"
                            type="date"
                            value={r.date.slice(0, 10)}
                            max={todayInput()}
                            onChange={(e) => editTxn(r.fundId!, r.id, { date: new Date(e.target.value + 'T00:00:00').toISOString() })}
                          />
                          <label className="ft-mf__txnf">
                            <span>₹ Amount</span>
                            <AmountInput className="input" value={r.amount} onChange={(v) => editTxn(r.fundId!, r.id, { amount: v })} placeholder="0" />
                          </label>
                          <label className="ft-mf__txnf">
                            <span>NAV</span>
                            <DecimalInput value={r.nav ?? 0} onChange={(v) => editTxn(r.fundId!, r.id, { nav: v })} placeholder="0" />
                          </label>
                          <label className="ft-mf__txnf">
                            <span>Units</span>
                            <DecimalInput value={r.units} onChange={(v) => editTxn(r.fundId!, r.id, { units: v })} placeholder="0" />
                          </label>
                          <button
                            className="iconbtn ft-mf__txndel"
                            title="Delete"
                            aria-label="Delete transaction"
                            onPointerDown={(e) => e.preventDefault()}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => deleteRow(r)}
                          >
                            <AppIcon name="trash" size={15} />
                          </button>
                        </div>
                      ) : (
                        <div className="ft-mf__txn">
                          <input
                            className="input ft-mf__txndate"
                            type="date"
                            value={r.date.slice(0, 10)}
                            max={todayInput()}
                            onChange={(e) => editEntry(r.entryId!, { date: new Date(e.target.value + 'T00:00:00').toISOString() })}
                          />
                          <label className="ft-mf__txnf ft-led__txnname">
                            <span>Name</span>
                            <input className="input" value={r.name} onChange={(e) => editEntry(r.entryId!, { name: e.target.value })} />
                          </label>
                          <label className="ft-mf__txnf">
                            <span>₹ Amount</span>
                            <AmountInput className="input" value={r.amount} onChange={(v) => editEntry(r.entryId!, { amount: v })} placeholder="0" />
                          </label>
                          <label className="ft-mf__txnf">
                            <span>Units (optional)</span>
                            <DecimalInput value={r.units} onChange={(v) => editEntry(r.entryId!, { units: v || undefined })} placeholder="0" />
                          </label>
                          <button
                            className="iconbtn ft-mf__txndel"
                            title="Delete"
                            aria-label="Delete transaction"
                            onPointerDown={(e) => e.preventDefault()}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => deleteRow(r)}
                          >
                            <AppIcon name="trash" size={15} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {openId === r.id && isPos && r.posSource && (
                    <div className="ft-mf__fundbody">
                      <p className="ft-led__posnote">Edits sync straight to your Portfolio.</p>
                      <div className="ft-mf__txn">
                        {r.posSource.kind === 'row' ? (
                          <label className="ft-mf__txnf ft-led__txnname">
                            <span>Name</span>
                            <input className="input" value={r.name} onChange={(e) => editPos(r.posSource!, { name: e.target.value })} />
                          </label>
                        ) : null}
                        <label className="ft-mf__txnf">
                          <span>₹ Value</span>
                          <AmountInput className="input" value={r.amount} onChange={(v) => editPos(r.posSource!, { value: v })} placeholder="0" />
                        </label>
                        {r.posSource.kind === 'row' && (
                          <label className="ft-mf__txnf">
                            <span>Units (optional)</span>
                            <DecimalInput value={r.units} onChange={(v) => editPos(r.posSource!, { units: v })} placeholder="0" />
                          </label>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {adding && (
              <AddTransaction
                funds={funds}
                classes={assignableClasses(plan)}
                onCancel={() => setAdding(false)}
                onAddMf={(fundId, txn) => {
                  update((d) => {
                    const f = (d.mutualFunds ?? []).find((x) => x.id === fundId);
                    if (f) { f.transactions.push(txn); f.updatedAt = now(); }
                  });
                  setAdding(false);
                }}
                onAddNewFund={(match, category, txn) => {
                  update((d) => {
                    (d.mutualFunds ??= []).push({
                      id: newId(),
                      schemeCode: match.schemeCode,
                      name: match.schemeName,
                      category,
                      transactions: [txn],
                      // Seed a value immediately from the buy NAV; the Pulse tab
                      // refreshes the live NAV on its next sync.
                      latestNav: txn.nav || undefined,
                      latestNavDate: txn.nav ? txn.date : undefined,
                      createdAt: now(),
                      updatedAt: now(),
                    });
                  });
                  setAdding(false);
                }}
                onAddEntry={(entry) => {
                  update((d) => {
                    (d.ledger ??= []).push(entry);
                    syncEntryHolding(d, entry);
                  });
                  setAdding(false);
                }}
              />
            )}
          </>
        )}

        {!adding && (
          <button className="ft-fab" onClick={() => setAdding(true)} aria-label="Add transaction" title="Add transaction">
            <AppIcon name="plus" size={20} /> Add
          </button>
        )}
      </div>
    </main>
  );
}

function AddTransaction({
  funds,
  classes,
  onCancel,
  onAddMf,
  onAddNewFund,
  onAddEntry,
}: {
  funds: MutualFundHolding[];
  classes: { key: string; label: string }[];
  onCancel: () => void;
  onAddMf: (fundId: string, txn: MFTransaction) => void;
  onAddNewFund: (match: SchemeMatch, category: MFCategory, txn: MFTransaction) => void;
  onAddEntry: (entry: LedgerEntry) => void;
}) {
  const [mode, setMode] = useState<'mf' | 'other'>('mf');
  const [date, setDate] = useState(todayInput());
  const [amount, setAmount] = useState(0);
  const [units, setUnits] = useState(0);
  // MF — pick an existing fund, or '__new__' to search AMFI for a new one.
  const [fundId, setFundId] = useState(funds[0]?.id ?? '__new__');
  const [nav, setNav] = useState(0);
  const [kind, setKind] = useState<'sip' | 'lumpsum'>('lumpsum');
  const isNewFund = fundId === '__new__';
  // New-fund scheme search (AMFI, like the Pulse tab).
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SchemeMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState('');
  const [picked, setPicked] = useState<SchemeMatch | null>(null);
  const [newCat, setNewCat] = useState<MFCategory>('flexicap');
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Other asset
  const [classKey, setClassKey] = useState(classes[0]?.key ?? 'gold');
  const [name, setName] = useState('');
  const [entryKind, setEntryKind] = useState<LedgerKind>('buy');
  const subcats = assignableSubcats(classKey);
  const [subKey, setSubKey] = useState<string>(subcats[0]?.key ?? '');
  // Keep the sub-category valid when the asset class changes.
  useEffect(() => {
    const subs = assignableSubcats(classKey);
    setSubKey(subs[0]?.key ?? '');
  }, [classKey]);

  useEffect(() => {
    if (!isNewFund || picked) return;
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    searchDebounce.current = setTimeout(async () => {
      setSearching(true);
      setSearchErr('');
      try {
        setResults((await searchSchemes(query)).slice(0, 25));
      } catch {
        setSearchErr('Couldn’t search AMFI (offline?). Try again.');
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    };
  }, [query, isNewFund, picked]);

  const buildTxn = (): MFTransaction => ({
    id: newId(),
    date: new Date(date + 'T00:00:00').toISOString(),
    amount,
    units: units || (nav > 0 ? amount / nav : 0),
    nav,
    kind,
  });

  const mfDisabled = amount <= 0 || (isNewFund ? !picked : !fundId);

  return (
    <div className="ft-mf__add">
      <div className="ft-led__modeseg">
        <button className={mode === 'mf' ? 'active' : ''} onClick={() => setMode('mf')}>
          Mutual fund
        </button>
        <button className={mode === 'other' ? 'active' : ''} onClick={() => setMode('other')}>
          Other asset
        </button>
      </div>

      {mode === 'mf' ? (
        <>
          <label className="ft-mf__addf">
            <span>Fund</span>
            <select className="input" value={fundId} onChange={(e) => { setFundId(e.target.value); setPicked(null); }}>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
              <option value="__new__">＋ Add a new fund…</option>
            </select>
          </label>

          {isNewFund && (
            picked ? (
              <>
                <div className="ft-mf__addpicked">
                  <b>{picked.schemeName}</b>
                  <button className="ft-mf__link" onClick={() => setPicked(null)}>Change</button>
                </div>
                <label className="ft-mf__addf">
                  <span>Category</span>
                  <select className="input" value={newCat} onChange={(e) => setNewCat(e.target.value as MFCategory)}>
                    {MF_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <>
                <input
                  className="input"
                  value={query}
                  autoFocus
                  placeholder="Search fund name (e.g. Parag Parikh Flexi Cap Direct)"
                  onChange={(e) => setQuery(e.target.value)}
                />
                {searching && <p className="ft-mf__hint">Searching…</p>}
                {searchErr && <p className="ft-mf__note ft-mf__note--warn">{searchErr}</p>}
                <div className="ft-mf__results">
                  {results.map((r) => {
                    const already = funds.some((f) => f.schemeCode === r.schemeCode);
                    return (
                      <button key={r.schemeCode} className="ft-mf__result" disabled={already} onClick={() => setPicked(r)}>
                        <span>{r.schemeName}</span>
                        {already && <span className="ft-mf__added">Added</span>}
                      </button>
                    );
                  })}
                </div>
              </>
            )
          )}

          {(!isNewFund || picked) && (
            <>
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
            </>
          )}
        </>
      ) : (
        <>
          <div className="ft-mf__sipfields">
            <label>
              <span>Asset class</span>
              <select className="input" value={classKey} onChange={(e) => setClassKey(e.target.value)}>
                {classes.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </label>
            {subcats.length > 0 && (
              <label>
                <span>Sub-category</span>
                <select className="input" value={subKey} onChange={(e) => setSubKey(e.target.value)}>
                  {subcats.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </label>
            )}
            <label>
              <span>Kind</span>
              <select className="input" value={entryKind} onChange={(e) => setEntryKind(e.target.value as LedgerKind)}>
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </label>
          </div>
          <label className="ft-mf__addf">
            <span>Name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gold coin 10g, SBI FD, AAPL" />
          </label>
          <div className="ft-mf__sipfields">
            <label>
              <span>Date</span>
              <input className="input" type="date" value={date} max={todayInput()} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label>
              <span>₹ Amount</span>
              <AmountInput className="input" value={amount} onChange={setAmount} placeholder="0" />
            </label>
            <label>
              <span>Units (optional)</span>
              <DecimalInput value={units} onChange={setUnits} placeholder="0" />
            </label>
          </div>
        </>
      )}

      <div className="ft-mf__addactions">
        <button className="btn btn--ghost" onClick={onCancel}>Cancel</button>
        {mode === 'mf' ? (
          <button
            className="btn"
            disabled={mfDisabled}
            onClick={() => {
              if (isNewFund && picked) onAddNewFund(picked, newCat, buildTxn());
              else if (!isNewFund) onAddMf(fundId, buildTxn());
            }}
          >
            Add
          </button>
        ) : (
          <button
            className="btn"
            disabled={!name.trim() || !(amount > 0)}
            onClick={() =>
              onAddEntry({
                id: newId(),
                date: new Date(date + 'T00:00:00').toISOString(),
                assetClassKey: classKey,
                name: name.trim(),
                amount,
                units: units || undefined,
                kind: entryKind,
                subKey: subKey || undefined,
                reviewed: true,
                createdAt: now(),
                updatedAt: now(),
              })
            }
          >
            Add
          </button>
        )}
      </div>
    </div>
  );
}
