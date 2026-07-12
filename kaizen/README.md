# Expensify

Offline-first personal finance app. Chat-style expense entry (`tea 20`), salary
cycles, a merged spending summary, goal planning with step-up SIP projections,
and JSON backup/restore. A hamburger menu switches between sub-apps (Expensify,
Goals). No backend, no auth, no internet required. Installable on iPhone as a PWA.

See [ExpenseTracker-Architecture.md](ExpenseTracker-Architecture.md) for the full
design and the locked V1 decisions.

## Stack

- **React + TypeScript + Vite**
- **Dexie (IndexedDB)** with versioned migrations — the only file that knows about
  storage is `src/storage/`
- **vite-plugin-pwa** for offline + Add-to-Home-Screen
- **Recharts** for charts

## Layers (the rule: UI never touches storage directly)

```
src/components   →  React UI only
src/core         →  pure logic (parser, salaryCycle, reports) — no React, no storage
src/repository   →  addExpense() / getExpenses() ... — depends on StorageAdapter
src/storage      →  IndexedDB today; swap one file (src/storage/index.ts) tomorrow
```

## Run locally

```powershell
npm install
npm run dev          # http://localhost:5173
```

Test on your phone over Wi-Fi (same network as the laptop):

```powershell
npm run host         # prints a Network URL like http://192.168.x.x:5173
```

Open that Network URL in **Safari** on the iPhone.

## Usage

| Type this        | Result                                   |
| ---------------- | ---------------------------------------- |
| `tea 20`         | ₹20 → Food › Tea/Coffee                  |
| `petrol 500 card`| ₹500 → Transport › Fuel, note "card"     |
| `1200 groceries` | ₹1200 → Food › Groceries                 |
| `salary 50000`   | closes current cycle, starts a new one   |
| `help`           | shows tips                               |

Unknown words still save (as a note) so nothing is ever lost — categorize later.

## Move data to another device (V1 sync)

1. **Settings → Backup → Export JSON** on device A.
2. Transfer the file (AirDrop / email / cloud drive).
3. **Settings → Backup → Import JSON** on device B.

Import merges by record ID, so re-importing the same file is safe.

---

## Deploy as a hosted PWA (for iPhone)

> **Recommended: Option C — GitHub Pages.** It's free forever (static files on a
> CDN, nothing to sleep or expire), gives a **permanent stable URL**
> (`https://<user>.github.io/<repo>/`), and after a one-time setup every future
> update is just `git push` — CI rebuilds and redeploys automatically. The stable
> URL matters: your data lives in IndexedDB keyed to that exact origin, so a URL
> that never changes means your expenses always reload.

Pick ONE. All are free.

### Option A — Netlify drag & drop (fastest)

```powershell
npm run build        # produces /dist
```

1. Go to https://app.netlify.com/drop
2. Drag the **`dist`** folder onto the page.
3. Open the given `https://<name>.netlify.app` URL on your iPhone.

### Option B — Vercel

```powershell
npm i -g vercel
vercel               # follow prompts; build command `npm run build`, output `dist`
```

### Option C — GitHub Pages (CI included)

1. Push this repo to GitHub (branch `main`).
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The workflow in `.github/workflows/deploy.yml` builds with the correct
   `VITE_BASE=/<repo-name>/` and publishes automatically on every push.
4. Your URL: `https://<user>.github.io/<repo-name>/`

> The base path only matters for GitHub Pages (served from a sub-path). Netlify
> and Vercel serve from the root, so no config is needed there.

## Install on iPhone (Add to Home Screen)

1. Open the deployed `https://` URL in **Safari** (must be HTTPS, which all three
   hosts provide).
2. Tap the **Share** button (square with an up-arrow).
3. Tap **Add to Home Screen → Add**.
4. Launch it from the Home Screen — it runs full-screen and works **offline**.

Data is stored locally on each device (IndexedDB). Use Export/Import to copy
between devices until a backend is added.

## Updating the app safely (after it's deployed and you're using it)

**The short version:** updates do NOT touch your data. Your expenses live in the
browser's IndexedDB, which is tied to the deployment URL (the origin) — *not* to
the app's code. Pushing new code only swaps the cached JS/CSS; the database is a
separate store that updates leave completely alone. As long as the URL stays the
same, your existing expenses survive every update.

The one rule that guarantees this: **never change the deployment URL** (same
GitHub repo name = same `…github.io/<repo>/` URL = same data).

### Step-by-step when we ship an update after a week

**On your phone — before the update (optional but recommended, 10 seconds):**

1. Open the app → **Settings → Backup → Export JSON**.
2. Save the file to **Files / iCloud Drive** (or AirDrop to the laptop).
   This is your safety net; you almost certainly won't need it, but keep it.

**On the laptop — ship the update:**

3. We make the code changes and verify locally with `npm run build`.
4. `git push` — the GitHub Actions workflow rebuilds and redeploys to the **same
   URL** automatically.

**On your phone — get the update:**

5. **Fully close the app** (swipe it away from the app switcher) and reopen it.
   The service worker is set to `autoUpdate`, so it fetches the new version on
   the next launch. If you don't see the change immediately, close and reopen
   once more (the first launch downloads it, the second activates it).
6. Your expenses are all still there — verify on the Summary tab. Done.

### Why your data can't vanish on an update

- IndexedDB is **separate from the app cache** the service worker replaces.
- Schema changes use **additive Dexie migrations** (`version(n+1).upgrade(...)`),
  which migrate existing rows and never drop them.
- If the database ever fails to open, the app shows an **error screen instead of
  wiping** — it never auto-deletes data.
- The app requests **persistent storage** on iOS so Safari won't evict it.

### The only ways data CAN be lost (so don't do these)

- **Changing the deployment URL** (renaming the repo, switching to a custom
  domain, moving hosts). Different URL = different empty database. If you ever
  must change it: Export JSON on the old URL first, then Import on the new one.
- Deleting Safari website data / the IndexedDB for that site.
- Uninstalling the Home-Screen app *before* persistent storage is granted —
  which is why exporting a JSON backup now and then is the ultimate insurance.

## Adding features later without breaking the DB

- Change the schema in `src/storage/db.ts` by adding a new
  `this.version(n).stores({...}).upgrade(tx => ...)` block. Old data migrates; it
  is never dropped.
- Add fields to the types in `src/types/models.ts`; TypeScript flags every place
  that must handle them.
- To move to a real backend, implement `StorageAdapter` in a new file and change
  the single line in `src/storage/index.ts`.
