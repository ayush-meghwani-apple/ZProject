# AGENTS.md — Kaizen (repo working notes for AI agents & humans)

> This file is an **architecture map** to get productive fast. It's the in-repo
> companion to the deeper agent memory. Keep it short and current.

## What this is

**Kaizen** 🌱 — an offline-first personal PWA (a "hub" of small apps). Despite the
folder history, this is **not just an expense tracker** anymore. All data lives
**on-device** (IndexedDB via Dexie); there is no backend. Everything is in one
Vite + React + TypeScript app.

Sub-apps (switched from the drawer, whole-UI swap — see `App.tsx` / `AppId`):

- **Expensify** 💸 (Money) — expense tracking: chat-style add, cycles, Reels review, Summary charts.
- **Questify** 🧭 (Planning) — savings goals + SIP calculator.
- **Fortuna** 📈 (Planning) — full financial planner (net worth, cash flow, portfolio, goals, returns). **PIN-gated.**
- **Slate** 📝 (Studio) — rich notes.
- **Vault** 🔒 (Private) — PIN-gated, **encrypted-at-rest** private savings entries.

## Stack & commands

- Vite 5 + React 18 + TypeScript 5 (strict). Icons: `lucide-react` via the single `AppIcon` registry (`src/components/AppIcon.tsx`). Charts: `recharts`. DB: `dexie`.
- Build: `npm run build` (`tsc -b && vite build`). Dev: `npm run dev`. Preview: `npm run preview -- --port <n>`. Tests: `npm test` (vitest, pure-logic only).
- Windows/PowerShell dev env. Use `& npm.cmd run …`.

## Layout (`src/`)

- `storage.ts` — Dexie schema (`SCHEMA_VERSION`, all object stores). Bump the version + add a `version(n)` block when adding a store.
- `types/models.ts` — **all** data models (single source of truth).
- `core/` — **pure**, side-effect-free logic (testable, no DOM/storage): `plannerMath.ts` (Fortuna math), `recurringInvestments.ts`, `cycleDate.ts`, `vaultLock.ts` (crypto), `util.ts` (`newId`, `now`, `formatINR`), `noteTable.ts`.
- `repository/` — persistence per domain (load/save/migrate). Repos own migrations.
- `components/` — UI. Sub-app roots: `App.tsx`, `FortunaApp.tsx`, etc. Fortuna tabs live in `components/fortuna/`.
- `style.css` — global styles (large; `.ft-*` = Fortuna). Consider splitting per-feature as it grows.

## Fortuna (the most complex sub-app) — key facts

- **Single atomic document**: the entire plan is one `FinancialPlan` (id `default`) in the `plannerDocs` Dexie store. Saves atomically; trivial to back up.
- **Security model**: PIN-gated screen only; the plan is stored **UNENCRYPTED** on purpose so a forgotten PIN can never lose it. Shares the Vault PIN (`core/vaultLock.ts` used as a gate only; derived key discarded). (Vault items *are* encrypted; the planner is not.)
- **Save loop**: `FortunaApp.update(mutator)` JSON-clones the plan, mutates a draft, then debounced-saves (350ms). `reload()` cancels pending saves and reloads.
- **Migration**: `plannerRepository.migrate()` is **forward-only and non-destructive** — it maps old shapes to new and defaults missing fields, never drops data. Every model change needs a migration path here.
- **Math**: `core/plannerMath.ts` mirrors the user's spreadsheet. Pure functions: `computeCashFlow`, `effectiveReturns`, `computeGoal`, `targetAllocation`, `computeNetWorth`, `sipRequired`, etc. **This is the risky money-logic — cover it with tests** (`plannerMath.test.ts`).
- **Model shape (current)**: `assumptions: AssetClassAssumption[]` (key = 6 built-in `AssetClassKey`s OR a custom-class uuid; `weights: Record<goalTypeId, number>`). `horizons?: HorizonDef[]` are **goal types** (name + description; `maxYears` is legacy/migration-only). `customClasses?` = user asset categories (each has a matching assumptions row by id). `fixedLabels?` = renamed built-in portfolio lines. `disabledClasses?: string[]` = turned-off classes (built-in keys + custom ids). Goals carry `goalTypeId`. `cashFlow.emergencyTarget?` overrides the 6× default.
- **SIP destinations** (`core/recurringInvestments.ts`) still reference fixed asset fields (`sp500Etf`, `goldEtf`, `crypto.crypto`, `liquidCash`, etc.) — keep those fields alive or migrate them.

## Invariants — do not break

- Single atomic `FinancialPlan` doc; forward-only non-destructive `migrate()`.
- Planner stored unencrypted (durability > secrecy, by user choice); Vault stays encrypted.
- The copyrighted source spreadsheet `Fortuna.xlsx` is **git-ignored** — never commit/publish it (the repo deploys to public GitHub Pages).
- Keep `core/` pure (no storage/DOM) so it stays testable.

## Deployment

- Repo root is `C:\ZProject` (this app is a subfolder). CI: `.github/workflows/deploy.yml` builds **every** top-level folder with a `package.json` and publishes each at `https://<user>.github.io/<repo>/<subpath>/`.
- **URL stability**: the deploy sub-path is normally the folder name. This folder is `kaizen`, but the workflow **pins its public sub-path to `expense-tracker`** so the already-installed PWA (and its on-device data, which is per-origin) keeps working. Don't change that sub-path without accepting a one-time home-screen re-add.
- Version lives in `package.json` and shows in Settings → About (`__APP_VERSION__`). Bump it per release. After deploy, the installed PWA may need a full close+reopen (twice) to swap the service-worker cache.

## Conventions

- Follow the existing modular split (models → core → repository → components). Add new domain logic as pure functions in `core/` and cover with tests.
- IDs are `newId()` uuids. Money is INR; percentages are whole numbers (12 = 12%).
- `Issues.md` (app folder) tracks the running Open/Done change log the user maintains.
