# ZProject

A monorepo of small, independent, offline-first web apps. Each project lives in
its own top-level folder and is deployed to its own sub-path on GitHub Pages.

| Project | Folder | Live URL |
| ------- | ------ | -------- |
| Expense Tracker | [`expense-tracker/`](expense-tracker/) | `https://ayush-meghwani-apple.github.io/ZProject/expense-tracker/` |

Landing page: `https://ayush-meghwani-apple.github.io/ZProject/`

## How deployment works

A single GitHub Actions workflow ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml))
runs on every push to `main`. It:

1. Finds **every top-level folder that has a `package.json`**.
2. Builds each one with `VITE_BASE=/ZProject/<folder>/` so asset paths are correct.
3. Publishes each project's `dist/` to `_site/<folder>/`, plus the root
   `index.html` landing page, to GitHub Pages.

You never edit the workflow to add a project — it's automatic.

## Adding a new mini-project later

1. Create a new top-level folder, e.g. `C:\ZProject\my-new-app`.
2. Make sure it has a `package.json` with a `build` script that outputs to
   `./dist` (a normal Vite project does this).
3. If it uses Vite, read the base path from an env var so Pages works:

   ```ts
   // vite.config.ts
   const base = process.env.VITE_BASE ?? '/';
   export default defineConfig({ base, /* ... */ });
   ```

4. Add a link card to the root [`index.html`](index.html).
5. Commit and push — CI builds and deploys it at
   `https://ayush-meghwani-apple.github.io/ZProject/my-new-app/`.

## One-time setup (do this once on GitHub)

Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Data safety note

GitHub Pages serves all projects from the **same origin**
(`ayush-meghwani-apple.github.io`). Browser storage (IndexedDB / localStorage) is scoped to
the **origin**, so projects share a storage space but are isolated by **database
name** — keep each app's DB name unique (Expense Tracker uses `expense-tracker`)
and they never collide.
