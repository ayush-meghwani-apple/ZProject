# Issues & Improvements

To add something, just write a new bullet under **Open** — one line is enough.
When it's fixed, I'll move it to **Done** with the date and a short fix note.

Status key: 🔴 open · 🟡 in progress · ✅ done

## Open

_(nothing open right now — add a bullet here whenever you think of something)_

## Done

- ✅ **(2026-07-03)** **Notes text formatting.** The note editor's bottom bar now has **B / I / U / S** (bold, italic, underline, strikethrough) plus two colour swatches — **A** for text colour and **🖍️** for highlight — each opening a full colour picker. Select some text and tap a button/colour to style it; formatting is kept when the note is saved.

- ✅ **(2026-07-03)** **Notes redesigned into a free-form editor.** No more boxes — each note is now just a **fixed title on top and one big writing area** that fills the screen, like a normal notes app. The bottom bar keeps only the useful shortcuts: **• List**, **🖼️ Image**, and **▦ Table** (the separate "text"/"link" blocks and the up/down/delete controls are gone). **Tables** can grow or shrink with **＋Row / ＋Col / －Row / －Col** (shown when your cursor is in a table), and each **cell supports bullet lists and images** too. Old notes are converted to the new format automatically. Also added a **Clear all** button in the 🔔 reminders inbox to dismiss everything at once.

