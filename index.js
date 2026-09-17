import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";

initializeApp();
setGlobalOptions({ region: "asia-south1", maxInstances: 10 });

const db = getFirestore();
const ADMIN_EMAIL = "72019arnab@shristiacademy.edu.np";
const HOUSES = new Set(["Blue", "Red", "Green"]);
const ROLES = new Set(["admin", "council", "student"]);

function requireAuth(request) {
  if (!request.auth?.uid || !request.auth.token.email) throw new HttpsError("unauthenticated", "Google authentication is required.");
  return { uid: request.auth.uid, email: String(request.auth.token.email).toLowerCase() };
}

async function requireAdmin(request) {
  const auth = requireAuth(request);
  if (auth.email === ADMIN_EMAIL) return auth;
  const profile = await db.doc(`users/${auth.uid}`).get();
  if (!profile.exists || profile.data()?.role !== "admin" || profile.data()?.status !== "active") {
    throw new HttpsError("permission-denied", "Administrator access is required.");
  }
  return auth;
}

function validateStudent(value) {
  if (!value || typeof value !== "object") throw new HttpsError("invalid-argument", "Invalid student record.");
  if (!value.id || !value.name || !value.email) throw new HttpsError("invalid-argument", "Student id, name, and email are required.");
  if (!/^[^\s@]+@shristiacademy\.edu\.np$/i.test(value.email)) throw new HttpsError("invalid-argument", "Primary email must use the school domain.");
  if (!Number.isInteger(value.grade) || value.grade < 1 || value.grade > 10) throw new HttpsError("invalid-argument", "Grade must be 1 through 10.");
  if (!HOUSES.has(value.house) || !ROLES.has(value.role)) throw new HttpsError("invalid-argument", "Invalid house or role.");
  const aliases = Array.isArray(value.aliases) ? value.aliases.map((email) => String(email).toLowerCase()) : [];
  if (aliases.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email))) throw new HttpsError("invalid-argument", "Invalid email alias.");
  return { ...value, aliases, emails: [String(value.email).toLowerCase(), ...aliases] };
}

async function writeRoster(students) {
  if (!Array.isArray(students) || students.length < 1 || students.length > 2000) throw new HttpsError("invalid-argument", "Roster must contain 1 to 2000 students.");
  const normalized = students.map(validateStudent);
  const allEmails = normalized.flatMap((student) => student.emails);
  if (new Set(allEmails).size !== allEmails.length) throw new HttpsError("invalid-argument", "Roster contains duplicate primary or alias emails.");
  for (let start = 0; start < normalized.length; start += 400) {
    const batch = db.batch();
    normalized.slice(start, start + 400).forEach((student) => batch.set(db.doc(`roster/${student.id}`), student));
    await batch.commit();
  }

  const activeIds = new Set(normalized.map((student) => student.id));
  const existingRoster = await db.collection("roster").get();
  const staleRoster = existingRoster.docs.filter((snapshot) => !activeIds.has(snapshot.id));
  for (let start = 0; start < staleRoster.length; start += 400) {
    const batch = db.batch();
    staleRoster.slice(start, start + 400).forEach((snapshot) => batch.delete(snapshot.ref));
    await batch.commit();
  }

  // Revoked roster members lose Firestore access even if an old Google session remains valid.
  const profiles = await db.collection("users").get();
  const revoked = profiles.docs.filter((snapshot) => !activeIds.has(snapshot.data().id));
  for (let start = 0; start < revoked.length; start += 400) {
    const batch = db.batch();
    revoked.slice(start, start + 400).forEach((snapshot) => batch.set(snapshot.ref, { status: "removed", updatedAt: FieldValue.serverTimestamp() }, { merge: true }));
    await batch.commit();
  }
  return normalized.length;
}

