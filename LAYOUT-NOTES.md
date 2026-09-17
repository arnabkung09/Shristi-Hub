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
- `src/components/EventsAndNews.tsx`: month calendar, event types, day detail, and news cards.
- `src/components/AdminNotificationsHub.tsx`: audience-targeted composer, templates, history.

## Roster Management

The source roster is a code snapshot of the school-provided Google Sheet. The custom importer was removed. Administrators can still add students, edit names, grades, and houses, reset credentials and activation, and remove students. Primary emails use `@shristiacademy.edu.np`, and grades stay within Grade 1-10. The primary administrator record (Arnab Shrestha) is protected from deletion and identity changes to prevent lockout.

The bundled roster contains the sheet's 121 student rows: Blue 40, Red 41, and Green 40. The source has three obvious `shriatiacademy.edu.np` typos, one blank email, and one duplicate email assigned to two different house rows. Domain typos are corrected. The blank and duplicate rows use clearly labeled provisional school addresses and are shown in the Admin roster as requiring verification.

## House Hub

Each house has its own hub. Administrators belong to all three and can appoint one captain per house from that house's students. Captains and administrators can post instructions or messages, which notify that house's members. Students see only their own house hub.

## Events & News

The calendar shows one month at a time with category chips, today shortcut, and month navigation. Administrators can add an event to any date (select a day, or double-click it), edit or delete events, and manage event type categories. Students register from the day detail panel. News is a separate card grid drawn from council announcements.

## Branding & Content

Administrators control the crest or uploaded logo, council name, board line, session label, home tagline, footer credit line, and the full Terms & Conditions and Credits pages. Content supports `## ` headings and shows a live preview.

## Integration Boundaries

This is a browser-based demonstration, not production authentication. Data and demo credentials use local storage; the current session is per tab. Do not enter real credentials or sensitive school records.

BroadcastChannel synchronizes open tabs on the same browser origin, not devices over a network. Desktop notifications require browser permission in a secure context. Firebase/FCM is shown as not connected. The source spreadsheet URL is retained as roster provenance; the application does not include a spreadsheet importer.

## Verification

The Vite production build is verified. Browser interaction tests, Firebase rules tests, and external Google Sheets connectivity are not automated in this environment.
