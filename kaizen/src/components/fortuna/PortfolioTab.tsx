import { useMemo, useState } from 'react';
import type { FortunaTabProps } from '../FortunaApp';
import type { AssetClassKey, CustomAssetClass } from '../../types/models';
import { sectionTotals, capBreakdown, AGE_EQUITY_ALLOCATION, trackedFundsByClass } from '../../core/plannerMath';
import { newId } from '../../core/util';
import AppIcon from '../AppIcon';
import RecurringInvestments from './RecurringInvestments';
import HoldingList from './HoldingList';
import { Section, RenamableMoneyRow, TotalRow, Switch, formatINR } from './shared';

const EQUITY_CATS = ['Largecap', 'Midcap', 'Smallcap', 'Flexi/Multi cap'];

const CLASS_SECTION: { key: AssetClassKey; label: string; field: keyof ReturnType<typeof sectionTotals> }[] = [
  { key: 'real_estate', label: 'Real Estate & REITs', field: 'realEstate' },
  { key: 'domestic_equity', label: 'Domestic Equity', field: 'domesticEquity' },
  { key: 'us_equity', label: 'US Equity', field: 'usEquity' },
  { key: 'debt', label: 'Debt', field: 'debt' },
  { key: 'gold', label: 'Gold', field: 'gold' },
  { key: 'crypto', label: 'Crypto', field: 'crypto' },
];