export const seedRoster = onCall(async (request) => {
  const auth = requireAuth(request);
  if (auth.email !== ADMIN_EMAIL) throw new HttpsError("permission-denied", "Only the primary administrator can seed the roster.");
  const count = await writeRoster(request.data?.students);
  const adminRecord = request.data.students.find((student) => String(student.email).toLowerCase() === ADMIN_EMAIL);
  if (!adminRecord) throw new HttpsError("invalid-argument", "Primary administrator is missing from the roster.");
  await db.doc(`users/${auth.uid}`).set({ ...validateStudent(adminRecord), firebaseUid: auth.uid, googleEmail: auth.email, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { count };
});

export const syncRoster = onCall(async (request) => {
  await requireAdmin(request);
  return { count: await writeRoster(request.data?.students) };
});

export const ensureProfile = onCall(async (request) => {
  const auth = requireAuth(request);
  const matches = await db.collection("roster").where("emails", "array-contains", auth.email).limit(2).get();
  if (matches.empty) throw new HttpsError("permission-denied", "This Google email is not linked to a student roster account.");
  if (matches.size > 1) throw new HttpsError("failed-precondition", "This email is linked to multiple students. Contact an administrator.");
  const student = matches.docs[0].data();
  await db.doc(`users/${auth.uid}`).set({ ...student, firebaseUid: auth.uid, googleEmail: auth.email, status: "active", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { studentId: student.id, role: student.role, email: auth.email };
});

function matchesAudience(token, audience) {
  if (!audience || audience.kind === "all") return true;
  if (audience.kind === "user") return token.studentId === audience.userId;
  if (audience.kind === "role") return token.role === audience.role || (audience.role === "council" && token.role === "admin");
  if (audience.kind === "house") return token.house === audience.house;
  if (audience.kind === "grade") return token.grade === audience.grade;
  return false;
}

export const sendPush = onCall(async (request) => {
  const auth = await requireAdmin(request);
  const { title, body, urgent = false, audience = { kind: "all" }, actionTab = "dashboard" } = request.data ?? {};
  if (typeof title !== "string" || !title.trim() || title.length > 140) throw new HttpsError("invalid-argument", "Push title is required and must be 140 characters or less.");
  if (typeof body !== "string" || !body.trim() || body.length > 1600) throw new HttpsError("invalid-argument", "Push body is required and must be 1600 characters or less.");

  const tokenSnapshot = await db.collection("deviceTokens").where("enabled", "==", true).get();
  const docs = tokenSnapshot.docs.filter((snapshot) => matchesAudience(snapshot.data(), audience));
  const tokens = [...new Set(docs.map((snapshot) => snapshot.data().token).filter(Boolean))];
  let successCount = 0;
  let failureCount = 0;
  const staleTokens = [];

  for (let start = 0; start < tokens.length; start += 500) {
    const chunk = tokens.slice(start, start + 500);
    const response = await getMessaging().sendEachForMulticast({
      tokens: chunk,
      data: { title: title.trim(), body: body.trim(), urgent: String(Boolean(urgent)), actionTab: String(actionTab), notificationId: `push-${Date.now()}` },
      webpush: {
        headers: { Urgency: urgent ? "high" : "normal", TTL: urgent ? "3600" : "86400" },
        fcmOptions: { link: `https://shristi-hub.web.app/#${String(actionTab).replace(/^[/#]+/, "")}` },
      },
    });
    successCount += response.successCount;
    failureCount += response.failureCount;
    response.responses.forEach((item, index) => {
      const code = item.error?.code ?? "";
      if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token")) staleTokens.push(chunk[index]);
    });
  }

  if (staleTokens.length) {
    const staleDocs = tokenSnapshot.docs.filter((snapshot) => staleTokens.includes(snapshot.data().token));
    for (let start = 0; start < staleDocs.length; start += 400) {
      const batch = db.batch();
      staleDocs.slice(start, start + 400).forEach((snapshot) => batch.delete(snapshot.ref));
      await batch.commit();
    }
  }

  await db.collection("pushHistory").add({ title: title.trim(), body: body.trim(), urgent: Boolean(urgent), audience, actionTab, senderUid: auth.uid, targetedDevices: tokens.length, successCount, failureCount, createdAt: FieldValue.serverTimestamp() });
  return { targetedDevices: tokens.length, successCount, failureCount };
});

export const syncUserActivity = onCall(async (request) => {
  const auth = requireAuth(request);
  const profileSnapshot = await db.doc(`users/${auth.uid}`).get();
  if (!profileSnapshot.exists || profileSnapshot.data()?.status !== "active") throw new HttpsError("permission-denied", "An active roster profile is required.");
  const profile = profileSnapshot.data();
  const studentId = profile.studentId || profile.id;
  const incoming = request.data || {};

  await db.runTransaction(async (transaction) => {
    const ref = db.doc("hubState/main");
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpsError("failed-precondition", "The administrator must initialize cloud state first.");
    const current = snapshot.data();

    const candidateEvents = new Map((Array.isArray(incoming.events) ? incoming.events : []).map((item) => [item.id, item]));
    const events = (current.events || []).map((event) => {
      const candidate = candidateEvents.get(event.id);
      if (!candidate) return event;
      const attendees = new Set(Array.isArray(event.attendees) ? event.attendees : []);
      if (Array.isArray(candidate.attendees) && candidate.attendees.includes(studentId)) attendees.add(studentId); else attendees.delete(studentId);
      if (attendees.size > Number(event.capacity || 0)) throw new HttpsError("resource-exhausted", "Event capacity has been reached.");
      return { ...event, attendees: [...attendees] };
    });

    const candidatePolls = new Map((Array.isArray(incoming.polls) ? incoming.polls : []).map((item) => [item.id, item]));
    const polls = (current.polls || []).map((poll) => {
      if ((poll.voters || []).includes(studentId)) return poll;
      const candidate = candidatePolls.get(poll.id);
      if (!candidate || !Array.isArray(candidate.voters) || !candidate.voters.includes(studentId) || !Array.isArray(candidate.votes)) return poll;
      const changes = candidate.votes.map((value, index) => Number(value) - Number((poll.votes || [])[index] || 0));
      if (changes.filter((change) => change === 1).length !== 1 || changes.some((change) => change !== 0 && change !== 1)) throw new HttpsError("invalid-argument", "Invalid poll vote update.");
      return { ...poll, votes: candidate.votes, voters: [...(poll.voters || []), studentId] };
    });

    const candidateRatings = Array.isArray(incoming.siteRatings) ? incoming.siteRatings : [];
    const ownRating = candidateRatings.find((rating) => rating.userId === studentId);
    let siteRatings = (current.siteRatings || []).filter((rating) => rating.userId !== studentId);
    if (ownRating && Number.isInteger(ownRating.value) && ownRating.value >= 1 && ownRating.value <= 5) {
      siteRatings = [{ userId: studentId, userName: profile.name, house: profile.house, value: ownRating.value, comment: String(ownRating.comment || "").slice(0, 300), timestamp: Date.now() }, ...siteRatings];
    }

    const candidateNotifications = new Map((Array.isArray(incoming.notifications) ? incoming.notifications : []).map((item) => [item.id, item]));
    const notifications = (current.notifications || []).map((notification) => {
      const candidate = candidateNotifications.get(notification.id);
      if (!candidate?.readBy?.includes(studentId)) return notification;
      return { ...notification, readBy: [...new Set([...(notification.readBy || []), studentId])] };
    });

    const candidateTasks = new Map((Array.isArray(incoming.tasks) ? incoming.tasks : []).map((item) => [item.id, item]));
    const tasks = (current.tasks || []).map((task) => {
      const candidate = candidateTasks.get(task.id);
      if (!candidate || task.assigneeId !== studentId || !["todo", "progress", "review", "done"].includes(candidate.status)) return task;
      return { ...task, status: candidate.status };
    });

    const currentSuggestionIds = new Set((current.suggestions || []).map((suggestion) => suggestion.id));
    const newSuggestions = (Array.isArray(incoming.suggestions) ? incoming.suggestions : []).filter((suggestion) => !currentSuggestionIds.has(suggestion.id)).slice(0, 3).map((suggestion) => ({
      id: String(suggestion.id).slice(0, 100), category: String(suggestion.category).slice(0, 60), text: String(suggestion.text).slice(0, 3000), anonymous: Boolean(suggestion.anonymous),
      authorId: suggestion.anonymous ? null : studentId, authorLabel: suggestion.anonymous ? "Anonymous" : `${profile.name} · Grade ${profile.grade}`,
      status: "pending", timestamp: Date.now(),
    }));

    transaction.set(ref, { events, polls, siteRatings, notifications, tasks, suggestions: [...newSuggestions, ...(current.suggestions || [])], syncedAt: Date.now() }, { merge: true });
  });
  return { ok: true };
});