# Fortuna — Financial Planning app (Architecture & Model)

> A PIN-gated section inside the **Kaizen** PWA that mirrors the user's personal
> *Master Financial Planner* spreadsheet (an Indian, INR, goal-based investment
> planner). It replaces the need to open Excel: enter holdings, cash flow, goals
> and assumptions, and see net worth, asset-mix and required SIPs computed live.

**Working app name:** _Fortuna_ (registered as the "Investments" tile that was
previously "coming soon"). Section: **Planning**.

---

## 1. Guiding principles (why this is built defensively)

This is the user's single source of truth for their entire financial plan.
Losing or corrupting it is unacceptable. So:

1. **No encryption at rest.** The screen is PIN-gated for privacy (reusing the
   Vault PIN), but the data itself is stored as plain records. Forgetting the
   PIN can never make the data unrecoverable.
2. **Always in the backup.** The plan is exported/imported/replaced by the same
   backup pipeline as the rest of Kaizen, so a single `kaizen-backup.json`
   contains everything.
3. **Single atomic document.** The whole plan is one versioned record
   (`plannerDocs`, id `default`). Every save writes it atomically — no partial
   multi-store writes that could half-apply. It's a few KB, so cost is trivial.
4. **Forward-only schema migration.** The document carries its own `v`. Loading
   an older document upgrades it in memory (never destructively) and fills any
   missing fields from defaults.
5. **Pure, tested math.** All financial formulas live in `core/plannerMath.ts`
   as pure functions with no side effects, so they can be reasoned about and
   unit-checked independently of the UI.
