import { useMemo } from 'react';
import type { FortunaTabProps } from '../FortunaApp';
import { sectionTotals, capBreakdown, AGE_EQUITY_ALLOCATION } from '../../core/plannerMath';
import RecurringInvestments from './RecurringInvestments';
import HoldingList from './HoldingList';
import { Section, MoneyRow, TotalRow, formatINR } from './shared';

const EQUITY_CATS = ['Largecap', 'Midcap', 'Smallcap', 'Flexi/Multi cap'];

export default function PortfolioTab({ plan, update }: FortunaTabProps) {
  const totals = useMemo(() => sectionTotals(plan.assets), [plan.assets]);
  const caps = useMemo(() => capBreakdown(plan.assets), [plan.assets]);
  const a = plan.assets;
  const capTotal = caps.reduce((s, c) => s + c.value, 0);

  return (
    <main className="app__body">
      <div className="page ft-page">
        <p className="ft-note ft-note--top">
          Enter the current value of everything you own. Tap a section to expand it; totals roll up into your Net
          Worth automatically.
        </p>

        <RecurringInvestments plan={plan} update={update} />

        <Section title="Real Estate & REITs" right={<Chip value={totals.realEstate} />} collapsible defaultOpen={false}>
          <MoneyRow label="Home" value={a.realEstate.home} onChange={(v) => update((d) => { d.assets.realEstate.home = v; })} />
          <MoneyRow label="Other real estate" value={a.realEstate.otherRealEstate} onChange={(v) => update((d) => { d.assets.realEstate.otherRealEstate = v; })} />
          <MoneyRow label="REITs" value={a.realEstate.reits} onChange={(v) => update((d) => { d.assets.realEstate.reits = v; })} />
        </Section>

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
        </Section>

        <Section title="US Equity" right={<Chip value={totals.usEquity} />} collapsible defaultOpen={false}>
          <MoneyRow label="S&P 500 ETF" value={a.usEquity.sp500Etf} onChange={(v) => update((d) => { d.assets.usEquity.sp500Etf = v; })} />
          <MoneyRow label="Other ETFs" value={a.usEquity.otherEtfs} onChange={(v) => update((d) => { d.assets.usEquity.otherEtfs = v; })} />
          <MoneyRow label="US mutual funds" value={a.usEquity.mutualFunds} onChange={(v) => update((d) => { d.assets.usEquity.mutualFunds = v; })} />
          <MoneyRow label="Smallcase" value={a.misc.smallcase} onChange={(v) => update((d) => { d.assets.misc.smallcase = v; })} />
        </Section>

        <Section title="Debt" subtitle="Cash, FDs, debt funds, EPF/PPF/VPF" right={<Chip value={totals.debt} />} collapsible defaultOpen={false}>
          <MoneyRow label="Liquid (savings, cash, liquid fund)" value={a.debt.liquidCash} onChange={(v) => update((d) => { d.assets.debt.liquidCash = v; })} />
          <div className="ft-sublabel">Fixed deposits</div>
          <HoldingList rows={a.debt.fds} namePlaceholder="Bank name" onChange={(m) => update((d) => m(d.assets.debt.fds))} />
          <div className="ft-sublabel">Debt funds</div>
          <HoldingList rows={a.debt.debtFunds} namePlaceholder="Fund name" onChange={(m) => update((d) => m(d.assets.debt.debtFunds))} />
          <div className="ft-sublabel">EPF / PPF / VPF</div>
          <HoldingList rows={a.debt.epfPpfVpf} namePlaceholder="Account" onChange={(m) => update((d) => m(d.assets.debt.epfPpfVpf))} />
          <MoneyRow label="ULIPs / other insurance" value={a.misc.ulips} onChange={(v) => update((d) => { d.assets.misc.ulips = v; })} />
        </Section>

        <Section title="Gold" right={<Chip value={totals.gold} />} collapsible defaultOpen={false}>
          <MoneyRow label="Jewellery" value={a.gold.jewellery} onChange={(v) => update((d) => { d.assets.gold.jewellery = v; })} />
          <MoneyRow label="SGB" value={a.gold.sgb} onChange={(v) => update((d) => { d.assets.gold.sgb = v; })} />
          <MoneyRow label="Gold ETF / digital gold" value={a.gold.goldEtf} onChange={(v) => update((d) => { d.assets.gold.goldEtf = v; })} />
        </Section>

        <Section title="Crypto" right={<Chip value={totals.crypto} />} collapsible defaultOpen={false}>
          <MoneyRow label="Crypto" value={a.crypto.crypto} onChange={(v) => update((d) => { d.assets.crypto.crypto = v; })} />
        </Section>

        <Section title="Total portfolio">
          <TotalRow label="All assets" value={totals.total} strong />
        </Section>
      </div>
    </main>
  );
}

function Chip({ value }: { value: number }) {
  return <span className="ft-chip">{formatINR(value)}</span>;
}
