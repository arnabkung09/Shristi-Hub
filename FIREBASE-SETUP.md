# Firebase Deployment

The app is configured for Firebase project `shristi-hub`.

## Console Setup

1. In Firebase Console → Authentication → Sign-in method, enable Google.
2. Add the production domain to Authentication → Settings → Authorized domains.
3. Create a Cloud Firestore database in Native mode.
4. In Project Settings → Cloud Messaging → Web Push certificates, generate a key pair.
5. Sign in as Arnab with Google. His first login writes the roster and email index directly to Firestore.
6. Open Admin Panel → Roster Sync and paste the public VAPID key.

The first successful Google sign-in by `72019arnab@shristiacademy.edu.np` seeds the Firestore roster and provisions the admin profile using rule-protected client writes. Other Google identities are admitted only when their email matches a primary school email or an admin-managed alias.

On first account creation, a student verifies the primary school Google account and links a Firebase Email/Password credential to the same Firebase user. Future password sign-in uses the primary school email. Personal aliases remain available for Google sign-in.

When an administrator removes a student or email alias, roster sync deletes the matching email-index record. Firestore active-member rules require that index entry, so the removed Google identity loses access even if a previous Auth session has not expired yet.

## Deploy

From a terminal with Firebase CLI authenticated:

```bash
firebase use shristi-hub
firebase deploy --only firestore:rules,firestore:indexes,hosting
```

Hosting runs `npm run build` before deployment. This configuration uses no Cloud Storage and no Cloud Functions, so it is compatible with Firebase's Spark plan.

> The rules in this repository are the deployed source of truth (`firebase.json` points at
> `firestore.rules`). `backend/firestore.rules` is the older roster service's copy and must
> not be deployed.

## Data Model

- `roster/{studentId}`: server-managed account identity and authorized emails.
- `users/{firebaseUid}`: provisioned Firebase identity and role.
- `hubState/main`: real-time application state. Admin writes; active users read.
  `councilHubMembers` inside this document is the Council Hub access list.
- `hubChat/council/messages/{messageId}`: the Council Hub conversation. Read and write
  require the signed-in roster id to appear in `hubState/main.councilHubMembers`.
- `deviceTokens/{uid_tokenHash}`: FCM browser tokens owned by the authenticated user.
- `inbox/{uid}/items/{notificationId}`: real-time Firestore notification inboxes.
- `userActivity/{uid}`: each authenticated member's own RSVP, vote, rating, read, and task activity.
- `publicConfig/messaging`: shared public Web Push VAPID key.
- `publicConfig/sheets`: the read-only Google Sheets endpoint used by House Points,
  Calendar, and Monetary Fund (see `GOOGLE-SHEETS-SETUP.md`).

## Council Hub Access

Membership is explicit and administrator-controlled. There is no role, house, or class that
opens the hub by itself:

- Administrators add or remove accounts in **Admin Panel → Council Hub** (or from the
  **Manage members** dialog on the Council Hub page).
- Only accounts on that list can read or post in `hubChat/council/messages`; every other
  signed-in account sees a locked hub with no message content.
- The primary administrator always stays on the list so the hub can never be locked out.
- Added and removed accounts receive an in-app notification.

The Firestore rules derive membership from the shared state document:

```
function councilHubMember() {
  return activeMember()
    && exists(/databases/$(database)/documents/hubState/main)
    && profile().data.id in get(/databases/$(database)/documents/hubState/main).data.councilHubMembers;
}
```

Writers may only post as themselves (`authorId == profile().data.id`), message bodies are
capped at 1500 characters, and only the author or an administrator may remove a message.

Council chat never travels inside `hubState/main`, because every active member can read that
document. After deploying this change, the next administrator write replaces the hub document
without the legacy `councilMessages` array; delete the field manually in the console if you
want it gone before then.

## Google Sheets configuration document

House Points, Calendar, and Monetary Fund can read from a council spreadsheet instead of the
hub's own records (see `GOOGLE-SHEETS-SETUP.md`). Only the connection settings live in
Firestore, in `publicConfig/sheets`:

```
publicConfig/sheets
  apiUrl       "https://script.google.com/macros/s/AKfy…/exec"   // public, read-only
  token        "optional shared word checked by Apps Script"
  houseMap     { "Dhaulagiri": "Blue", "Annapurna": "Red", "Manaslu": "Green" }
  sections     { housePoints: true, calendar: true, finances: true }
  pollSeconds  60
```

**Everyone** may read the document — signed in or not — so the House Points, Calendar and
Monetary Fund sections paint from the built-in endpoint on first load; only administrators
may write it, and the rules validate the shape (known keys only, an `https` URL, a clamped
refresh interval). No Google API key, service-account JSON, or OAuth secret is stored here —
the endpoint is public and read-only, and all edits happen inside the spreadsheet itself.

## Security Notes

- No service-account credentials are shipped to the browser.
- **Production sign-in is Firebase Authentication only.** Google OAuth or a Firebase
  Email/Password credential is required; there is no local password store and no shared
  role password. Local (non-Firebase) password sign-in and the role switcher exist only in
  development builds and are refused by the shipped code.
- Added sign-in emails (aliases) are confirmed by an administrator on the roster
  (Admin Panel → Students → Login Emails → **Verify now**). There is no self-service
  confirmation code, because the old one was generated in the browser and proved nothing.
- Passwords never reach browser storage: production builds persist the roster without the
  `password` field.
- Firestore rules allow only the authenticated primary administrator to seed roster/index data and admins to overwrite admin-controlled hub state.
- Council Hub reads and writes are checked against the explicit member list in the rules, so a signed-in account that was never added cannot read the conversation even with a modified client.
- Email lookups in the rules (`emailIndex`, profile provisioning, the primary-admin check) compare lowercased addresses, because Google sign-in tokens keep the letter case the account was created with while the roster stores lowercase emails — mixed-case addresses otherwise fail with `permission-denied`.
- Members write only their own `userActivity/{uid}` document.
- Admin Panel → Roster Sync includes explicit **Upload all site data** and **Load existing Firestore data** controls.
- FCM registration and receiving messages are Spark-compatible. Send background pushes from Firebase Console. Programmatic FCM fan-out needs a trusted server/Cloud Function and therefore is intentionally not included in this free-plan configuration.
- The Firebase web API key and VAPID public key are identifiers, not secrets. App Check should be enabled before public production launch.