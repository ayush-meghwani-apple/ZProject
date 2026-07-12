import { useMemo } from 'react';
import type { FortunaTabProps } from '../FortunaApp';
import type { AssetClassKey } from '../../types/models';
import { sectionTotals, capBreakdown, AGE_EQUITY_ALLOCATION } from '../../core/plannerMath';
import AppIcon from '../AppIcon';
import RecurringInvestments from './RecurringInvestments';
import HoldingList from './HoldingList';
import { Section, MoneyRow, TotalRow, formatINR } from './shared';

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
  const a = plan.assets;
  const capTotal = caps.reduce((s, c) => s + c.value, 0);

  const disabledList = plan.disabledClasses ?? [];
  const disabledSet = new Set(disabledList);
  const enabledTotal = CLASS_SECTION.filter((c) => !disabledSet.has(c.key)).reduce((s, c) => s + totals[c.field], 0);

  function toggleClass(key: AssetClassKey, off: boolean) {
    update((d) => {
      const list = d.disabledClasses ?? (d.disabledClasses = []);
      const idx = list.indexOf(key);
      if (off && idx < 0) list.push(key);
      else if (!off && idx >= 0) list.splice(idx, 1);
    });
  }

  const on = (key: AssetClassKey) => !disabledSet.has(key);
  const DisableBtn = ({ k }: { k: AssetClassKey }) => (
    <button className="ft-disablebtn" onClick={() => toggleClass(k, true)}>
      <AppIcon name="pause" size={14} /> Disable this category
    </button>
  );

  return (
    <main className="app__body">
      <div className="page ft-page">
        <p className="ft-note ft-note--top">
          Enter the current value of everything you own. Tap a section to expand it; totals roll up into your Net
          Worth automatically. Disable a category you don't use — it drops out of net worth, the mix, Returns and
          goals, and moves to the Disabled section below.
        </p>

        <RecurringInvestments plan={plan} update={update} />

        {on('real_estate') && (
          <Section title="Real Estate & REITs" right={<Chip value={totals.realEstate} />} collapsible defaultOpen={false}>
            <MoneyRow label="Home" value={a.realEstate.home} onChange={(v) => update((d) => { d.assets.realEstate.home = v; })} />
            <MoneyRow label="Other real estate" value={a.realEstate.otherRealEstate} onChange={(v) => update((d) => { d.assets.realEstate.otherRealEstate = v; })} />
            <MoneyRow label="REITs" value={a.realEstate.reits} onChange={(v) => update((d) => { d.assets.realEstate.reits = v; })} />
            <div className="ft-sublabel">Other holdings</div>
            <HoldingList rows={a.realEstate.others} namePlaceholder="e.g. Plot, 2nd property" onChange={(m) => update((d) => m(d.assets.realEstate.others))} />
            <DisableBtn k="real_estate" />
          </Section>
        )}

        {on('domestic_equity') && (
          <Section title="Domestic Equity" subtitle="Stocks & mutual funds" right={<Chip value={totals.domesticEquity} />} collapsible defaultOpen={false}>
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
            <DisableBtn k="domestic_equity" />
          </Section>
        )}

        {on('us_equity') && (
          <Section title="US Equity" right={<Chip value={totals.usEquity} />} collapsible defaultOpen={false}>
            <MoneyRow label="S&P 500 ETF" value={a.usEquity.sp500Etf} onChange={(v) => update((d) => { d.assets.usEquity.sp500Etf = v; })} />
            <MoneyRow label="Other ETFs" value={a.usEquity.otherEtfs} onChange={(v) => update((d) => { d.assets.usEquity.otherEtfs = v; })} />
            <MoneyRow label="US mutual funds" value={a.usEquity.mutualFunds} onChange={(v) => update((d) => { d.assets.usEquity.mutualFunds = v; })} />
            <MoneyRow label="Smallcase" value={a.misc.smallcase} onChange={(v) => update((d) => { d.assets.misc.smallcase = v; })} />
            <div className="ft-sublabel">Other holdings</div>
            <HoldingList rows={a.usEquity.others} namePlaceholder="e.g. VOO, QQQ, a US stock" onChange={(m) => update((d) => m(d.assets.usEquity.others))} />
            <DisableBtn k="us_equity" />
          </Section>
        )}

        {on('debt') && (
          <Section title="Debt" subtitle="Cash, FDs, debt funds, EPF/PPF/VPF" right={<Chip value={totals.debt} />} collapsible defaultOpen={false}>
            <MoneyRow label="Liquid (savings, cash, liquid fund)" value={a.debt.liquidCash} onChange={(v) => update((d) => { d.assets.debt.liquidCash = v; })} />
            <div className="ft-sublabel">Fixed deposits</div>
            <HoldingList rows={a.debt.fds} namePlaceholder="Bank name" onChange={(m) => update((d) => m(d.assets.debt.fds))} />
            <div className="ft-sublabel">Debt funds</div>
            <HoldingList rows={a.debt.debtFunds} namePlaceholder="Fund name" onChange={(m) => update((d) => m(d.assets.debt.debtFunds))} />
            <div className="ft-sublabel">EPF / PPF / VPF</div>
            <HoldingList rows={a.debt.epfPpfVpf} namePlaceholder="Account" onChange={(m) => update((d) => m(d.assets.debt.epfPpfVpf))} />
            <MoneyRow label="ULIPs / other insurance" value={a.misc.ulips} onChange={(v) => update((d) => { d.assets.misc.ulips = v; })} />
            <DisableBtn k="debt" />
          </Section>
        )}

        {on('gold') && (
          <Section title="Gold" right={<Chip value={totals.gold} />} collapsible defaultOpen={false}>
            <MoneyRow label="Jewellery" value={a.gold.jewellery} onChange={(v) => update((d) => { d.assets.gold.jewellery = v; })} />
            <MoneyRow label="SGB" value={a.gold.sgb} onChange={(v) => update((d) => { d.assets.gold.sgb = v; })} />
            <MoneyRow label="Gold ETF / digital gold" value={a.gold.goldEtf} onChange={(v) => update((d) => { d.assets.gold.goldEtf = v; })} />
            <div className="ft-sublabel">Other holdings</div>
            <HoldingList rows={a.gold.others} namePlaceholder="e.g. Gold coins, fund" onChange={(m) => update((d) => m(d.assets.gold.others))} />
            <DisableBtn k="gold" />
          </Section>
        )}

        {on('crypto') && (
          <Section title="Crypto" right={<Chip value={totals.crypto} />} collapsible defaultOpen={false}>
            <MoneyRow label="Crypto" value={a.crypto.crypto} onChange={(v) => update((d) => { d.assets.crypto.crypto = v; })} />
            <div className="ft-sublabel">Other holdings</div>
            <HoldingList rows={a.crypto.others} namePlaceholder="e.g. BTC, ETH, SOL" onChange={(m) => update((d) => m(d.assets.crypto.others))} />
            <DisableBtn k="crypto" />
          </Section>
        )}

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
                <button className="ft-enablebtn" onClick={() => toggleClass(c.key, false)}>
                  <AppIcon name="play" size={14} /> Enable
                </button>
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
