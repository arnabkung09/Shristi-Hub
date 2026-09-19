# Google Sheets setup — House Points, Calendar, and Monetary Fund

The Council Hub reads **three sections** live from one Google spreadsheet:

| Section | Spreadsheet tab | Columns | What the hub does with it |
| --- | --- | --- | --- |
| House Points | `House Points` | `Specific` · `Type` · `House` · `Position` · `Teams Won` · `Points` | House Tracker totals, current leader, recent results, standings |
| Calendar | `Calendar` | `Date` · `Type` · `Details` | Month grid, agenda, upcoming list, day list, homepage "upcoming" |
| Monetary Fund | `Monetary Fund` | `Date` · `Type` · `Amount` · `Description` | Total income, total expenses, balance = income − expenses |

That is the whole schema — six columns, three columns, four columns. No IDs, no statuses, no
student or approval columns. Council members type a row; the hub adds the numbers up.

Everything else in the hub (announcements, suggestion box, gallery, digital vault, tasks,
notifications, accounts, council chat) is untouched and does **not** use the spreadsheet.

The website is **read-only**: council members add or edit rows in the spreadsheet and the hub
picks them up on the next refresh (on load, every minute by default, and immediately with the
**Refresh now** button). No Google credentials, API keys, or service accounts are ever placed
in the website — only a public, read-only Apps Script URL.

---

## 1. Create the spreadsheet (one click)

1. Open <https://script.google.com> → **New project**.
2. Delete the sample code, paste the whole of [`apps-script/Code.gs`](apps-script/Code.gs), and save.
3. In the function dropdown pick **`setup`** → **Run** → allow the permissions it asks for.

`setup()` creates a spreadsheet called *Shristi Council Hub Data* with the three tabs fully
configured — headers, colours, frozen header row, filter, dropdowns, date and number formats,
and a few example rows taken from section 4 — and prints its URL in **Execution log**. Open the URL, delete
the example rows when you start for real, and enter your own.

Running `setup()` again is safe: it repairs the headers and dropdowns and never touches rows
that already have content.

### Already have a spreadsheet of your own?

Point the script at it and let it tidy up the headers:

1. Open your spreadsheet → **Extensions → Apps Script** (this binds the script to that file),
   paste [`apps-script/Code.gs`](apps-script/Code.gs), and save.
   *Or*, in a standalone project, paste your spreadsheet ID into `SPREADSHEET_ID` at the top
   of the file (the ID is the long string in the spreadsheet URL between `/d/` and `/edit`).
2. Run **`setup`** — it adds any missing tab (with the exact headers, dropdowns and formats)
   and leaves tabs that already exist alone.
3. Run **`fixHeaders`** if your existing tabs use your own column titles. It renames the
   header cells to the names the API expects (`Event` → `Specific`, `Category` → `Type`,
   `Event Name`/`When`/`Day Type` → `Details`/`Date`/`Type`, `Particulars` → `Description`, …),
   adds any missing column at the end, and logs exactly what it changed. Your rows and column
   order are never touched, and extra columns (an old `Point ID`, `Remarks`, `Venue`, …) are
   simply ignored by the hub.
4. Continue with **section 2** below to deploy and connect.

### Manual alternative

If you would rather build the spreadsheet yourself, create one spreadsheet with three tabs and
copy these headers into row 1 exactly (extra columns are ignored, but keep it simple):

`House Points`
`Specific` · `Type` · `House` · `Position` · `Teams Won` · `Points`

`Calendar`
`Date` · `Type` · `Details`

`Monetary Fund`
`Date` · `Type` · `Amount` · `Description`

Then apply what the script would have applied:

* **Row 1**: bold, white on a dark fill, **View → Freeze → 1 row**; **Data → Create a filter**.
* **`House Points → Type`** dropdown: `Individual`, `Team`.
* **`House Points → House`** dropdown: `Dhaulagiri`, `Annapurna`, `Manaslu`.
* **`House Points → Position`** dropdown: `1`, `2`, `3`.
* **`Calendar → Type`** dropdown: `Holiday`, `Normal`, `Competition`, `Event`, `Examination`.
* **`Monetary Fund → Type`** dropdown: `Income`, `Expense`.
* **Both `Date` columns**: format `dd/mm/yyyy` (the hub also reads `2026-05-02` and
  `2 May 2026`).
* **`Amount`, `Points`, `Teams Won`**: plain number format (`#,##0.00` for Amount).

> The hub is deliberately forgiving: `Rs 1,500`, `1.500,00`, `(250)` for negatives, `1st`
> instead of `1`, `Dhaulagiri House` instead of `Dhaulagiri`, and trailing blank rows are all
> understood. Rows it cannot use are skipped and listed as a warning in the sync strip.

## 2. Deploy the read-only API

