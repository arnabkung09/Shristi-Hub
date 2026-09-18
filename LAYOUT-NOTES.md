# Shristi Council Interface

The interface follows the supplied references: centered navy workspace, compact header, indigo demo strip, administration tabs, slate roster table, council directory, department milestones, and a two-column broadcast composer.

## Main Files

- `src/App.tsx`: section routing, footer, alerts.
- `src/index.css`: responsive layout, calendar, house hub, and light/dark theme.
- `src/components/AdminPanel.tsx`: eight administration tabs.
- `src/components/admin/RosterTable.tsx`: student search, filters, pagination, add/edit/remove, credential resets, imports.
- `src/components/admin/BrandingPanel.tsx`: logo, council name, session, tagline, footer credit, terms and credits editor.
- `src/components/admin/CouncilControls.tsx`: appointments, clearances, delegation, profile images.
- `src/components/CouncilMembers.tsx`: executive directory and department milestones.
- `src/components/HouseHub.tsx`: Blue, Red, and Green house hubs with captains and messaging.
- `src/components/CouncilHub.tsx`: membership-only council chat (Firestore room when signed in, device thread offline).
- `src/components/admin/CouncilHubMembersPanel.tsx`: admin panel section and dialog that add or remove Council Hub members.
- `src/lib/council.ts`: the membership and permission rules shared by the UI, the reducer, and the tests.
- `src/components/useHubChat.ts`, `src/components/useCouncilChat.ts`: Firestore room transport and the device/firestore selector.
- `src/components/EventsAndNews.tsx`: month calendar, event types, day detail, and news cards.
- `src/components/AdminNotificationsHub.tsx`: audience-targeted composer, templates, history.

## Roster Management

The source roster is a code snapshot of the school-provided Google Sheet. The custom importer was removed. Administrators can still add students, edit names, grades, and houses, reset credentials and activation, and remove students. Primary emails use `@shristiacademy.edu.np`, and grades stay within Grade 1-10. The primary administrator record (Arnab Shrestha) is protected from deletion and identity changes to prevent lockout.

The bundled roster contains the sheet's 121 student rows: Blue 40, Red 41, and Green 40. The source has three obvious `shriatiacademy.edu.np` typos, one blank email, and one duplicate email assigned to two different house rows. Domain typos are corrected. The blank and duplicate rows use clearly labeled provisional school addresses and are shown in the Admin roster as requiring verification.

## House Hub

Each house has its own hub. Administrators belong to all three and can appoint one captain per house from that house's students. Captains and administrators can post instructions or messages, which notify that house's members. Students see only their own house hub.

## Council Hub

The Council Hub is a closed chat room for the student council. Access is granted one account at
a time: an administrator adds a student (any roster account, including council officers and
staff) from **Admin Panel → Council Hub** or from the hub's own **Manage members** dialog, and
the student is notified in-app. Nobody — including administrators who were not added — can read
the conversation without being on that list, so a council title, house, or class never opens the
hub. Removing a member revokes access immediately while keeping their roster record, council
role, and past messages; the primary administrator cannot be removed.

When a member is signed in with Google, the thread is read from and written to the
membership-gated Firestore room `hubChat/council/messages`, so it is shared across devices and
the rules enforce the list server-side. Otherwise (demo or offline use) the same interface runs
against the locally persisted thread, synchronised between tabs of the same browser.

## Events & News

The calendar shows one month at a time with category chips, today shortcut, and month navigation. Administrators can add an event to any date (select a day, or double-click it), edit or delete events, and manage event type categories. Students register from the day detail panel. News is a separate card grid drawn from council announcements.

## Branding & Content

Administrators control the crest or uploaded logo, council name, board line, session label, home tagline, footer credit line, and the full Terms & Conditions and Credits pages. Content supports `## ` headings and shows a live preview.

## Integration Boundaries

This is a browser-based demonstration, not production authentication. Data and demo credentials use local storage; the current session is per tab. Do not enter real credentials or sensitive school records.

BroadcastChannel synchronizes open tabs on the same browser origin, not devices over a network. Desktop notifications require browser permission in a secure context. Firebase/FCM is shown as not connected. The source spreadsheet URL is retained as roster provenance; the application does not include a spreadsheet importer.

## Google Sheets-backed sections

House Points, Calendar, and Monetary Fund can be sourced from a council spreadsheet
(`GOOGLE-SHEETS-SETUP.md`). The sheets stay deliberately small — House Points is
`Specific | Type | House | Position | Teams Won | Points`, Calendar is `Date | Type | Details`,
and Monetary Fund is `Date | Type | Amount | Description` — and everything else is computed
by the hub.

`SheetsProvider` wraps the hub provider in `App.tsx`; when a section is connected, the hub
exposes the derived data through the same context fields the components already used
(`calendarEvents`, `financeEntries`, `houseTotals`), so the layout, navigation, animations,
and typography are unchanged. The House Tracker renders `sheets.housePoints.results` (there is
no student column, so the local points ledger and the per-student table are bypassed), and the
calendar renders the one `Calendar` dataset: month grid, agenda view, day list, upcoming
block, five per-type filters, and a Details/Type/Date detail card. Each connected section adds
a sync strip (`SheetSyncBar`) with the row count, last-updated time, and a **Refresh now**
button, and the Admin Panel gains a **Google Sheets** tab. Writing actions for a connected
section are refused with a message pointing at the spreadsheet. Unconnected sections keep
their existing local behaviour.

## Verification

The Vite production build is verified. `npm run test:council` bundles `scripts/council-hub.test.ts`
with esbuild and runs the Council Hub access-control checks in Node: explicit membership, the
administrator-only add/remove rules, posting and message removal permissions, the member list
helpers, and guards that keep the reducer and the Firestore rules aligned with the same list.
`npm run test:sheets` runs the spreadsheet bridge checks against fixture rows: tolerant cell
parsing (day-first dates, `Rs` amounts, blank cells and blank rows), the house-name mapping, the
standard scoring table and explicit `Points` overrides, the five calendar types with
today/upcoming/past grouping and per-type counts, the income/expense/balance arithmetic, and
the read-only transport itself against a local stand-in for the Apps Script endpoint (envelope
parsing, token/section query, server errors, timeouts).
`npm run test:render` server-renders every screen this feature touches —
twice: with nothing connected (the hub must look exactly as before) and with a spreadsheet
connected (standings, events, and the computed balance must reach the existing components),
plus the empty-tab and failed-refresh states. `npm test` runs all three suites. Browser
interaction tests, Firebase rules emulator tests, and a live Google endpoint are not automated
in this environment — run the checklist in `GOOGLE-SHEETS-SETUP.md` after deploying
`apps-script/Code.gs`.
