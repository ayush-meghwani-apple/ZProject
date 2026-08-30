# Connect Gmail to Kaizen (one-time setup)

Kaizen can read your **bank & card alert emails** and turn them into expenses,
so you stop losing track. It uses **read-only** Gmail access, entirely in your
browser — no server, nothing leaves your device.

Because Gmail's read scope is "restricted", you create your **own** Google
project and keep it in **Testing** mode with just your email allowed. That means
**no Google verification and no cost** — the only trade-off is you re-approve
access every so often (tokens are short-lived).

You only do this once. It takes ~10 minutes.

---

## 1. Create a Google Cloud project

1. Go to <https://console.cloud.google.com/> and sign in with the Gmail account
   whose emails you want to read.
2. Top bar → project dropdown → **New Project**. Name it e.g. `Kaizen`. Create,
   then select it.

## 2. Enable the Gmail API

1. Go to **APIs & Services → Library** (or
   <https://console.cloud.google.com/apis/library/gmail.googleapis.com>).
2. Search **Gmail API** → open it → **Enable**.

## 3. Configure the Google Auth Platform

The console now calls this the **Google Auth Platform** (search "Google Auth
Platform", or open **APIs & Services → OAuth consent screen** and it redirects
there). The old single "consent screen" is split across the left-nav items:

1. **Branding** — set App name (`Kaizen`) and your support email if not already
   filled. (You must complete this before you can create a client.)
2. **Audience** — User type **External**; **Publishing status** must be
   **Testing** (do NOT publish). Under **Test users** click **+ Add users** and
   add **your own Gmail address** → Save.
3. **Data Access** — click **Add or remove scopes**, filter for `gmail.readonly`,
   tick **`.../auth/gmail.readonly`** → **Update** → **Save**. (Any
   "needs verification" notice only applies if you publish; ignore it while in
   Testing.)

## 4. Create the OAuth client id

1. Left nav → **Clients** → **Create OAuth client** (or the **Create OAuth
   client** button on the Overview page).
2. Application type: **Web application**. Name: `Kaizen web`.
3. **Authorized JavaScript origins → Add URI** — add BOTH:
   - `http://localhost:5173`
   - `https://ayush-meghwani-apple.github.io`
4. You can leave **Authorized redirect URIs** empty (the app uses the token flow).
5. **Create**. Copy the **Client ID** (looks like
   `1234567890-abc123.apps.googleusercontent.com`).

## 5. Paste it into Kaizen

1. Open Kaizen → **Settings** → **Auto-import from Gmail**.
2. Paste the Client ID → **Save**.
3. Tap **Sync now**. A Google window asks you to choose your account and approve
   read-only Gmail access. Because the app is in Testing you'll see an
   **"Google hasn't verified this app"** notice — click **Advanced → Go to Kaizen
   (unsafe)**. This is expected for your own private app; you are the developer.
4. Kaizen lists the transactions it found. Review the category, then **Import**
   (or **Import all spends**). Dismiss anything you don't want.

---

## Notes & troubleshooting

- **Re-approving:** Google testing-mode tokens are short-lived. If Sync says the
  session expired, just tap **Sync now** again and re-approve.
- **On iPhone (PWA):** if the Google popup is blocked or the app looks stuck,
  open Kaizen in **Safari** (not the installed PWA) for the sync, then go back to
  the PWA — data is shared. Report if this happens and we'll switch to the
  redirect flow.
- **Which emails:** HSBC credit card, ICICI Bank credit card, SBI Card (RuPay),
  and SBI savings-account alerts (these cover Paytm / CRED / PhonePe UPI debits
  from that account). To add a bank, edit `buildGmailQuery` in
  `src/core/emailParse.ts`.
- **Privacy:** the Client ID is not a secret, but it stays in your browser's
  local storage and is **not** committed to the repo. Your emails are read
  directly by your browser and never sent anywhere else.
- **Nothing imports twice:** each Gmail message id is remembered once imported or
  dismissed, so re-syncing is always safe.