export default function PortfolioTab({ plan, update }: FortunaTabProps) {
  const totals = useMemo(() => sectionTotals(plan.assets), [plan.assets]);
  const caps = useMemo(() => capBreakdown(plan.assets), [plan.assets]);
  const tracked = useMemo(() => trackedFundsByClass(plan.mutualFunds), [plan.mutualFunds]);
  const trackedTotal = (tracked.domestic_equity ?? 0) + (tracked.debt ?? 0);
  const a = plan.assets;
  const capTotal = caps.reduce((s, c) => s + c.value, 0);
  const [newClassId, setNewClassId] = useState<string | null>(null);

  const customClasses = plan.customClasses ?? [];
  const disabledList = plan.disabledClasses ?? [];
  const disabledSet = new Set(disabledList);
  const on = (key: string) => !disabledSet.has(key);
  const customTotal = (c: CustomAssetClass) => c.holdings.reduce((s, r) => s + (Number(r.value) || 0), 0);

  const enabledTotal =
    CLASS_SECTION.filter((c) => on(c.key)).reduce((s, c) => s + totals[c.field], 0) +
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

  const HeadRight = ({ k, value }: { k: string; value: number }) => (
    <span className="ft-secright">
      <Switch on={on(k)} onChange={(o) => toggleClass(k, !o)} label={on(k) ? 'On' : 'Off'} />
      <Chip value={value} />
    </span>
  );

  return (
    <main className="app__body">
      <div className="page ft-page">
        <p className="ft-note ft-note--top">
          Enter the current value of everything you own. Tap a section to expand it; totals roll up into your Net
          Worth automatically. Flip a category's toggle off to exclude it from net worth, the mix, Returns and goals —
          it drops to the Disabled section below. Add your own categories at the bottom.
        </p>

        {trackedTotal > 0 && (
          <p className="ft-note ft-note--tracked">
            <AppIcon name="investments" size={13} /> You also have <strong>{formatINR(trackedTotal)}</strong> in
            auto-tracked funds on the <strong>Funds</strong> tab (live NAV, counted in Net Worth). Don’t re-enter those
            here as manual rows, or they’ll be double-counted.
          </p>
        )}

        <RecurringInvestments plan={plan} update={update} />

        {on('real_estate') && (
          <Section title="Real Estate & REITs" right={<HeadRight k="real_estate" value={totals.realEstate} />} collapsible defaultOpen={false}>
            <RenamableMoneyRow label={fl('realEstate.home', 'Home')} value={a.realEstate.home} onChange={(v) => update((d) => { d.assets.realEstate.home = v; })} onRename={(n) => rename('realEstate.home', n)} />
            <RenamableMoneyRow label={fl('realEstate.otherRealEstate', 'Other real estate')} value={a.realEstate.otherRealEstate} onChange={(v) => update((d) => { d.assets.realEstate.otherRealEstate = v; })} onRename={(n) => rename('realEstate.otherRealEstate', n)} />
            <RenamableMoneyRow label={fl('realEstate.reits', 'REITs')} value={a.realEstate.reits} onChange={(v) => update((d) => { d.assets.realEstate.reits = v; })} onRename={(n) => rename('realEstate.reits', n)} />
            <div className="ft-sublabel">Other holdings</div>
            <HoldingList rows={a.realEstate.others} namePlaceholder="e.g. Plot, 2nd property" onChange={(m) => update((d) => m(d.assets.realEstate.others))} />
          </Section>
        )}

        {on('domestic_equity') && (
          <Section title="Domestic Equity" subtitle="Stocks & mutual funds" right={<HeadRight k="domestic_equity" value={totals.domesticEquity} />} collapsible defaultOpen={false}>
            <div className="ft-sublabel">Stocks</div>
            <HoldingList
              rows={a.domesticEquity.stocks}
              categories={EQUITY_CATS}
              namePlaceholder="Stock name"
              onChange={(m) => update((d) => m(d.assets.domesticEquity.stocks))}
            />
            <div className="ft-sublabel">Mutual funds / ETFs / Smallcase</div>
            <HoldingList
              rows={a.domesticEquity.mutualFunds}
              categories={EQUITY_CATS}
              namePlaceholder="Fund name"
              onChange={(m) => update((d) => m(d.assets.domesticEquity.mutualFunds))}
            />

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
            <p className="ft-note">A rough guide for how to split domestic equity across market caps as you age.</p>
          </Section>
        )}

        {on('us_equity') && (
          <Section title="US Equity" right={<HeadRight k="us_equity" value={totals.usEquity} />} collapsible defaultOpen={false}>
            <RenamableMoneyRow label={fl('usEquity.sp500Etf', 'S&P 500 ETF')} value={a.usEquity.sp500Etf} onChange={(v) => update((d) => { d.assets.usEquity.sp500Etf = v; })} onRename={(n) => rename('usEquity.sp500Etf', n)} />
            <RenamableMoneyRow label={fl('usEquity.otherEtfs', 'Other ETFs')} value={a.usEquity.otherEtfs} onChange={(v) => update((d) => { d.assets.usEquity.otherEtfs = v; })} onRename={(n) => rename('usEquity.otherEtfs', n)} />
            <RenamableMoneyRow label={fl('usEquity.mutualFunds', 'US mutual funds')} value={a.usEquity.mutualFunds} onChange={(v) => update((d) => { d.assets.usEquity.mutualFunds = v; })} onRename={(n) => rename('usEquity.mutualFunds', n)} />
            <RenamableMoneyRow label={fl('misc.smallcase', 'Smallcase')} value={a.misc.smallcase} onChange={(v) => update((d) => { d.assets.misc.smallcase = v; })} onRename={(n) => rename('misc.smallcase', n)} />
            <div className="ft-sublabel">Other holdings</div>
            <HoldingList rows={a.usEquity.others} namePlaceholder="e.g. VOO, QQQ, a US stock" onChange={(m) => update((d) => m(d.assets.usEquity.others))} />
          </Section>
        )}

        {on('debt') && (
          <Section title="Debt" subtitle="Cash, FDs, debt funds, EPF/PPF/VPF" right={<HeadRight k="debt" value={totals.debt} />} collapsible defaultOpen={false}>
            <RenamableMoneyRow label={fl('debt.liquidCash', 'Liquid (savings, cash, liquid fund)')} value={a.debt.liquidCash} onChange={(v) => update((d) => { d.assets.debt.liquidCash = v; })} onRename={(n) => rename('debt.liquidCash', n)} />
            <div className="ft-sublabel">Fixed deposits</div>
            <HoldingList rows={a.debt.fds} namePlaceholder="Bank name" onChange={(m) => update((d) => m(d.assets.debt.fds))} />
            <div className="ft-sublabel">Debt funds</div>
            <HoldingList rows={a.debt.debtFunds} namePlaceholder="Fund name" onChange={(m) => update((d) => m(d.assets.debt.debtFunds))} />
            <div className="ft-sublabel">EPF / PPF / VPF</div>
            <HoldingList rows={a.debt.epfPpfVpf} namePlaceholder="Account" onChange={(m) => update((d) => m(d.assets.debt.epfPpfVpf))} />
            <RenamableMoneyRow label={fl('misc.ulips', 'ULIPs / other insurance')} value={a.misc.ulips} onChange={(v) => update((d) => { d.assets.misc.ulips = v; })} onRename={(n) => rename('misc.ulips', n)} />
          </Section>
        )}

        {on('gold') && (
          <Section title="Gold" right={<HeadRight k="gold" value={totals.gold} />} collapsible defaultOpen={false}>
            <RenamableMoneyRow label={fl('gold.jewellery', 'Jewellery')} value={a.gold.jewellery} onChange={(v) => update((d) => { d.assets.gold.jewellery = v; })} onRename={(n) => rename('gold.jewellery', n)} />
            <RenamableMoneyRow label={fl('gold.sgb', 'SGB')} value={a.gold.sgb} onChange={(v) => update((d) => { d.assets.gold.sgb = v; })} onRename={(n) => rename('gold.sgb', n)} />
            <RenamableMoneyRow label={fl('gold.goldEtf', 'Gold ETF / digital gold')} value={a.gold.goldEtf} onChange={(v) => update((d) => { d.assets.gold.goldEtf = v; })} onRename={(n) => rename('gold.goldEtf', n)} />
            <div className="ft-sublabel">Other holdings</div>
            <HoldingList rows={a.gold.others} namePlaceholder="e.g. Gold coins, fund" onChange={(m) => update((d) => m(d.assets.gold.others))} />
          </Section>
        )}

        {on('crypto') && (
          <Section title="Crypto" right={<HeadRight k="crypto" value={totals.crypto} />} collapsible defaultOpen={false}>
            <RenamableMoneyRow label={fl('crypto.crypto', 'Crypto')} value={a.crypto.crypto} onChange={(v) => update((d) => { d.assets.crypto.crypto = v; })} onRename={(n) => rename('crypto.crypto', n)} />
            <div className="ft-sublabel">Other holdings</div>
            <HoldingList rows={a.crypto.others} namePlaceholder="e.g. BTC, ETH, SOL" onChange={(m) => update((d) => m(d.assets.crypto.others))} />
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
            <label className="ft-row">
              <span className="ft-row__label">Category name</span>
              <span className="ft-row__field">
                <input
                  className="input ft-row__input"
                  value={c.label}
                  placeholder="e.g. Angel investments, P2P, Art"
                  onChange={(e) => renameCustom(c.id, e.target.value)}
                />
              </span>
            </label>
            <label className="ft-row">
              <span className="ft-row__label">
                Counts as liquid
                <span className="ft-row__hint">Off = illiquid (locked / hard to sell)</span>
              </span>
              <span className="ft-row__field ft-row__field--switch">
                <Switch on={c.liquid} onChange={(o) => setCustomLiquid(c.id, o)} label={c.liquid ? 'Liquid' : 'Illiquid'} />
              </span>
            </label>
            <div className="ft-sublabel">Holdings</div>
            <HoldingList rows={c.holdings} namePlaceholder="Holding name" onChange={(m) => update((d) => { const cc = (d.customClasses ?? []).find((x) => x.id === c.id); if (cc) m(cc.holdings); })} />
            <p className="ft-note">Set this category's expected return & goal weights in the Returns tab.</p>
            <button className="ft-disablebtn ft-disablebtn--danger" onClick={() => removeCustomClass(c.id)}>
              <AppIcon name="trash" size={14} /> Delete category
            </button>
          </Section>
        ))}

        <button className="btn ft-addclass" onClick={addCustomClass}>
          <AppIcon name="plus" size={18} /> Add asset category
        </button>

        <Section title="Total portfolio">
          <TotalRow label="All assets" value={enabledTotal} strong />
        </Section>

        {disabledList.length > 0 && (
          <Section
            title={`Disabled (${disabledList.length})`}
            subtitle="Excluded from net worth, mix, Returns & goals"
            collapsible
            defaultOpen={false}
          >
            {CLASS_SECTION.filter((c) => disabledSet.has(c.key)).map((c) => (
              <div className="ft-disabledrow" key={c.key}>
                <span className="ft-disabledrow__name">{c.label}</span>
                <span className="ft-disabledrow__val">{formatINR(totals[c.field])}</span>
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
