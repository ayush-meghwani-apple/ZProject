I think that's the right architectural decision.And here's the key point:

> **Design for migration, not for today's storage.**

If we do that correctly, moving from IndexedDB to SQLite, PostgreSQL, or even a local file later will require changing **one file**, not rewriting the app.

---

# Architecture

Think of the app as 4 layers.

```
┌────────────────────────────┐
│         UI (Chat)          │
└─────────────┬──────────────┘
              │
┌─────────────▼──────────────┐
│      Business Logic        │
│ Parser                     │
│ Salary Cycles              │
│ Budget                     │
│ Reports                    │
└─────────────┬──────────────┘
              │
┌─────────────▼──────────────┐
│     Repository Layer       │
│ addExpense()               │
│ getExpenses()              │
│ getCategories()            │
│ deleteExpense()            │
└─────────────┬──────────────┘
              │
┌─────────────▼──────────────┐
│ Storage (Today IndexedDB)  │
│ Tomorrow SQLite            │
│ Tomorrow API               │
└────────────────────────────┘
```

The UI should **never know** whether the data comes from IndexedDB or a server.

---

# Folder Structure

I'd make it look like this.

```
expense-tracker/

index.html

style.css

app.js

──────────────────────

/core

    parser.js
    salaryCycle.js
    reports.js
    budget.js

──────────────────────

/repository

    expenseRepository.js

──────────────────────

/storage

    indexedDb.js

──────────────────────

/components

    Chat.js
    Dashboard.js
    Reports.js
    Categories.js

──────────────────────

/config

    categories.json

──────────────────────

/charts

──────────────────────
```

Notice something.

There is **no IndexedDB code outside `/storage`.**

That is deliberate.

---

# Repository Pattern

Instead of writing

```javascript
db.transaction(...)
```

all over your app,

everything goes through

```javascript
ExpenseRepository
```

Example

```javascript
await ExpenseRepository.addExpense(expense);

await ExpenseRepository.getExpenses();

await ExpenseRepository.deleteExpense(id);
```

Today

```
ExpenseRepository

↓

IndexedDB
```

Tomorrow

```
ExpenseRepository

↓

FastAPI

↓

SQLite
```

UI doesn't change.

---

# Data Model

Don't optimize it for IndexedDB.

Optimize it for SQL.

Example

```javascript
Expense

id

amount

date

salaryCycleId

categoryId

subcategoryId

merchantId

contextId

paymentMethodId

note

createdAt

updatedAt
```

This is already SQL-ready.

---

# Don't store names.

Store IDs.

Instead of

```
Category

Food
```

store

```
categoryId = 2
```

Why?

Later SQL joins become easy.

---

# Categories

Separate table.

```
Category

id

name

icon

color
```

---

Subcategory

```
id

categoryId

name
```

---

Context

```
id

name

type

color
```

Examples

```
Home Visit

Weekend Trip

Goa

Wedding

Gym Transformation
```

---

# Merchant

```
id

name

defaultCategory

defaultSubcategory
```

Example

```
Apollo

↓

Medical

↓

Medicine
```

---

# Alias Table

This is where the parser becomes awesome.

```
tea

↓

subcategoryId=17
```

```
chai

↓

subcategoryId=17
```

```
protein

↓

subcategoryId=44
```

No AI.

Just lookup.

---

# Salary Cycle

Instead of computing everything every time.

Store them.

```
Salary Cycle

id

startDate

endDate

salaryReceived
```

Example

```
27 May

↓

25 June
```

Every expense references a cycle.

---

# Reports

Never compute inside components.

Create

```
reports.js
```

Functions

```
getMonthlySummary()

getCategorySummary()

getTopExpenses()

getMerchantStats()

getDailyAverage()

getWeekendStats()

getHomeTripSummary()
```

When backend comes,

these become API calls.

---

# Future Migration

Today

```
UI

↓

Repository

↓

IndexedDB
```

Tomorrow

```
UI

↓

Repository

↓

REST API

↓

FastAPI

↓

SQLite
```

The UI literally won't know.

---

# Version 1 Scope (One Weekend)

I'd intentionally **cut features** to guarantee completion.

### ✅ Chat Screen

```
tea 20

Added ✅
```

---

### ✅ Expense History

```
Today

Tea

₹20

Coffee

₹40
```

---

### ✅ Dashboard

* Total Spend
* Top Categories
* This Salary Cycle
* Last Salary Cycle

---

### ✅ Categories

CRUD

---

### ✅ Reports

* Pie Chart
* Monthly Bar Chart

---

### ✅ Export

JSON

---

### ✅ Import

JSON

---

That's it.

---

# Version 2

* Recurring
* Budgets
* Tags
* Contexts
* Merchant Analytics
* Search
* Filters

---

# The one thing I'd add from day one

This is the feature I think you'll appreciate most after six months.

## Event Sourcing (Lightweight)

Instead of deleting or overwriting records, record every action.

```
Expense Added

↓

Expense Edited

↓

Expense Deleted
```

Internally

```
Activity

id

type

entity

entityId

timestamp
```

Why?

Because one day you'll accidentally edit or delete something.

With an activity log, you can undo changes, build future sync capabilities, and even answer questions like "what changed since my last backup?" without extra work.

---

## Finally, one design principle

I would make one rule for the whole codebase:

> **Every feature should work without internet, without authentication, and without any external service.**

If later you add cloud sync, Telegram, or a backend, they become **optional adapters**, not core dependencies.

