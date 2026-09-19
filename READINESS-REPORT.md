# Deep Check & Readiness Report

**Scope:** Google Sheets read path, Firestore sync, and a security pass over every
authentication and data path. **Date:** 2026-09-19 · **Branch:** `arena/01a0ba27-shristi-hub`

Every number in this report comes from a command that was actually run (`npm test`,
`npx tsc --noEmit`, `npm run build`, live probes of the Apps Script endpoint).

---

## 1. Google Sheets read — why it failed, and what changed

### What was wrong

| # | Root cause | Effect |
| --- | --- | --- |
| 1 | **No endpoint was configured anywhere by default.** The URL only ever came from `localStorage` or the `VITE_COUNCIL_SHEETS_API` build variable. | On the live site nothing was configured, so House Points, Calendar and Monetary Fund silently fell back to the hub's own stored data. |
| 2 | The Firestore copy was read **once, at page load, before sign-in** — and the read function returned `null` unless a Firebase user already existed. | Even an administrator who had saved the URL never propagated it to a fresh visitor. Sign-in did not re-read it. |
| 3 | **Test connection disabled the JSONP fallback** (`allowJsonp: false`) while real refreshes used it. | In browsers that block the `script.google.com` → `script.googleusercontent.com` redirect, the test failed even when the sections would have loaded. |
| 4 | The endpoint was never verified end-to-end as a read path. | No evidence trail for "is it actually connected?" |

### What it does now

* `src/lib/sheets/config.ts` **hardcodes the council endpoint** as
  `BUILT_IN_SHEETS_API_URL` —
  `https://script.google.com/macros/s/AKfycbxfxpiahF3PGrm4BTpZzKI13jQPsmu4ViDiK39bxxP_zWrrPEPewJYgpjZJ8PM-whD-/exec`
  — so the three sections read the spreadsheet **with no setup at all**.
* Precedence: admin-saved (this browser) → Firestore `publicConfig/sheets` → build variable →
  built-in endpoint. **Disconnect** is per device and also clears the shared override.
* The shared config is now read **before, during and after sign-in** and kept live with a
  Firestore `onSnapshot` listener that re-subscribes when the auth state changes.
* **Test connection uses the same two transports as a real refresh** (fetch → JSONP), and the
  ping response now reports the spreadsheet name and any missing tabs.
* The admin panel shows where the current endpoint came from, has a
  **restore the built-in endpoint** action, and reports when a save could not be published to
  Firestore (the local connection still works, and the message says so).

### Live verification of the deployed endpoint

| Probe | Result |
| --- | --- |
| `?section=ping` | `ok: true`, spreadsheet **“Council data”**, tabs `House Points`, `Calendar`, `Monetary Fund`, `tokenRequired: false`, rows 3 / 5 / 2 |
| `?section=housePoints` | 3 rows — Spelling Bee (Senior) Annapurna · Inter-house Football Dhaulagiri · Science Quiz Manaslu |
| `?section=finances` | 2 rows; dates arrive as Sheets serials (`46144`) and are parsed to `2026-05-02` |
| `?section=ping&callback=…` | Returns `__councilSheetsCallback123({…});` — the JSONP fallback really is served by the live deployment |

---

## 2. Firestore sync — why it failed, and what changed

| # | Root cause | Fix |
| --- | --- | --- |
| 1 | Auto-sync effects were gated on `cloudReadyRef.current` (a ref). The subscription flips it true **asynchronously**, and nothing re-ran the effects. | Cloud readiness is React state now, with the effects depending on it, so the first write after sign-in is no longer skipped. |
| 2 | Sign-in was all-or-nothing: any `provisionFirebaseProfile()` failure (rules not deployed, `permission-denied`, offline) signed the user straight back out. | Provisioning is best-effort: the member is signed in, and a clear toast explains that cloud sync is off and why. |
| 3 | Inbox and activity listeners could reject without an error handler. | Both now handle errors and degrade quietly instead of raising unhandled rejections. |
| 4 | Roster records are rule-restricted to the primary administrator, but “Upload all site data” was offered to every admin and aborted the whole upload when the roster step failed. | The hub state still uploads; the roster step is reported honestly (“sign in with the primary administrator to publish new sign-in emails”). |
| 5 | `publicConfig/sheets` required sign-in to read, and the docs claimed the rules validated its shape — they did not. | Rules now allow public read (it is public, read-only configuration) and validate keys, `https` URL, size and refresh interval on write. |