- ✅ **(2026-07-03)** **New "Notes" sub-app.** Added under **Personal** in the ☰ menu (🗒️ Notes). Keep as many notes as you like; each opens a block editor where you can stack **text paragraphs**, **bulleted lists**, **images** (pick from your gallery/photos or **paste** a screenshot — big photos are auto-shrunk so they don't bloat storage), and **links** (type a URL and it becomes a tappable link). Blocks can be **reordered** (⬆️/⬇️) or removed, notes **autosave** as you type, and everything is stored on-device and included in your backups. (Tables and rich URL "unfurled" titles are noted for a later pass.)

- ✅ **(2026-07-03)** **Reminders + 🔔 bell inbox.** Every expense on the **Reels** tab now has an **⏰ Remind** button — pick 1 / 3 / 6 / 11 / 12 months and you'll be nudged to add it again (e.g. a yearly car-insurance premium). A **🔔 bell** in the header shows a badge for anything due; tapping it opens a **Reminders** inbox split into **Due** and **Upcoming**, where you can **Add now** (re-creates the expense in one tap), **Snooze** a week, or **Dismiss**. Best-effort **local notifications** fire for due reminders when you open the app (enable them from the inbox). No server needed, so nothing runs in the background — reminders surface as you use the app.
- ✅ **(2026-07-03)** **Add an expense straight from Reels.** A floating **＋** button on the Reels tab pops a quick box — type like chat (e.g. `500 groceries`) and it's added and shown as a new reel, so you can log something you spot while reviewing without switching tabs. Plus a **weekly review nudge** that lands in the bell inbox and, when tapped, jumps you straight to Reels to catch anything forgotten.
- ✅ **(2026-07-03)** **Pie chart drill-down.** In **Summary → Spend by Category**, tapping a slice now **drills into that category's sub-category breakdown** as its own pie (with a **← All categories** button to go back).
- ✅ **(2026-07-03)** **Typed category now wins over a look-alike alias.** Adding `20 Home Mobile Recharge` was landing under **Ayush → Mobile Recharge** because a single-word alias (`mobile` → Ayush) was matched before the category you actually typed. The parser now resolves the **named category first**, then the sub-category **within that category**, and only falls back to aliases when no category is named — so `Home Mobile Recharge` stays under Home, `Ayush Mobile Recharge` stays under Ayush, and a bare `mobile` still uses its alias.
- ✅ **(2026-07-03)** **Reels cycle bar & counter no longer overlap.** The cycle capsule (centre) and the `1 / 21` position counter now sit in one centred row; a long cycle name truncates inside its pill instead of sliding under the counter.
- ✅ **(2026-07-03)** **Cleaner app switching.** Going back from Questify to Expensify no longer jerks/bounces — the whole-app swap now plays one consistent transition and the inner tab-slide no longer fires on mount (which was causing the double animation).
- ✅ **(2026-07-03)** **Removed the empty band under the bottom tabs.** The app now fills the exact visible viewport (fixed a `100dvh` vs fixed-viewport mismatch), so the tab bar sits flush at the bottom of the screen with no dead space beneath it.

- ✅ **(2026-06-28)** **The app is now "Expensify" with sub-apps.** The header shows a **☰ hamburger** on the left that opens a left drawer grouped into **Money → Expensify** and **Planning → Goals** (Investments listed as "soon"). Tapping a sub-app swaps the whole UI. The app always **starts on Expensify**. The bottom **Settings** tab is shared: inside a sub-app it shows only the cross-app cards — **Data Safety, Backup & Sync, About** — since backup is one file for the whole app. (The internal database name and backup file format are unchanged, so all your existing expenses and backups carry over untouched.)
- ✅ **(2026-06-28)** **Goals sub-app (first version).** Add a goal with its **cost today, years away, inflation %, amount already saved, monthly saving, yearly step-up %** and **expected return %**. Each goal card shows the **inflation-adjusted future cost** (e.g. ₹10L today at 6% → **₹10.60L** in 1 year), what your savings + stepped-up SIP will **actually grow to**, whether you're **on track** or the **shortfall**, the **monthly SIP needed** to hit it, total invested, and a progress bar. There's also a standalone **Step-up SIP calculator** at the top (e.g. ₹10,000/mo with 10% yearly step-up over 2 years) for quick what-ifs. (Rough first cut as you asked — send more ideas and I'll build on it.)
- ✅ **(2026-06-28)** **Dashboard + Reports merged into one "Summary" tab.** Instead of two overlapping tabs there's now a single **📊 Summary**: cycle filter, spent + all-time totals, a **Spend by Category** pie, a collapsible category/sub-category breakdown, a **Monthly Spend** bar chart, and your recent expenses (with edit/delete). One place to see everything; tell me if you want anything split back out.


- ✅ **(2026-06-28)** **Sub-category rows don't break with long names.** Adding an emoji + a long name (e.g. "💊 Mobile Recharge Premium Plan") no longer squeezes the row — the name now takes the space it needs (wrapping to a second line if truly long) while the "N aliases" pill and edit/delete buttons stay intact on one line.
- ✅ **(2026-06-28)** **Cleaner tab transition.** Dropped the fade-from-transparent (which looked like the tab was loading) — tabs now do a quick, fully-opaque directional **slide** so it reads as a clean page change, not a reload.
- ✅ **(2026-06-28)** **Every category gets its own color.** New categories now automatically pick an unused color from an 18-colour palette (no more everything defaulting to grey). Your **existing** categories are also repaired automatically on app open — any that shared a color are re-assigned a unique one, so the reports/charts are easy to read. (No manual colour picker, as requested — it just works.)
- ✅ **(2026-06-28)** **Dashboard vs Reports "by category" clarified.** They serve different purposes, so each now has a one-line subtitle: **Dashboard** is a quick, collapsible glance for the selected cycle (with your recent expenses below), while **Reports** is the full always-expanded breakdown that pairs with the pie/monthly charts. Kept both — tell me after a week if you'd rather I merge or drop one.


- ✅ **(2026-06-28)** **You can see which category you moved.** After tapping ⬆️/⬇️ the moved category briefly **glows** and shows a small **"↕ moved"** badge that fades on its own — so even when a short list jumps around, it's clear which one shifted.
- ✅ **(2026-06-28)** **Classier tab transitions.** Switching tabs (by tap or swipe) now does a smooth directional **slide + fade** — the new tab slides in from the right when going forward, from the left when going back — instead of a plain snap. (Tuned to ~0.5s; a full 1–2s felt sluggish when tapping around, but it now feels deliberate and clean.)
- ✅ **(2026-06-28)** **Aliases are now editable.** The "N aliases" pill on each sub-category is a button — tap it to see the words that match it in chat (e.g. "chai" → Tea), **remove** any with ✕, or **add** your own. (Aliases are how typed words get matched to a category/sub-category.)


- ✅ **(2026-06-28)** **Reordering now follows the moved category.** When you tap ⬆️/⬇️, the screen now scrolls to keep the moved category centered in view, so you can keep tapping to move it across a long list without manually scrolling.
- ✅ **(2026-06-28)** **Slimmer tab bar.** Trimmed the extra blank space below the 6 bottom tabs (kept just the thin band iOS needs for the home indicator).
- ✅ **(2026-06-28)** **No more chat auto-scroll jerk.** Opening the chat (by swipe or tap) now lands already scrolled to the latest message instead of visibly jumping; new incoming messages still scroll in smoothly.
- ✅ **(2026-06-28)** **Recurring expenses are marked on Reels.** Expenses auto-created from a recurring rule now show a **↻ Recurring** badge on their reel, so you can tell at a glance you didn't add them by hand.

- ✅ **(2026-06-28)** **"Faaah" success sound.** Your `faaah.mp3` now plays on every successful expense add (chat add, note→expense, and reviewing a big spend), precached so it works offline, still behind the **Settings → Sounds** toggle.
- ✅ **(2026-06-28)** **Reels content is back.** Reels were showing blank cards (only the count was right): the last layout change broke the height chain that the full-screen cards depend on. Restored a definite height so each reel renders its icon, amount, category and actions again.
- ✅ **(2026-06-28)** **Removed the gap under the chat box.** The input bar had an extra bottom inset on top of the one the tab bar already adds — trimmed, so it now sits flush above the tabs.
- ✅ **(2026-06-28)** **No more stray horizontal scrollbar.** The scroll area implicitly allowed sideways scrolling; locked it to vertical only, so the phantom horizontal bar during swiping is gone.
- ✅ **(2026-06-28)** **Reliable category reordering.** Drag-and-drop was flaky on the phone (couldn't drop, or only scrolled), so it's replaced with simple **⬆️ / ⬇️ buttons** on each category — tap to move it up or down; the order saves instantly.


- ✅ **(2026-06-28)** **Chat input pinned to the bottom.** The typing box + symbol bar now sit just above the tab bar even when there are only a few messages — no more empty gap. (Root cause: the swipe wrapper added last release had no height, which collapsed the chat/reels layout; fixed with a proper flex height chain.)
- ✅ **(2026-06-28)** **`#` category list scrolls without flipping tabs.** The category/symbol strips now scroll horizontally on their own; a sideways drag there no longer gets read as a tab swipe.
- ✅ **(2026-06-28)** **Reels are full‑screen again.** One reel fills the screen like Instagram/Shorts, the cycle bar + counter stay pinned, and only the reels scroll (same flex‑height fix as the chat gap).
- ✅ **(2026-06-28)** **More sound cues.** Converting a note to an expense and reviewing / un‑reviewing a big‑spend reel now play sounds too (not just adding from chat).
- ✅ **(2026-06-28)** **Drag‑and‑drop reordering, done properly.** Pressing the ⠿ handle now lifts a **floating "ghost"** of the category that follows your finger, the list **auto‑scrolls** when you drag near the top/bottom edge (so you can drop a category beyond the ones currently on screen), a **dashed gap** shows exactly where it'll land, and **left/right tab swiping is disabled while you drag**.
- ✅ **(2026-06-28)** **Smoother tab swiping.** Swiping no longer fights horizontal scroll areas (the `#` list) or an active drag; while you swipe the current view follows your finger and the next tab fades in instead of snapping.


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