6. **The source spreadsheet is copyrighted** ("The 1% Club, distribution
   strictly prohibited") and is therefore git-ignored — it is never committed or
   published to the public GitHub Pages site.

---

## 2. Mapping: spreadsheet sheets → app

The workbook has 11 sheets. They collapse into **5 mobile tabs**:

| # | Spreadsheet sheet(s)                                   | App tab        | Nature            |
|---|--------------------------------------------------------|----------------|-------------------|
| 1 | Net worth                                              | **Net Worth**  | computed + liabilities input |
| 2 | Cash flows                                             | **Cash Flow**  | input → surplus   |
| 3 | Real estate & REIT, Domestic Equity, US equity, Debt, Gold, Crypto, Miscellaneous | **Portfolio** | input holdings |
| 4 | Financial Goals                                        | **Goals**      | input → SIP/alloc |
| 5 | Returns & Asset Mix assumption                         | **Assumptions**| editable constants|

---

## 3. Data model (`FinancialPlan`)

One singleton document. All money values are INR numbers; all percentages are
stored as whole numbers (e.g. `12` = 12%), converted to fractions in math.

```
FinancialPlan {
  id: 'default'
  v: number                     // document schema version (migration)
  assumptions: AssetClassAssumption[]   // 6 rows (see §4)
  cashFlow: CashFlow
  assets: PlanAssets
  liabilities: Liabilities
  goals: FinancialGoalRow[]
  updatedAt: ISODate
}

AssetClassAssumption {
  key: 'domestic_equity'|'us_equity'|'debt'|'gold'|'crypto'|'real_estate'
  label: string
  expectedReturnPct: number     // annual, e.g. 12
  shortPct / mediumPct / longPct: number  // allocation weight per horizon (0–100)
}

CashFlow {
  inflows:  { salary, business, rental, others }
  outflows: { expenses, compulsoryInvestments, loanEmis, insurance, others }
}

PlanAssets {
  realEstate:     { home, otherRealEstate, reits }
  domesticEquity: { stocks: HoldingRow[], mutualFunds: HoldingRow[] }
  usEquity:       { sp500Etf, otherEtfs, mutualFunds }
  debt:           { liquidCash, fds: HoldingRow[], debtFunds: HoldingRow[], epfPpfVpf: HoldingRow[] }
  gold:           { jewellery, sgb, goldEtf }
  crypto:         { crypto }
  misc:           { ulips, smallcase }
}

HoldingRow { id, name, category?, value }   // category e.g. Largecap/Midcap/Smallcap/Flexi

Liabilities { homeLoan, educationLoan, carLoan, personalGoldLoan, creditCard, other }

FinancialGoalRow {
  id, name, priority?, yearsLeft,
  amountRequiredToday, amountAvailableToday,
  inflationPct, stepUpPct
}
```

Goal-derived fields (goal type, future value, SIP required, per-asset
allocation) are **computed at render time**, never stored, so they can never go
stale relative to the assumptions.

---

## 4. Formulas (`core/plannerMath.ts`)

### 4.1 Effective returns per horizon (from the asset-mix table)
Given expected returns `r[]` and allocation weights `w[]` (as fractions):

- `shortEff  = Σ (r_i · wShort_i)`
- `mediumEff = Σ (r_i · wMedium_i) · 0.4 + shortEff · 0.6`   *(faithful to the sheet's blended medium row)*
- `longEff   = Σ (r_i · wLong_i)`

### 4.2 Cash flow
- `totalInflows  = salary + business + rental + others`
- `totalOutflows = expenses + compulsoryInvestments + loanEmis + insurance + others`
- `investingSurplus = totalInflows − totalOutflows`
- Recommended emergency fund ≈ `6 × totalOutflows` (shown as guidance).

### 4.3 Goal horizon (auto from years left)
- `< 3` → **Short Term**, `≤ 6` → **Medium Term**, else **Long Term**.

### 4.4 Goal future requirement (matches sheet formula F11)
Let `req` = amount required today, `avail` = amount available today,
`infl` = goal inflation, `n` = years, `eff` = effective return for the goal's horizon:

```
amountRequiredFuture = req·(1+infl)^n − avail·(1+eff)^n
```
(Floored at 0; if `req == avail`, treated as met → 0.)

### 4.5 SIP required
Monthly rate `m = (1+eff)^(1/12) − 1`, months `N = n·12`.
- Level SIP (no step-up): `SIP = FV · m / ((1+m)^N − 1)`.
- With annual step-up `g` (%): solve the growing-annuity so the stepped
  contributions accumulate to `FV` (closed form in the module).

### 4.6 Per-asset allocation of a goal's SIP
For each asset class, `allocation = horizonWeight(class) · SIP`.
Summed across all goals → **target monthly investment per asset class**.

### 4.7 Net worth (aggregation)
- **Illiquid** = home + otherRealEstate + jewellery + sgb + ulips + Σ(epfPpfVpf)
- **Liquid** = Σ(fds) + Σ(debtFunds) + domesticStocks + domesticMFs + usEquity
  + smallcase + liquidCash + goldEtf + crypto + reits
- `totalAssets = illiquid + liquid`
- `totalLiabilities = Σ liabilities`
- `netWorth = totalAssets − totalLiabilities`
- **Asset-mix %**: value per class ÷ totalAssets, compared to the goal-derived
  target allocation.

---

## 5. Persistence & integration

- **Store:** Dexie `plannerDocs: 'id'` (schema **v8**), wrapped by the existing
  `StorageAdapter`/`indexedDbAdapter` seam. One record, id `default`.
- **Repository:** `PlannerRepository` — `load()` (returns the doc, seeding a
  default if absent + running in-memory migration), `save(plan)`, `reset()`.
- **Backup:** `plannerDoc` added to `BackupFile.data`, and to
  `exportAll` / `importAll` / `replaceAll`. Importing merges by id (singleton),
  so importing a backup restores the plan.
- **PIN:** reuses `core/vaultLock.unlock()` purely as a gate — the returned key
  is discarded (no encryption). If no PIN exists yet, the same create-PIN flow
  as the Vault is offered (one shared PIN for Vault + Fortuna).

---

## 6. Files

```
src/
  types/models.ts                      # + FinancialPlan & friends, BackupFile.plannerDoc
  storage/db.ts                        # + version(8) plannerDocs store
  storage/StorageAdapter.ts            # + plannerDocs table
  storage/indexedDbAdapter.ts          # + wrap(db.plannerDocs)
  repository/plannerRepository.ts      # load/save/reset + default seed + migration
  repository/backupRepository.ts       # + plannerDoc in export/import/replace
  core/plannerMath.ts                  # all pure formulas (§4)
  components/
    FortunaApp.tsx                     # PIN gate + TabbedApp wiring
    fortuna/NetWorthTab.tsx
    fortuna/CashFlowTab.tsx
    fortuna/PortfolioTab.tsx
    fortuna/GoalsTab.tsx
    fortuna/AssumptionsTab.tsx
  App.tsx                              # register the app tile (Planning section)
  style.css                            # Fortuna styles
```
