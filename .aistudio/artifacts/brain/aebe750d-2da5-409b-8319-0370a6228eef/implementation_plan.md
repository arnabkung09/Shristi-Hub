# Permanent Fix for Branding Form Drafts & Sync Protection

This plan eliminates all form auto-reversions on the Branding & Content administration page by decoupling the form inputs into a persistent local draft that never gets overwritten by background database polling, cloud subscriptions, or file-picker focus events, and only commits to the live site and database when the administrator explicitly clicks Save.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following workflow decisions were confirmed directly from your answers and govern how the Branding & Content form behaves from start to finish:

- **Confirmed Decision 1 — Explicit Save Only (Zero Auto-Revert)**: Form inputs (`Council Name`, `Board Line`, `Session Label`, `Tagline`, `Footer Credit`, `House Names`, and `Terms & Credits`) remain strictly in your local form draft while you are typing and filling out the form. Background sync polls, window focus events, and remote state broadcasts are completely blocked from resetting or overwriting your form inputs.
- **Confirmed Decision 2 — Staged Logo Uploads**: Selecting or removing a Council Logo or House Logo optimizes and previews the image inside the form draft immediately without triggering a premature mid-form database save or resetting any other fields you are editing. All staged logos and text fields are committed together when you click Save.
- **Confirmed Decision 3 — Cross-Tab & Session Draft Persistence**: Unsaved edits and staged logos are continuously backed up to a dedicated draft storage slot in the browser. Switching between Admin tabs, opening native file dialogs, or switching browser windows preserves your exact work-in-progress until you either click **Save** or explicitly click **Discard Draft / Reset**.

---

## 1. Overview & Core Concept

- **What It Does**: Provides a rock-solid, distraction-free Branding & Content editor for Council Administrators where text fields, house identities, legal documents, and uploaded logos can be edited in any order and at any pace without ever snapping back to previous values.
- **Target Audience / Persona**: Council Administrators and Executive Officers configuring school identity, custom logos, house crests, and legal pages.
- **Key Value**: Complete elimination of race conditions between user typing, native OS file-picker focus events, 8-second MongoDB background polls, and Firestore snapshot listeners.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Opening the Branding Editor**: On mount, the editor checks if an unsaved draft exists in browser storage. If a draft exists, it restores all in-progress text fields and staged logos immediately and displays a clear **Unsaved Draft Active** status bar with one-click **Save All Changes** and **Discard Draft** actions. Otherwise, it initializes once from the current active branding state.
  2. **Editing Text & Staging Logos**: As the administrator types into any Council, House, or Legal input—or uploads/removes a Council or House logo—the changes update the local draft and live preview cards immediately, while persisting to the browser's draft cache on every keystroke or file selection.
  3. **Switching Tabs or Windows Mid-Edit**: Opening the OS file picker (which triggers window blur/focus events) or navigating to another Admin tab and returning leaves all draft fields 100% intact.
  4. **Explicit Save & Atomic Sync**: Clicking **Save Branding**, **Save House Branding**, **Save Content**, or **Save All Changes** atomically commits the draft to the application store, updates the canonical branding cache with a fresh modification timestamp, pauses incoming background poll merges during the save window, and persists the complete state to MongoDB and Firestore.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-craft SaaS administration console with crisp single-elevation panels (`1px solid var(--border)`), clear typographic hierarchy, and zero decorative clutter.
  - *Color Palette & Mood*: Deep slate/obsidian dark surface tokens (`--background`, `--surface`, `--surface-inset`) paired with high-contrast text (`--text`, `--muted`) and semantic status indicators (emerald for saved confirmation, amber for unsaved draft notice, crimson for validation errors).
  - *Typography & Hierarchy*: Expressive display headings (`Plus Jakarta Sans` / `Outfit`) paired with readable body controls and `tabular-nums` for character counters and timestamps.
  - *Component Styling & Layout*: Balanced two-column split for Council Identity and Legal Content above a three-column House Identity grid, with a unified top action bar showing real-time draft vs. saved status.
