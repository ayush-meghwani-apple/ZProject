import { useMemo } from 'react';
import type { FortunaTabProps } from '../FortunaApp';
import type { HoldingRow } from '../../types/models';
import { assetClassTotals } from '../../core/plannerMath';
import { newId } from '../../core/util';
import AmountInput from '../AmountInput';
import AppIcon from '../AppIcon';
import { Section, MoneyRow, TotalRow, formatINR } from './shared';

const EQUITY_CATS = ['Largecap', 'Midcap', 'Smallcap', 'Flexi/Multi cap'];

/** An editable list of {name, [category], value} rows with add/remove. */
function HoldingList({
  rows,
  categories,
  namePlaceholder,
  onChange,
}: {
  rows: HoldingRow[];
  categories?: string[];
  namePlaceholder: string;
  onChange: (mutate: (rows: HoldingRow[]) => void) => void;
}) {
  const total = rows.reduce((s, r) => s + (Number(r.value) || 0), 0);
  return (
    <div className="ft-holdings">
      {rows.map((row, i) => (
        <div className="ft-holding" key={row.id}>
          <input
            className="input ft-holding__name"
            value={row.name}
            placeholder={namePlaceholder}
            onChange={(e) => onChange((rs) => { rs[i].name = e.target.value; })}
          />
          {categories && (
            <select
              className="input ft-holding__cat"
              value={row.category ?? categories[0]}
              onChange={(e) => onChange((rs) => { rs[i].category = e.target.value; })}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          <span className="ft-holding__amt">
            <span className="ft-row__cur">₹</span>
            <AmountInput
              className="input ft-holding__val"
              value={row.value}
              onChange={(v) => onChange((rs) => { rs[i].value = v; })}
              placeholder="0"
            />
          </span>
          <button
            className="iconbtn ft-holding__del"
            aria-label="Remove"
            onClick={() => onChange((rs) => { rs.splice(i, 1); })}
          >
            <AppIcon name="trash" size={16} />
          </button>
        </div>
      ))}
      <div className="ft-holdings__foot">
        <button
          className="ft-addrow"
          onClick={() => onChange((rs) => { rs.push({ id: newId(), name: '', category: categories?.[0], value: 0 }); })}
        >
          <AppIcon name="plus" size={16} /> Add
        </button>
        {rows.length > 0 && <span className="ft-holdings__total">{formatINR(total)}</span>}
      </div>
    </div>
  );
}

export default function PortfolioTab({ plan, update }: FortunaTabProps) {
  const totals = useMemo(() => assetClassTotals(plan.assets), [plan.assets]);
  const a = plan.assets;

  return (
    <main className="app__body">
      <div className="page ft-page">
        <p className="ft-note ft-note--top">
          Enter the current value of everything you own. Tap a section to expand it; totals roll up into your Net
          Worth automatically.
        </p>

        <Section title="Real Estate & REITs" right={<Chip value={totals.real_estate} />} collapsible defaultOpen={false}>
          <MoneyRow label="Home" value={a.realEstate.home} onChange={(v) => update((d) => { d.assets.realEstate.home = v; })} />
          <MoneyRow label="Other real estate" value={a.realEstate.otherRealEstate} onChange={(v) => update((d) => { d.assets.realEstate.otherRealEstate = v; })} />
          <MoneyRow label="REITs" value={a.realEstate.reits} onChange={(v) => update((d) => { d.assets.realEstate.reits = v; })} />
        </Section>

        <Section title="Domestic Equity" subtitle="Stocks & mutual funds" right={<Chip value={totals.domestic_equity} />} collapsible defaultOpen={false}>
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
        </Section>

        <Section title="US Equity" right={<Chip value={totals.us_equity} />} collapsible defaultOpen={false}>
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
          <TotalRow
            label="All assets"
            value={
              totals.domestic_equity + totals.us_equity + totals.debt + totals.gold + totals.crypto + totals.real_estate
            }
            strong
          />
        </Section>
      </div>
    </main>
  );
}

function Chip({ value }: { value: number }) {
  return <span className="ft-chip">{formatINR(value)}</span>;
}
