# Issues & Improvements

To add something, just write a new bullet under **Open** — one line is enough.
When it's fixed, I'll move it to **Done** with the date and a short fix note.

Status key: 🔴 open · 🟡 in progress · ✅ done

## Open

## Done

- ✅ **(2026-06-28)** Fixed the whole-app bounce: when you scrolled past the top/bottom the entire screen used to rubber-band up and down. The page/body is now locked and only the inner content area scrolls, with overscroll contained — so reaching the end simply stops.
- ✅ **(2026-06-28)** Dashboard & Reports reworked so you can see **every** category and its sub-categories (not just the top 5).
  - **Dashboard** is now an at-a-glance overview: each category shows a **progress bar** (its share of the cycle) and tapping one **expands** to reveal its sub-category amounts. Plus the cycle/all-time totals and recent expenses.
  - **Reports** is the visual/analytics view: category pie, monthly bar chart, top-5 expenses, cycle average, and a complete **“All Categories & Sub-categories”** tree listing every category with its sub-categories and shares — nothing hidden behind a dropdown anymore.


- ✅ **(2026-06-28)** Multi-word suggestions + reliable saving. Typing `mobile re` now keeps matching (e.g. `Mobile Recharge`) instead of switching to `re` words; picking a sub-category inserts `Parent Sub` so it always saves to the exact sub-category you chose; and suggestions are hidden after a comma so note text (e.g. `, papa`) can no longer hijack the category. The parser now strips punctuation on both sides (so `Mobile/Internet` matches) and matches multi-word category/sub-category names.
- ✅ **(2026-06-28)** Settings now has an **About** card showing the app **version** (`v1.1.0`) and the **build date/time** of the deployed code, so you can confirm on your phone whether the latest update actually went live. Version is bumped per release; the build time stamps automatically.
- ✅ **(2026-06-28)** Sub-categories can now have their own **emoji**, just like categories. Add/edit an icon in the Categories screen and it shows everywhere the sub-category appears (chat reply, suggestions, Reels, Dashboard, edit screen).


- ✅ **(2026-06-28)** Reels now show the note (and fall back to the original typed text) so you can read what each expense was for.
- ✅ **(2026-06-28)** Smarter suggestions: duplicate sub-categories now show their parent (e.g. `↳ shopping · Home` vs `↳ shopping · Gym`), and the picker is two-stage — choose a category and it reveals that category's sub-categories instead of vanishing. A symbol toolbar above the input gives one-tap access to `#` (category picker) and the maths keys. To avoid clashing with `/` (divide), the suggestion trigger moved from `/` to **`#`**.
- ✅ **(2026-06-28)** Calculator engine: write an expression like `=20+20+60-15+2*6 tea` and it evaluates with correct operator precedence (here ₹97) before saving. Use `=, +, -, *, /, ( )`; `×`/`÷` work too.

- ✅ **(2026-06-28)** Expense **Reels** — a fun, Instagram-style way to review a cycle's expenses.
  - _Fix:_ added a 6th bottom-bar tab. A centred picker at the top (‹ / › arrows, defaults to the current cycle) chooses the cycle and shows its total + count. Below it, expenses are full-screen cards you swipe vertically (scroll-snap), each with a big category icon, amount, category/subcategory, date and note, plus inline **Edit** and **Delete**. A live counter shows your position.

- ✅ **(2026-06-28)** Edit screen Save/Cancel buttons were hidden behind the bottom tab bar.
  - _Fix:_ the edit modal now renders in a top-level portal above everything (z-index raised), so the buttons always sit above the tab bar.
- ✅ **(2026-06-28)** Dashboard "this cycle" / "all-time" totals were too wide and caused horizontal scrolling.
  - _Fix:_ stat numbers now wrap, grid columns can shrink, and the app clips horizontal overflow.
- ✅ **(2026-06-28)** Reports "Spent" / "Daily Average" were too wide; wanted cycle average instead of daily.
  - _Fix:_ same overflow fixes, and "Daily Average" is replaced by **Cycle Average** (total ÷ number of cycles).
- ✅ **(2026-06-28)** Wanted to add a note alongside the category from chat, e.g. `1000 mobile, ayush`.
  - _Fix:_ text after a comma is now saved as the expense note; the part before is parsed for amount + category.
- ✅ **(2026-06-28)** Wanted suggestions / autocomplete for categories & subcategories in chat (incl. typing `/`).
  - _Fix:_ a suggestion strip now appears above the input — type `/` (or 2+ letters of a name) and tap a chip to insert it.
- ✅ **(2026-06-28)** Overall UI felt basic; wanted a more modern, classy iPhone-like look.
  - _Fix:_ refreshed theme — indigo→violet gradients, softer dark palette, elevated cards with shadows, gradient buttons/bubbles, pill-highlighted active tab, gradient app title.
- ✅ **(2026-06-28)** A newly added category wasn't recognized when adding an expense (went to Uncategorized), and the edit screen had no visible Save button on phone.
  - _Fix:_ categories/subcategories now register an alias; parser also matches category names directly; chat reloads categories per entry; edit-modal footer pinned so Save is always visible.