---

# V1 Implementation Plan (Locked Decisions)

These decisions were confirmed before building and now drive the codebase.

## Tech Stack

| Concern | Choice | Why |
|---|---|---|
| Language | **TypeScript** | Types are the #1 defense against "adding a feature next week breaks something". The compiler catches breakage before runtime. |
| UI | **React** | Component model maps cleanly to the doc's `/components` (Chat, Dashboard, Reports, Categories). |
| Tooling | **Vite** | Instant dev server, fast build, first-class PWA plugin. |
| Storage (today) | **IndexedDB via Dexie.js** | Dexie has **versioned schema migrations** built in — the exact mechanism that lets us evolve the DB week-over-week without wiping existing data. |
| PWA | **vite-plugin-pwa** | Offline support + "Add to Home Screen" install on iPhone. |
| Charts | **Recharts** | Pie + bar charts with minimal code. |
| Styling | **Plain CSS (single global sheet + CSS variables)** | No extra build/config; easy to theme later. |

> The framework lives **only** in `/components`. The `/core`, `/repository`, and `/storage` layers are pure TypeScript with zero React imports — so a future swap (or a backend) never touches business logic.

## Locked Product Decisions

- **Currency:** INR (₹).
- **Salary cycle:** Starts when the user logs **"salary received"** (a command, e.g. `salary 50000`). The previous open cycle is closed automatically. Expenses always attach to the currently-open cycle.
- **Multi-device (V1):** Manual **JSON Export / Import**. Export on phone → import on laptop. No backend needed.
- **iPhone usage:** Deployed as a **hosted PWA** (GitHub Pages / Netlify / Vercel) and installed via **Share → Add to Home Screen**.
- **Offline-first:** Everything works with no internet, no auth, no external service (per the core design principle).

## How "nothing breaks next week" is enforced

1. **Versioned DB migrations** — every schema change bumps a Dexie version with an explicit `upgrade()`; old data is migrated, never dropped.
2. **TypeScript everywhere** — adding a field is a compile error until all call sites are handled.
3. **StorageAdapter interface** — repositories depend on an interface, not Dexie. Swapping to a REST/SQLite adapter is one file.
4. **ID-based data model** — no names stored inline; aliases/categories resolve by ID, so renames never corrupt history.
5. **Event log (activities)** — every add/edit/delete is appended, enabling undo and "what changed since last backup".
6. **Seed is idempotent** — re-running the seed never duplicates categories.

## Data Durability Guarantees (your expenses never vanish on update)

The golden rules — breaking any of these is the only way to lose data, so don't:

1. **Never change the DB name.** It is `'expense-tracker'` in `src/storage/db.ts`. IndexedDB is keyed by (origin + name); changing either orphans the old data.
2. **Never edit an existing `version(n).stores(...)` block.** To change the schema, ADD `this.version(n+1).stores({...}).upgrade(tx => ...)`. Dexie replays upgrades in order and preserves rows.
3. **Keep the same deployment URL/origin.** IndexedDB is per-origin. Moving from `user.github.io/app` to a custom domain = different origin = different (empty) database. Export → import to migrate if the URL ever changes.
4. **A failed DB open shows an error screen, never a silent wipe** (`src/main.tsx`). The app never calls `deleteDatabase()` or `clear()` automatically.
5. **Import is merge-only** (`bulkPut` by id) — it adds/updates, never clears. Re-importing the same file is safe.
6. **Updating the app only swaps cached JS/CSS via the service worker.** IndexedDB is separate from the PWA cache and is untouched by updates.

iOS-specific safety (your phone is the primary device):

- The app calls `navigator.storage.persist()` on launch to mark storage **durable**, so Safari/iOS won't evict it after 7 days of inactivity.
- **Installing to the Home Screen** (Add to Home Screen) gives the PWA its own, more durable storage bucket — strongly recommended.
- Settings → **Data Safety** shows persistence status + usage; Settings → **Backup** exports a JSON file. A banner nudges you if the last backup is older than 7 days. The export file is the ultimate safety net (survives reinstalls, OS resets, and device changes).

## Final Folder Structure (TypeScript / React)

```
expense-tracker/
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  /public
    manifest + icons
  /src
    main.tsx            ← React entry
    App.tsx             ← tab shell (Chat / Dashboard / Reports / Categories)
    style.css

    /core               ← pure TS, no React
      parser.ts
      salaryCycle.ts
      reports.ts

    /repository         ← pure TS, depends on StorageAdapter
      expenseRepository.ts
      categoryRepository.ts
      salaryCycleRepository.ts
      activityRepository.ts
      backupRepository.ts   ← export/import JSON

    /storage            ← the ONLY place that knows about IndexedDB
      StorageAdapter.ts     ← interface (swap point)
      indexedDbAdapter.ts   ← Dexie implementation + migrations
      db.ts                 ← Dexie schema versions
      seed.ts               ← idempotent seed data

    /config
      categories.json

    /components
      Chat.tsx
      Dashboard.tsx
      Reports.tsx
      Categories.tsx

    /types
      models.ts             ← Expense, Category, SalaryCycle, ...
```

## Build Order (phased, each phase compiles & runs)

1. Project scaffold + PWA (blank app installs on phone).
2. Types + storage adapter + Dexie migrations + seed.
3. Repository layer.
4. Core logic (parser, salary cycle, reports).
5. Components (Chat → Dashboard → Reports → Categories).
6. Export/Import + deploy.
