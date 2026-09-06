import { useMemo, useState } from 'react';
import type { FortunaTabProps } from '../FortunaApp';
import type { AssetClassKey, CustomAssetClass, HoldingRow } from '../../types/models';
import { sectionTotals, capBreakdown, AGE_EQUITY_ALLOCATION, classBreakdown, trackedFundsByClass } from '../../core/plannerMath';
import { newId } from '../../core/util';
import AmountInput from '../AmountInput';
import AppIcon from '../AppIcon';
import RecurringInvestments from './RecurringInvestments';
import HoldingList from './HoldingList';
import DistributionBar from './DistributionBar';
import { FortunaSheet, Section, TotalRow, Switch, formatINR } from './shared';

const EQUITY_CATS = ['Largecap', 'Midcap', 'Smallcap', 'Flexi/Multi cap'];

const CLASS_SECTION: { key: AssetClassKey; label: string; field: keyof ReturnType<typeof sectionTotals> }[] = [
  { key: 'real_estate', label: 'Real Estate & REITs', field: 'realEstate' },
  { key: 'domestic_equity', label: 'Equity Stocks', field: 'equityStocks' },
  { key: 'equity_mf', label: 'Equity Mutual Funds', field: 'equityMf' },
  { key: 'us_equity', label: 'US Equity', field: 'usEquity' },
  { key: 'debt', label: 'Debt', field: 'debt' },
  { key: 'gold', label: 'Gold', field: 'gold' },
  { key: 'crypto', label: 'Crypto', field: 'crypto' },
];