1. In the Apps Script project: **Deploy → New deployment**.
2. Click the gear → **Web app**.
3. **Description**: `Council Hub read API`.
   **Execute as**: **Me**.
   **Who has access**: **Anyone** (required — the website is not a signed-in Google client).
4. **Deploy**, authorise, and copy the **Web app URL**. It looks like
   `https://script.google.com/macros/s/AKfy…/exec`.

Optional: to stop strangers who find the URL from reading it, set `SHARED_TOKEN = 'some-word'`
at the top of `Code.gs`, redeploy (**Deploy → Manage deployments → Edit → Version: New version**),
and enter the same word in the hub. This is obfuscation, not real security — anyone with both
values can read the three tabs.

### Check the endpoint

Open these in a browser (or `curl`):

* `<web-app-url>?section=ping` → the spreadsheet name, its tabs, and any missing tabs.
* `<web-app-url>?section=housePoints` → the House Points rows as JSON.

Expected shape:

```json
{
  "ok": true,
  "section": "housePoints",
  "updatedAt": "2026-09-18T06:12:44.812Z",
  "count": 6,
  "rows": [{ "specific": "Spelling Bee (Senior)", "type": "Individual", "house": "Annapurna", "position": "1", "teamsWon": 1, "points": 3 }],
  "warnings": []
}
```

Calendar rows come back as `{ "date": "2026-05-02", "type": "Holiday", "details": "Weekend" }`
and Monetary Fund rows as
`{ "date": "2026-05-02", "type": "Income", "amount": 5000, "description": "Event collection" }`.

### Read transport

The browser tries `fetch` first. Google answers a `/exec` request with a redirect to
`script.googleusercontent.com`, which some browsers refuse for cross-origin `fetch`, so the
client automatically repeats the request as JSONP (`&callback=…`, which Apps Script answers
with the same JSON wrapped in a function call). **Test connection** uses the same path, so a
green result means the sections really will load. There is no Google API key, service
account or OAuth secret anywhere in this flow.

## 3. Connect the hub

**The council's endpoint is already built in.** `src/lib/sheets/config.ts` hardcodes the
deployed `/exec` URL, so House Points, Calendar and Monetary Fund read from the council
spreadsheet on every device with no setup at all — signed in or not. The precedence is:

| Order | Source | Notes |
| --- | --- | --- |
| 1 | Admin Panel → Google Sheets (this browser) | Wins over everything else once saved |
| 2 | Firestore `publicConfig/sheets` | Published by **Save connection**, reaches every device |
| 3 | `VITE_COUNCIL_SHEETS_API` | Build-time override |
| 4 | Built-in endpoint (`BUILT_IN_SHEETS_API_URL`) | Active by default |

**Disconnect** in the admin panel turns the sections back to the hub's own stored data on
that device and removes the shared Firestore override; saving a connection (or pressing
*restore the built-in endpoint* and saving) switches them back on.

To point the hub at a different spreadsheet:

1. Sign in as an administrator → **Admin Panel → Google Sheets**.
2. Paste the `/exec` URL, and the shared token if you set one.
3. Leave **Auto-refresh** at 60 seconds (or pick 15–3600).
4. Check the three sections you want the spreadsheet to own. A connected section becomes
   read-only in the hub — points, calendar entries and transactions are then entered in the
   spreadsheet instead.
5. If your sheet uses different house names, adjust **House names used in the sheet**
   (defaults: `Dhaulagiri → Blue`, `Annapurna → Red`, `Manaslu → Green`; `Blue`/`Red`/`Green`
   always work).
6. Press **Test connection** (uses `section=ping`), then **Save connection**.
7. Open **House Tracker**, **Events & News**, and **Finance** — each shows a *Google Sheets*
   strip with the row count, the last-sync time, and **Refresh now**.

Admins' settings are stored in this browser and mirrored to the Firestore document
`publicConfig/sheets`, so **every** visitor picks them up when they open the hub (that
document is public, read-only configuration — see `FIREBASE-SETUP.md`). If the Firestore
write fails, the panel says so: the connection still works in that browser, and signing in
with Google publishes it for everyone.

**Build-time alternative.** Add the endpoint to the environment before building or starting
the dev server to override the built-in URL for a whole deployment:

```bash
# .env.local
VITE_COUNCIL_SHEETS_API=https://script.google.com/macros/s/AKfy…/exec
VITE_COUNCIL_SHEETS_TOKEN=some-word          # only if SHARED_TOKEN is set
VITE_COUNCIL_SHEETS_POLL=60                  # seconds, 15–3600
```

## 4. What to type in each tab

**House Points** — one row per result, for example:

| Specific | Type | House | Position | Teams Won | Points |
| --- | --- | --- | --- | --- | --- |
| Spelling Bee (Senior) | Individual | Annapurna | 1 | 1 | 3 |
| Inter-house Football | Team | Dhaulagiri | 2 | 1 | 4 |
| Science Quiz | Individual | Manaslu | 3 | 1 | 1 |