**Deploy reminder:** the rules change takes effect only after
`firebase use shristi-hub && firebase deploy --only firestore:rules,firestore:indexes,hosting`.
The built-in Sheets endpoint works with or without it (the client falls back to
`BUILT_IN_SHEETS_API_URL`).

---

## 3. Vulnerabilities fixed

1. **Shared role passwords** — `admin123`, `council123`, `teacher123`, `grade123`,
   `student123` were accepted for *any* account of that role (including the primary
   administrator). Removed everywhere; the offline fallback now requires the account's own
   password and exists only in development builds.
2. **Admin credentials published on the public login page** — the “Quick demo accounts”
   panel listed `72019arnab` / `admin123`. Removed.
3. **Role impersonation on the live site** — the `DEMO PLATFORM` strip let anyone switch to
   the administrator account with no credential. Removed entirely (production builds also
   refuse the underlying call).
4. **Fake alias “verification”** — a 6-digit code generated with `Math.random()` in the
   browser, stored in `localStorage`, with `123456` always accepted and the code itself
   returned inside the error message. The module is deleted; aliases are now confirmed by an
   administrator on the roster (*Login Emails → Verify now*), and the login/Council Hub copy
   points users there.
5. **Plaintext passwords in browser storage** — the roster (every student's password) was
   written to `localStorage`. Production builds now strip `password`/`passwordHash` before
   persisting.
6. **Shared default passwords for new accounts** — administrator-created accounts used
   `student123`/`teacher123`/`grade123`. Each new account now gets a random one-time password
   (`SHR-XXXX-XXXX`, CSPRNG-backed), and the reset dialog has a **Generate one-time password**
   action instead of “Use default”.
7. **Storage rules** — an admin check that ignored account status; now requires an
   `active` profile.
8. **Repo hygiene** — `.gitignore` now excludes `.env*` and `serviceAccount*.json`;
   `backend/firestore.rules` is marked **do not deploy** (the root `firestore.rules` is the
   deployed source of truth).
9. **Regression guard** — new `npm run test:security` (14 checks) fails the build if any of
   the above is undone (shared passwords, dev-only gating, credentials in storage, secrets,
   hardcoded endpoint, rule shape, open writes, rules syntax).

---

## 4. Verification

| Command | Result |
| --- | --- |
| `npm test` | **security 14/0 · council 50/50 · sheets 49/0 · tasks 7/7 · polls 8/8 · render 11/11 ×2** |
| `npx tsc --noEmit` | clean |
| `npm run build` | succeeds — `dist/index.html` 3,065 kB (gzip 1,573 kB) |
| bundle scan | hardcoded endpoint **present**; `admin123` **absent**; `DEMO PLATFORM` **absent** |
| new tests | built-in endpoint precedence, disconnect semantics, JSONP fallback (simulated blocked `fetch`), built-in endpoint active with zero configuration |

A live dev preview is running on port **5173** (`Council Hub (dev preview)`). It runs a
development build, so it shows the development sign-in panel (roster accounts, no passwords) —
Google sign-in cannot work from a preview domain because Firebase only allows its authorized
domains.

---

## 5. What still needs a human

1. **Deploy the rules and the site:**
   `firebase use shristi-hub && firebase deploy --only firestore:rules,firestore:indexes,hosting`.
2. **Firebase Console:** confirm Google is enabled under Authentication and that your hosting
   domains are listed under Authorized domains; enable Email/Password if the hub should keep
   offering password sign-in.
3. **Optional:** Web Push still needs the public VAPID key (Admin Panel → Firestore Sync).
4. **Sign in once as `72019arnab@shristiacademy.edu.np` in the deployed app** — that first
   login publishes the roster and the email index that every other account depends on.

## 6. Known limitations (by design)

* The Apps Script `/exec` URL is a **public, read-only** capability: anyone who has it can read
  the three tabs. Do not keep sensitive data in House Points, Calendar or Monetary Fund.
* The endpoint has no shared token (`SHARED_TOKEN = ''`); set one in `apps-script/Code.gs` and
  in Admin Panel → Google Sheets if you want the extra (obfuscation-level) check.
* Development-only strings such as “Development sign-in” can remain in the production bundle as
  dead branches; the guarded code never runs there.
* Web Push background delivery still has to be sent from the Firebase Console (Spark plan).
