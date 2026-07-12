# Fortuna — Financial Planning app (Phased Delivery Plan)

Goal: mirror the user's *Master Financial Planner* spreadsheet as a PIN-gated
section inside Kaizen, built defensively so the plan data is never at risk.

Each phase ends with a **green `npm run build`** and (where UI exists) an
in-browser check before moving on. See `FinancialPlanner-Architecture.md` for
the data model and formulas.

---

## Phase 1 — Data foundation (safety-critical) ✅ target
The layer everything else stands on. No user-visible UI yet.
- [ ] Add `FinancialPlan` + sub-types to `types/models.ts`.
- [ ] Add `plannerDoc` to `BackupFile`.
- [ ] Dexie `version(8)` with `plannerDocs` store (data-preserving upgrade).
- [ ] Wire `plannerDocs` into `StorageAdapter` + `indexedDbAdapter`.
- [ ] `PlannerRepository`: `load()` (seed default + migrate), `save()`, `reset()`.
- [ ] Extend `BackupRepository` export / import / replaceAll.
- [ ] `npm run build` green.

## Phase 2 — Shell + PIN gate + Net Worth
- [ ] `core/plannerMath.ts` with net-worth + cash-flow + returns math.
- [ ] `FortunaApp.tsx`: PIN gate (reuse `vaultLock.unlock`, no encryption) →
      `TabbedApp` with 5 tab stubs.
- [ ] Register the tile in `App.tsx` (move "Investments" from SOON to active).
- [ ] `NetWorthTab`: net worth, liquid assets, assets vs liabilities, asset-mix
      (liabilities editable here). Read-only aggregation of Portfolio.
- [ ] Build + open in browser, verify unlock + dashboard renders.

## Phase 3 — Inputs (Cash Flow, Portfolio, Assumptions)
- [ ] `CashFlowTab`: inflows/outflows editable → surplus + emergency-fund hint.
- [ ] `PortfolioTab`: every asset class editable, incl. add/remove holding rows
      (stocks, mutual funds, FDs, debt funds, EPF/PPF). Live per-class totals.
- [ ] `AssumptionsTab`: editable returns & allocation weights, with effective
      returns shown per horizon. Validation that weights make sense.
- [ ] Build + verify each tab saves and reloads correctly.

## Phase 4 — Goals + SIP engine
- [ ] Goal CRUD: name, priority, years, amounts, inflation, step-up.
- [ ] Show computed horizon, future requirement, SIP required, per-asset split.
- [ ] Roll goal allocations into the Net Worth target asset-mix.
- [ ] Build + verify calculations against a hand-worked example.

## Phase 5 — Polish, safety, deploy
- [ ] Charts (asset-mix pie current vs target; net-worth composition).
- [ ] Empty/first-run states; input guards (no NaN, non-negative where needed).
- [ ] Confirm a full backup → wipe → restore round-trips the plan intact.
- [ ] Bump `package.json` version; build; commit; push; verify Actions deploy.
- [ ] Update `Issues.md` + repo memory.

---

## Non-negotiable safety checklist (every phase)
- Never a destructive multi-store write — the plan saves as one atomic record.
- Migration only ever *adds/defaults* fields; it never drops unknown data.
- The plan is always included in `exportAll` and restored by `importAll`.
- The copyrighted `.xlsx` stays git-ignored.