- **Interactive Feedback & Motion**: Instantaneous (<100ms) local preview updates for logos and titles across the Top Logo, Home Screen, and Notification preview cards; clear saving spinner states on action buttons; and a dismissible confirmation banner upon save completion.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Complete Decoupling of Form Draft State from Live Polling State**
  - *Chosen Approach*: Initialize the Branding form state from a dedicated persistent draft (`shristi_branding_form_draft_v1`) or a one-time snapshot of the store on mount, and **never** allow `useEffect` listeners on `state.branding`, `state.houses`, or `state.legal` to overwrite the form while the user is on the page (except on the initial cold load before any user interaction if the remote database finishes its very first fetch).
  - *Why*: Previously, background 8-second polling, Firestore snapshot listeners, and `window.onfocus` listeners (triggered automatically by the browser whenever a user closes the native file-upload dialog) caused `state.branding` references to change and reset form fields mid-edit.
  - *Alternatives Considered*: Per-field dirty flags (`useRef` booleans) were brittle because saving one section (or uploading a logo) cleared the dirty flag or triggered a cross-section database round-trip that overwrote adjacent sections.
- **Decision 2: Staging Logo Uploads + Global Save Cooldown Lock**
  - *Chosen Approach*: Selecting a logo file compresses and stages the image in the form draft without firing an automatic network save. When the user clicks Save, a global save lock (`lastLocalSaveTimestamp`) blocks incoming remote poll responses from overwriting the newly saved state for 15 seconds while the database write settles.
  - *Why*: Prevents stale in-flight GET requests from reverting newly saved branding or resetting half-filled text inputs right after a file upload.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌───────────────────────────────────────────────────────────────────────────┐
│                     Branding & Content Editor (UI)                        │
│                                                                           │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌───────────────────┐  │
│  │ Council Identity &  │  │  House Names &      │  │ Terms & Credits   │  │
│  │ Staged Logo Draft   │  │  Staged Crests      │  │ Document Draft    │  │
│  └──────────┬──────────┘  └──────────┬──────────┘  └─────────┬─────────┘  │
│             └────────────────────────┼───────────────────────┘            │
│                                      ▼                                    │
│             ┌─────────────────────────────────────────────────┐           │
│             │   Persistent Draft Store (Browser Storage)      │           │
│             │   • Auto-saved on every keystroke & file stage  │           │
│             │   • Immune to 8s polls, tab switches & blur     │           │
│             └────────────────────────┬────────────────────────┘           │
└──────────────────────────────────────┼────────────────────────────────────┘
                                       │
                        [ User Clicks "Save" Button ]
                                       │
                                       ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                     Hub State & Sync Engine (Store)                       │
│                                                                           │
│  1. Atomic Dispatch (SET_BRANDING + SET_HOUSE_BRANDING + SET_LEGAL)       │
│  2. Stamp lastLocalSaveAt & Activate 15s Poll-Overwrite Guard             │
│  3. Write Canonical Local Cache + Push to MongoDB (/api/state) & Cloud    │
└───────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - **Form Draft Entity**: Stores `{ branding, houses, legal, isDirty, updatedAt }` in `localStorage` under a dedicated draft key whenever any field or logo is modified in the form.
  - **Save Lock & Timestamp Guard**: Tracks `lastLocalMutationAt` inside the central store so that any background `pullRemoteState` or `focus` sync launched before or shortly after a local save cannot overwrite local branding, house, or legal slices with older server snapshots.
- **Interactive Component & State Mapping**:
  - **Typing in Any Field**: Updates component state + writes to the persistent draft slot (`isDirty = true`). Zero network calls or store dispatches occur while typing.
  - **Uploading / Removing a Logo**: Runs client-side transparency-preserving compression (`compressLogoImage`), updates the staged `logoUrl` in the form draft (`isDirty = true`), and updates the live preview cards immediately.
  - **Clicking Save (Section or Save All)**: Normalizes fields, dispatches the updated state to the store, clears the draft flag (`isDirty = false`), removes the temporary draft key, activates the save cooldown guard, and writes the unified state to MongoDB and Firestore.
  - **Clicking Discard Draft**: Clears the stored draft and reloads the currently active saved branding from the store.
