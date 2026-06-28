# Issues & Improvements

To add something, just write a new bullet under **Open** — one line is enough.
When it's fixed, I'll move it to **Done** with the date and a short fix note.

Status key: 🔴 open · 🟡 in progress · ✅ done

## Open

_(nothing open right now — add a bullet here whenever you think of something)_



## Done

- ✅ **(2026-06-28)** **Cleaner tab swiping.** Diagonal swipes no longer cause a jarring jump: the gesture now locks to either vertical scroll or horizontal swipe on the first movement, so scrolling won't accidentally flip tabs. While you swipe sideways a floating hint shows which tab you're heading to (e.g. `📈 Reports ›`), the content follows your finger a little, and the new tab fades in smoothly instead of snapping.
- ✅ **(2026-06-28)** **Review a big spend.** On a “big spend” reel you can now tap **✅ Reviewed** to acknowledge it — the card turns calm **green** with a steady “✅ Reviewed” badge (no more pulsing pink) so it stops grabbing your attention. Tap **↩️ Unreview** to flip it back.
- ✅ **(2026-06-28)** **Category reordering redone.** Replaced the up/down arrows with a **drag handle** (⠿) — press and drag it to move a category anywhere in the list; the new order saves automatically.
- ✅ **(2026-06-28)** **Sound cues.** Adding an expense now plays a short, fun sound — a happy rising chime when it lands in a category, a different falling tone when it's uncategorized, and a soft blip when you save a note. Toggle it in **Settings → Sounds** (on by default; no audio files, so nothing extra is downloaded).
- ✅ **(2026-06-28)** **Notes are now Reels.** A chat message with no amount is saved as a note and shows up as an amber **📝 Note** card in the Reels feed (so chat stays uncluttered). On that card you can type an amount and **➕ Add expense** — any category/sub-category mentioned in the note is picked up automatically — or mark it **✓ Done**, or **🗑️ Delete** it. Plain notes with no category still show clearly for reference.


- ✅ **(2026-06-28)** Duplicate sub-category went to the wrong parent. Typing `200 mobile` and picking **Home → Mobile Recharge** used to save under **Ayush → Mobile Recharge**. The parser now matches the **category name first**, then resolves the sub-category *inside that category*, so the one you pick is the one that's saved.
- ✅ **(2026-06-28)** **Swipe between tabs.** You can now swipe left/right anywhere on the screen to move between the bottom tabs, like a normal phone gesture (vertical scrolling still works as before).
- ✅ **(2026-06-28)** **Recurring (repeat) expenses.** Settings now has a **Recurring** card where you can set up expenses that repeat **daily / weekly / monthly** (e.g. rent on a fixed day). They're added automatically when you open the app; if a date needs changing you can edit that one expense normally. Recurring rules are included in backups. (Kept out of chat on purpose so chat stays simple.)
- ✅ **(2026-06-28)** **Keyboard no longer jerks.** Tapping a suggestion chip or a maths/`#` key used to make the keyboard close and reopen on every tap. The input now keeps focus, so the keyboard stays put.
- ✅ **(2026-06-28)** **Multi-word sub-categories fixed.** `200 Ayush Mobile Recharge , extra internet` now saves to **Ayush → Mobile Recharge** with the note **“extra internet”** — the last word of a two-word sub-category no longer leaks into the note.
- ✅ **(2026-06-28)** **Removed “All Cycles” from Settings** — it wasn't needed.
- ✅ **(2026-06-28)** **Backup banner moved.** The orange “Back up your expenses” bar no longer sits on top of every tab. Instead, Settings → Data Safety shows a small reminder pill only when a backup is overdue (7+ days / never).
- ✅ **(2026-06-28)** **Reorder categories.** Each category in the Categories screen now has ⬆️/⬇️ buttons to move it up or down, so you can bring your main ones to the top. (Used buttons instead of drag-and-drop because they're far more reliable on a phone; the chosen order is saved.)
- ✅ **(2026-06-28)** **Chat notes/reminders.** Send a message with **no amount** and it's kept in the chat as a note/reminder instead of being ignored, and your chat history now **persists across app restarts**. (Unknown words on a real expense still save as that expense's note.)
- ✅ **(2026-06-28)** **Reels excitement.** Big expenses now stand out on the Reels page with a hot rose/pink gradient background, a glowing amount, and a pulsing **“💸 Big spend!”** badge. The threshold is adjustable in **Settings → Reels Highlight** (set 0 / empty to turn it off).


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