* `Type` is `Individual` or `Team`; `House` is `Dhaulagiri`, `Annapurna` or `Manaslu`.
* `Position` is `1`, `2` or `3`. `Teams Won` is how many teams won (informational).
* **`Points` is the column the hub adds up.** Leave it blank and the hub uses the standard
  table — Individual `1st = 3`, `2nd = 2`, `3rd = 1`; Team `1st = 6`, `2nd = 4`, `3rd = 2` —
  which is handy for special awards and deductions you want to set yourself.
* Totals, the current leader, and the recent-results ledger are calculated; there is no totals
  table to maintain.

**Calendar** — one row per date:

| Date | Type | Details |
| --- | --- | --- |
| 02/05/2026 | Holiday | Weekend |
| 05/05/2026 | Competition | Spelling Bee |
| 08/05/2026 | Examination | Mathematics Examination |
| 10/05/2026 | Event | Council Assembly |
| 12/05/2026 | Normal | Department Meeting |

* `Type` must be one of `Holiday`, `Normal`, `Competition`, `Event`, `Examination`.
* `Details` is the line the hub shows everywhere (month cell, agenda, upcoming list, detail card).
* The hub decides what is past, today and upcoming from `Date`, so nothing else needs updating.
* A date with several rows shows them stacked in the month cell with a *+N more* note.

**Monetary Fund** — one row per transaction:

| Date | Type | Amount | Description |
| --- | --- | --- | --- |
| 02/05/2026 | Income | 5000 | Event collection |
| 03/05/2026 | Expense | 1500 | Event materials |

* `Type` is `Income` or `Expense`; `Amount` is always a positive number.
* Total income, total expenses and the balance (income − expenses) update automatically.
* Rows with a missing amount or an unknown type are ignored and reported as a warning.

The hub never writes to the spreadsheet, so there is nothing to protect from the website.

## 5. Troubleshooting

| Symptom | Fix |
| --- | --- |
| *Refresh failed — network* | Re-open `<web-app-url>?section=ping`. If it asks for a Google sign-in, redeploy with **Who has access: Anyone**. |
| *Unauthorised: the shared token…* | The token in **Admin Panel → Google Sheets** does not match `SHARED_TOKEN` in `Code.gs`. |
| *Tab "House Points" was not found* | Rename the tab, or change `TABS` at the top of `Code.gs` / run `setup()` again. |
| Totals or dates look empty | The header text is not what the API expects. Run **`fixHeaders`** in the Apps Script editor. |
| *N rows were skipped* | Those rows have no house or no points (House Points), no date or no details (Calendar), or no amount (Monetary Fund). Fix them in the sheet. |
| *Unrecognised house names: …* | Add the name in **House names used in the sheet** (Admin Panel → Google Sheets). |
| *Unrecognised Type: …* | Calendar types are the five listed above; other words fall back to a Normal day. |
| Section shows *Hub data* | That section is switched off, or the connection was not saved. |
| Data looks stale | Press **Refresh now**; otherwise the hub refreshes on load, on tab focus, and every minute. |

## 6. Verification checklist

1. Add a House Points row (e.g. `Annapurna`, `Individual`, `1`, `1`, `3`) → **House Tracker**
   totals, the leader card and the results ledger update after a refresh.
2. Add a Calendar row dated tomorrow → it appears in the month grid, under **Today/Upcoming**
   and in the **Agenda** tab; click it and the detail card shows Details / Type / Date.
3. Add an `Income` row → **Finance** total income and balance rise.
4. Add an `Expense` row → total expenses rise and the balance falls.
5. Confirm nothing else changed: announcements, suggestion box, gallery, vault, tasks,
   notifications, and council chat behave exactly as before.

## 7. Files

| File | Purpose |
| --- | --- |
| `apps-script/Code.gs` | The read-only API plus `setup()` which builds/repairs the spreadsheet. |
| `src/lib/sheets/types.ts` | The JSON contract (row keys the API returns). |
| `src/lib/sheets/parse.ts` | Tolerant cell parsing (dates, `Rs` amounts, blank cells, blank rows). |
| `src/lib/sheets/derive.ts` | Turns rows into totals, standings, calendar entries and the finance summary. |
| `src/lib/sheets/client.ts` | Fetch + JSONP transport and connection test. |
| `src/lib/sheets/context.tsx` | Sync engine: load, poll, focus refresh, manual refresh, last-updated. |
| `src/components/SheetSyncBar.tsx` | The per-section sync strip (count, last updated, Refresh now, errors). |
| `src/components/admin/SheetsConnection.tsx` | Admin Panel → Google Sheets (endpoint, token, mapping, toggles). |
| `scripts/sheets.test.ts` | Parsing, totals and transport regression tests (`npm run test:sheets`). |
| `scripts/render.test.tsx` | Server-render checks for every touched screen (`npm run test:render`). |