export default function PortfolioTab({ plan, update, goTo }: FortunaTabProps) {
  const totals = useMemo(() => sectionTotals(plan.assets), [plan.assets]);
  const caps = useMemo(() => capBreakdown(plan.assets), [plan.assets]);
  const tracked = useMemo(() => trackedFundsByClass(plan.mutualFunds), [plan.mutualFunds]);
  const a = plan.assets;
  const capTotal = caps.reduce((s, c) => s + c.value, 0);
  const [newClassId, setNewClassId] = useState<string | null>(null);
  const [editingClass, setEditingClass] = useState<string | null>(null);

  const customClasses = plan.customClasses ?? [];
  const disabledList = plan.disabledClasses ?? [];
  const disabledSet = new Set(disabledList);
  const on = (key: string) => !disabledSet.has(key);
  const customTotal = (c: CustomAssetClass) => c.holdings.reduce((s, r) => s + (Number(r.value) || 0), 0);

  // Displayed section value per built-in class. Equity Mutual Funds & Debt also
  // hold auto-tracked funds (from the Ledger/Pulse), so their headings must add
  // those in — otherwise a portfolio tracked entirely on the Pulse tab shows a
  // misleading ₹0 heading even though the funds below have value.
  const trackedFor = (key: string) => (key === 'equity_mf' ? tracked.equity_mf ?? 0 : key === 'debt' ? tracked.debt ?? 0 : 0);
  const secVal: Record<string, number> = {
    real_estate: totals.realEstate,
    domestic_equity: totals.equityStocks,
    equity_mf: totals.equityMf + trackedFor('equity_mf'),
    us_equity: totals.usEquity,
    debt: totals.debt + trackedFor('debt'),
    gold: totals.gold,
    crypto: totals.crypto,
  };

  const enabledTotal =
    CLASS_SECTION.filter((c) => on(c.key)).reduce((s, c) => s + secVal[c.key], 0) +
    customClasses.filter((c) => on(c.id)).reduce((s, c) => s + customTotal(c), 0);

  const labels = plan.fixedLabels ?? {};
  const fl = (key: string, fallback: string) => labels[key] ?? fallback;
  function rename(key: string, name: string) {
    update((d) => {
      const map = d.fixedLabels ?? (d.fixedLabels = {});
      map[key] = name;
    });
  }

  function toggleClass(key: string, off: boolean) {
    update((d) => {
      const list = d.disabledClasses ?? (d.disabledClasses = []);
      const idx = list.indexOf(key);
      if (off && idx < 0) list.push(key);
      else if (!off && idx >= 0) list.splice(idx, 1);
    });
  }

  function addCustomClass() {
    const id = newId();
    update((d) => {
      const cc = d.customClasses ?? (d.customClasses = []);
      cc.push({ id, label: '', liquid: true, holdings: [] });
      d.assumptions.push({ key: id, label: '', expectedReturnPct: 8, weights: {} });
    });
    setNewClassId(id);
    setEditingClass(id);
  }
  function removeCustomClass(id: string) {
    update((d) => {
      d.customClasses = (d.customClasses ?? []).filter((c) => c.id !== id);
      d.assumptions = d.assumptions.filter((x) => x.key !== id);
      d.disabledClasses = (d.disabledClasses ?? []).filter((k) => k !== id);
    });
  }
  function renameCustom(id: string, label: string) {
    update((d) => {
      const c = (d.customClasses ?? []).find((x) => x.id === id);
      if (c) c.label = label;
      const row = d.assumptions.find((x) => x.key === id);
      if (row) row.label = label;
    });
  }
  function setCustomLiquid(id: string, liquid: boolean) {
    update((d) => {
      const c = (d.customClasses ?? []).find((x) => x.id === id);
      if (c) c.liquid = liquid;
    });
  }

  const HeadRight = ({ k, value, editable = true }: { k: string; value: number; editable?: boolean }) => (
    <span className="ft-secright ft-secright--assets">
      <Switch on={on(k)} onChange={(o) => toggleClass(k, !o)} label={on(k) ? 'On' : 'Off'} />
      <Chip value={value} />
      {editable && (
        <button className="iconbtn ft-assets__edit" onClick={() => setEditingClass(k)} aria-label={`Edit ${k} assets`} title="Edit assets">
          <AppIcon name="edit" size={15} />
        </button>
      )}
    </span>
  );

  // A per-class sub-category distribution bar (Stocks vs fund types, cash vs FDs
  // vs EPF…) shown at the top of each section so the Portfolio visualises how
  // each asset class is split, not just its total.
  const funds = plan.mutualFunds ?? [];
  const ClassDist = ({ k }: { k: string }) => {
    const rows = classBreakdown(a, k, funds, customClasses);
    if (rows.length < 2) return null;
    return (
      <>
        <div className="ft-sublabel">Distribution</div>
        <DistributionBar rows={rows} />
      </>
    );
  };

  return (
    <main className="app__body">
      <div className="page ft-page">
        <RecurringInvestments plan={plan} update={update} />

        {on('real_estate') && (
          <Section title="Real Estate & REITs" right={<HeadRight k="real_estate" value={totals.realEstate} />} collapsible defaultOpen={false}>
            <ClassDist k="real_estate" />
            <AssetSummary rows={[
              { id: 'home', name: fl('realEstate.home', 'Home'), value: a.realEstate.home },
              { id: 'other', name: fl('realEstate.otherRealEstate', 'Other real estate'), value: a.realEstate.otherRealEstate },
              { id: 'reits', name: fl('realEstate.reits', 'REITs'), value: a.realEstate.reits },
              ...a.realEstate.others,
            ]} />
          </Section>
        )}

        {on('domestic_equity') && (
          <Section title="Equity Stocks" right={<HeadRight k="domestic_equity" value={secVal.domestic_equity} />} collapsible defaultOpen={false}>
            <ClassDist k="domestic_equity" />
            <AssetSummary rows={a.domesticEquity.stocks} />

            {capTotal > 0 && (
              <>
                <div className="ft-sublabel">By market cap</div>
                {caps.map((c) => (
                  <div className="ft-total" key={c.cap} style={{ borderTop: 'none', paddingTop: 0 }}>
                    <span>
                      {c.cap}
                      <span className="ft-capbar">
                        <span className="ft-capbar__fill" style={{ width: `${capTotal ? (c.value / capTotal) * 100 : 0}%` }} />
                      </span>
                    </span>
                    <span className="ft-total__val">
                      {Math.round(capTotal ? (c.value / capTotal) * 100 : 0)}% · {formatINR(c.value)}
                    </span>
                  </div>
                ))}
              </>
            )}

            <div className="ft-sublabel">Recommended equity mix by age</div>
            <div className="ft-agetable">
              <div className="ft-agetable__head">
                <span>Cap</span>
                <span>20–30</span>
                <span>30–45</span>
                <span>45–65</span>
                <span>&gt;65</span>
              </div>
              {AGE_EQUITY_ALLOCATION.map((r) => (
                <div className="ft-agetable__row" key={r.cap}>
                  <span className="ft-agetable__cap">{r.cap}</span>
                  <span>{r.byAge['20-30']}%</span>
                  <span>{r.byAge['30-45']}%</span>
                  <span>{r.byAge['45-65']}%</span>
                  <span>{r.byAge['>65']}%</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {on('equity_mf') && (
          <Section title="Equity Mutual Funds" right={<HeadRight k="equity_mf" value={secVal.equity_mf} />} collapsible defaultOpen={false}>
            <ClassDist k="equity_mf" />
            {goTo && (
              <button className="ft-viewlink" onClick={() => goTo('funds')}>
                Manage funds on Pulse <AppIcon name="chevronRight" size={15} />
              </button>
            )}
            <AssetSummary rows={a.domesticEquity.mutualFunds} empty="No manually-entered funds" />
          </Section>
        )}

        {on('us_equity') && (
          <Section title="US Equity" right={<HeadRight k="us_equity" value={secVal.us_equity} />} collapsible defaultOpen={false}>
            <ClassDist k="us_equity" />
            <AssetSummary rows={[...a.usEquity.others, { id: 'smallcase', name: fl('misc.smallcase', 'Smallcase'), value: a.misc.smallcase }]} />
          </Section>
        )}

        {on('debt') && (
          <Section title="Debt" right={<HeadRight k="debt" value={secVal.debt} />} collapsible defaultOpen={false}>
            <ClassDist k="debt" />
            {trackedFor('debt') > 0 && (
              <TotalRow label="Auto-tracked debt funds · edit in the Ledger" value={trackedFor('debt')} />
            )}
            <AssetSummary rows={[
              { id: 'cash', name: fl('debt.liquidCash', 'Liquid cash'), value: a.debt.liquidCash },
              ...a.debt.fds,
              ...a.debt.debtFunds,
              ...a.debt.epfPpfVpf,
              { id: 'ulips', name: fl('misc.ulips', 'ULIPs / other insurance'), value: a.misc.ulips },
            ]} />
          </Section>
        )}

        {on('gold') && (
          <Section title="Gold" right={<HeadRight k="gold" value={secVal.gold} />} collapsible defaultOpen={false}>
            <ClassDist k="gold" />
            <AssetSummary rows={[
              { id: 'jewellery', name: fl('gold.jewellery', 'Jewellery'), value: a.gold.jewellery },
              { id: 'sgb', name: fl('gold.sgb', 'SGB'), value: a.gold.sgb },
              { id: 'goldEtf', name: fl('gold.goldEtf', 'Gold ETF / digital gold'), value: a.gold.goldEtf },
              ...a.gold.others,
            ]} />
          </Section>
        )}

        {on('crypto') && (
          <Section title="Crypto" right={<HeadRight k="crypto" value={secVal.crypto} />} collapsible defaultOpen={false}>
            <ClassDist k="crypto" />
            <AssetSummary rows={[{ id: 'crypto', name: fl('crypto.crypto', 'Crypto'), value: a.crypto.crypto }, ...a.crypto.others]} />
          </Section>
        )}

        {customClasses.filter((c) => on(c.id)).map((c) => (
          <Section
            key={c.id}
            title={c.label.trim() || 'Custom category'}
            right={<HeadRight k={c.id} value={customTotal(c)} />}
            collapsible
            defaultOpen={c.id === newClassId}
          >
            <ClassDist k={c.id} />
            <AssetSummary rows={c.holdings} />
          </Section>
        ))}

        {editingClass === 'real_estate' && (
          <FortunaSheet title="Edit Real Estate & REITs" onClose={() => setEditingClass(null)}>
            <div className="ft-assetform">
              <FixedAssetField label={fl('realEstate.home', 'Home')} value={a.realEstate.home} onRename={(name) => rename('realEstate.home', name)} onChange={(value) => update((d) => { d.assets.realEstate.home = value; })} />
              <FixedAssetField label={fl('realEstate.otherRealEstate', 'Other real estate')} value={a.realEstate.otherRealEstate} onRename={(name) => rename('realEstate.otherRealEstate', name)} onChange={(value) => update((d) => { d.assets.realEstate.otherRealEstate = value; })} />
              <FixedAssetField label={fl('realEstate.reits', 'REITs')} value={a.realEstate.reits} onRename={(name) => rename('realEstate.reits', name)} onChange={(value) => update((d) => { d.assets.realEstate.reits = value; })} />
              <FormGroup title="Other holdings">
                <HoldingList form rows={a.realEstate.others} namePlaceholder="e.g. Plot, 2nd property" onChange={(m) => update((d) => m(d.assets.realEstate.others))} />
              </FormGroup>
            </div>
          </FortunaSheet>
        )}

        {editingClass === 'domestic_equity' && (
          <FortunaSheet title="Edit Equity Stocks" onClose={() => setEditingClass(null)}>
            <HoldingList form rows={a.domesticEquity.stocks} categories={EQUITY_CATS} namePlaceholder="Stock name" showUnits addLabel="Add stock" onChange={(m) => update((d) => m(d.assets.domesticEquity.stocks))} />
          </FortunaSheet>
        )}

        {editingClass === 'equity_mf' && (
          <FortunaSheet title="Edit Equity Mutual Funds" onClose={() => setEditingClass(null)}>
            <HoldingList form rows={a.domesticEquity.mutualFunds} categories={EQUITY_CATS} namePlaceholder="Fund name" showUnits addLabel="Add fund" onChange={(m) => update((d) => m(d.assets.domesticEquity.mutualFunds))} />
          </FortunaSheet>
        )}

        {editingClass === 'us_equity' && (
          <FortunaSheet title="Edit US Equity" onClose={() => setEditingClass(null)}>
            <div className="ft-assetform">
              <FixedAssetField label={fl('misc.smallcase', 'Smallcase')} value={a.misc.smallcase} onRename={(name) => rename('misc.smallcase', name)} onChange={(value) => update((d) => { d.assets.misc.smallcase = value; })} />
              <HoldingList form rows={a.usEquity.others} namePlaceholder="e.g. S&P 500 ETF, VOO" showUnits addLabel="Add holding" onChange={(m) => update((d) => m(d.assets.usEquity.others))} />
            </div>
          </FortunaSheet>
        )}

        {editingClass === 'debt' && (
          <FortunaSheet title="Edit Debt" onClose={() => setEditingClass(null)}>
            <div className="ft-assetform">
              <FixedAssetField label={fl('debt.liquidCash', 'Liquid cash')} value={a.debt.liquidCash} onRename={(name) => rename('debt.liquidCash', name)} onChange={(value) => update((d) => { d.assets.debt.liquidCash = value; })} />
              <FormGroup title="Fixed deposits"><HoldingList form rows={a.debt.fds} namePlaceholder="Bank name" addLabel="Add deposit" onChange={(m) => update((d) => m(d.assets.debt.fds))} /></FormGroup>
              <FormGroup title="Debt funds"><HoldingList form rows={a.debt.debtFunds} namePlaceholder="Fund name" addLabel="Add fund" onChange={(m) => update((d) => m(d.assets.debt.debtFunds))} /></FormGroup>
              <FormGroup title="EPF / PPF / VPF"><HoldingList form rows={a.debt.epfPpfVpf} namePlaceholder="Account" addLabel="Add account" onChange={(m) => update((d) => m(d.assets.debt.epfPpfVpf))} /></FormGroup>
              <FixedAssetField label={fl('misc.ulips', 'ULIPs / other insurance')} value={a.misc.ulips} onRename={(name) => rename('misc.ulips', name)} onChange={(value) => update((d) => { d.assets.misc.ulips = value; })} />
            </div>
          </FortunaSheet>
        )}

        {editingClass === 'gold' && (
          <FortunaSheet title="Edit Gold" onClose={() => setEditingClass(null)}>
            <div className="ft-assetform">
              <FixedAssetField label={fl('gold.jewellery', 'Jewellery')} value={a.gold.jewellery} onRename={(name) => rename('gold.jewellery', name)} onChange={(value) => update((d) => { d.assets.gold.jewellery = value; })} />
              <FixedAssetField label={fl('gold.sgb', 'SGB')} value={a.gold.sgb} onRename={(name) => rename('gold.sgb', name)} onChange={(value) => update((d) => { d.assets.gold.sgb = value; })} />
              <FixedAssetField label={fl('gold.goldEtf', 'Gold ETF / digital gold')} value={a.gold.goldEtf} onRename={(name) => rename('gold.goldEtf', name)} onChange={(value) => update((d) => { d.assets.gold.goldEtf = value; })} />
              <FormGroup title="Other holdings"><HoldingList form rows={a.gold.others} namePlaceholder="e.g. Gold coins, fund" addLabel="Add holding" onChange={(m) => update((d) => m(d.assets.gold.others))} /></FormGroup>
            </div>
          </FortunaSheet>
        )}

        {editingClass === 'crypto' && (
          <FortunaSheet title="Edit Crypto" onClose={() => setEditingClass(null)}>
            <div className="ft-assetform">
              <FixedAssetField label={fl('crypto.crypto', 'Crypto')} value={a.crypto.crypto} onRename={(name) => rename('crypto.crypto', name)} onChange={(value) => update((d) => { d.assets.crypto.crypto = value; })} />
              <FormGroup title="Other holdings"><HoldingList form rows={a.crypto.others} namePlaceholder="e.g. BTC, ETH, SOL" addLabel="Add holding" onChange={(m) => update((d) => m(d.assets.crypto.others))} /></FormGroup>
            </div>
          </FortunaSheet>
        )}

        {customClasses.map((c) => editingClass === c.id && (
          <FortunaSheet
            key={c.id}
            title={c.label.trim() || 'Edit asset category'}
            onClose={() => setEditingClass(null)}
            footer={<button className="btn btn--ghost btn--danger" onClick={() => { removeCustomClass(c.id); setEditingClass(null); }}><AppIcon name="trash" size={16} /> Delete category</button>}
          >
            <div className="ft-assetform">
              <label className="ft-assetform__field"><span>Category name</span><input className="input" value={c.label} placeholder="e.g. Angel investments" onChange={(event) => renameCustom(c.id, event.target.value)} /></label>
              <label className="ft-assetform__switch"><span>Liquid asset</span><Switch on={c.liquid} onChange={(value) => setCustomLiquid(c.id, value)} label={c.liquid ? 'Liquid' : 'Illiquid'} /></label>
              <FormGroup title="Holdings"><HoldingList form rows={c.holdings} namePlaceholder="Holding name" addLabel="Add holding" onChange={(m) => update((d) => { const custom = (d.customClasses ?? []).find((x) => x.id === c.id); if (custom) m(custom.holdings); })} /></FormGroup>
            </div>
          </FortunaSheet>
        ))}

        <button className="ft-addclass" onClick={addCustomClass}>
          <AppIcon name="plus" size={18} /> Add asset category
        </button>

        <Section title="Total assets">
          <TotalRow label="All assets" value={enabledTotal} strong />
        </Section>

        {disabledList.length > 0 && (
          <Section
            title={`Disabled (${disabledList.length})`}
            collapsible
            defaultOpen={false}
          >
            {CLASS_SECTION.filter((c) => disabledSet.has(c.key)).map((c) => (
              <div className="ft-disabledrow" key={c.key}>
                <span className="ft-disabledrow__name">{c.label}</span>
                <span className="ft-disabledrow__val">{formatINR(secVal[c.key])}</span>
                <Switch on={false} onChange={() => toggleClass(c.key, false)} label="Off" />
              </div>
            ))}
            {customClasses.filter((c) => disabledSet.has(c.id)).map((c) => (
              <div className="ft-disabledrow" key={c.id}>
                <span className="ft-disabledrow__name">{c.label.trim() || 'Custom category'}</span>
                <span className="ft-disabledrow__val">{formatINR(customTotal(c))}</span>
                <Switch on={false} onChange={() => toggleClass(c.id, false)} label="Off" />
              </div>
            ))}
          </Section>
        )}
      </div>
    </main>
  );
}

function Chip({ value }: { value: number }) {
  return <span className="ft-chip">{formatINR(value)}</span>;
}

function AssetSummary({ rows, empty = 'No holdings' }: { rows: Pick<HoldingRow, 'id' | 'name' | 'value'>[]; empty?: string }) {
  if (rows.length === 0) return <span className="ft-assets__empty">{empty}</span>;
  return (
    <div className="ft-assets__summary">
      {rows.map((row) => (
        <div className="ft-assets__row" key={row.id}>
          <span>{row.name.trim() || 'Untitled'}</span>
          <strong>{formatINR(row.value)}</strong>
        </div>
      ))}
    </div>
  );
}

function FixedAssetField({ label, value, onRename, onChange }: { label: string; value: number; onRename: (name: string) => void; onChange: (value: number) => void }) {
  return (
    <div className="ft-fixedasset">
      <label className="ft-assetform__field"><span>Name</span><input className="input" value={label} onChange={(event) => onRename(event.target.value)} /></label>
      <label className="ft-assetform__field"><span>Amount</span><span className="ft-holdingform__money"><span className="ft-row__cur">₹</span><AmountInput className="input" value={value} onChange={onChange} placeholder="0" /></span></label>
    </div>
  );
}

function FormGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="ft-assetform__group"><div className="ft-sublabel">{title}</div>{children}</div>;
}
