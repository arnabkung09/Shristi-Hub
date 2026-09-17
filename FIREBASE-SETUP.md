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

## Data Model

- `roster/{studentId}`: server-managed account identity and authorized emails.
- `users/{firebaseUid}`: provisioned Firebase identity and role.
- `hubState/main`: real-time application state. Admin writes; active users read.
- `deviceTokens/{uid_tokenHash}`: FCM browser tokens owned by the authenticated user.
- `inbox/{uid}/items/{notificationId}`: real-time Firestore notification inboxes.
- `userActivity/{uid}`: each authenticated member's own RSVP, vote, rating, read, and task activity.
- `publicConfig/messaging`: shared public Web Push VAPID key.

## Security Notes

- No service-account credentials are shipped to the browser.
- Firestore rules allow only the authenticated primary administrator to seed roster/index data and admins to overwrite admin-controlled hub state.
- Members write only their own `userActivity/{uid}` document.
- Admin Panel → Roster Sync includes explicit **Upload all site data** and **Load existing Firestore data** controls.
- FCM registration and receiving messages are Spark-compatible. Send background pushes from Firebase Console. Programmatic FCM fan-out needs a trusted server/Cloud Function and therefore is intentionally not included in this free-plan configuration.
- The Firebase web API key and VAPID public key are identifiers, not secrets. App Check should be enabled before public production launch.