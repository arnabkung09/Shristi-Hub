/**
 * Council Hub access-control regression tests.
 *
 * Run with `npm run test:council`. The runner bundles this file with esbuild and
 * executes it in Node, so no browser or test framework is required.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  addCouncilMember,
  addCouncilMessage,
  canManageCouncilHubMembers,
  canOpenCouncilHub,
  canPostToCouncilHub,
  canReadCouncilHub,
  canRemoveCouncilMessage,
  councilCandidates,
  councilMembers,
  isCouncilHubMember,
  normalizeCouncilMessage,
  removeCouncilMember,
  removeCouncilMessage,
  sortCouncilMessages,
  COUNCIL_MESSAGE_LIMIT,
} from "../src/lib/council";
import type { CouncilChatMessage, HubState, Student } from "../src/lib/types";

/** Injected by scripts/run-council-tests.mjs so the bundled copy can find the sources. */
declare const __REPO_ROOT__: string;
const repoRoot = typeof __REPO_ROOT__ === "string" ? __REPO_ROOT__ : path.resolve(process.cwd(), "..");

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean) {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${label}`);
  }
}

function checkThrows(label: string, run: () => unknown, expected: string) {
  try {
    run();
    failures += 1;
    checks += 1;
    console.error(`  FAIL ${label} (expected an error containing "${expected}")`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    check(`${label} → "${message}"`, message.toLowerCase().includes(expected.toLowerCase()));
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

const student = (id: string, name: string, role: Student["role"], status: Student["status"] = "active"): Student => ({
  id,
  name,
  email: `${id}@shristiacademy.edu.np`,
  password: "test-password",
  grade: 9,
  gradeLabel: "Grade 9",
  house: "Blue",
  houseLabel: "Blue House",
  status,
  role,
  councilTitle: role === "council" ? "Sports Captain" : role === "admin" ? "President" : undefined,
  createdAt: "2026-01-01",
});

const primaryAdmin = student("shr-085", "Arnab Shrestha", "admin");
const secondAdmin = student("shr-001", "Bina Adhikari", "admin");
const councilOfficer = student("shr-002", "Anjali Nepal", "council");
const secondOfficer = student("shr-003", "Anjan Bhattarai", "council");
const plainStudent = student("shr-004", "Sita Rai", "student");
const pendingStudent = student("shr-005", "Ram Gurung", "student", "pending");
const teacher = student("shr-006", "Teacher Tara", "teacher");

const roster: Student[] = [primaryAdmin, secondAdmin, councilOfficer, secondOfficer, plainStudent, pendingStudent, teacher];

/** Mirrors the seeded state: only the primary administrator starts on the list. */
const seedState = (): Pick<HubState, "councilHubMembers" | "councilMessages" | "users"> => ({
  users: roster.map((member) => ({ ...member })),
  councilHubMembers: [primaryAdmin.id],
  councilMessages: [],
});

const message = (author: Student, body = "Council meets at 3 PM."): CouncilChatMessage => ({
  id: `msg-${author.id}`,
  authorId: author.id,
  authorName: author.name,
  authorRole: author.role,
  authorTitle: author.councilTitle,
  body,
  timestamp: Date.now(),
});

/* ------------------------------------------------------------------ */

section("Access is granted only by explicit membership");
{
  const state = seedState();
  check("the seeded council officer cannot read the hub", !canReadCouncilHub(state, councilOfficer));
  check("the seeded council officer cannot post", !canPostToCouncilHub(state, councilOfficer));
  check("an ordinary student cannot read the hub", !canReadCouncilHub(state, plainStudent));
  check("a teacher cannot read the hub", !canReadCouncilHub(state, teacher));
  check("a secondary administrator is not a member by role", !canReadCouncilHub(state, secondAdmin));
  check("the primary administrator is a seeded member", canReadCouncilHub(state, primaryAdmin));

  const added = { ...state, councilHubMembers: addCouncilMember(state, councilOfficer.id) };
  check("an explicitly added officer can read the hub", canReadCouncilHub(added, councilOfficer));
  check("an explicitly added officer can post", canPostToCouncilHub(added, councilOfficer));
  check("adding one officer does not open the hub for the others", !canReadCouncilHub(added, secondOfficer));
}

section("Only administrators may add or remove students");
{
  const state = seedState();
  check("an administrator can manage members", canManageCouncilHubMembers(primaryAdmin));
  check("a council officer cannot manage members", !canManageCouncilHubMembers(councilOfficer));
  check("a student cannot manage members", !canManageCouncilHubMembers(plainStudent));
  check("members and administrators can open the hub page", canOpenCouncilHub({ councilHubMembers: [] }, primaryAdmin));
  check("a signed-out visitor cannot open the hub page", !canOpenCouncilHub({ councilHubMembers: [] }, null));
}

section("Adding members");
{
  const state = seedState();
  checkThrows("a duplicate member is rejected", () => addCouncilMember(state, primaryAdmin.id), "already");
  checkThrows("an unknown account is rejected", () => addCouncilMember(state, "shr-999"), "select a roster account");
  check(
    "an account that has not activated its login can still be added",
    addCouncilMember(state, pendingStudent.id).includes(pendingStudent.id),
  );

  const withStudent = addCouncilMember(state, plainStudent.id);
  check("a student account can be added", withStudent.includes(plainStudent.id));
  check("existing members are preserved", withStudent.includes(primaryAdmin.id) && withStudent.length === 2);
}

section("Removing members");
{
  const state = { ...seedState(), councilHubMembers: [primaryAdmin.id, councilOfficer.id, plainStudent.id] };
  const removed = removeCouncilMember(state, councilOfficer.id, primaryAdmin.id);
  check("a removed account loses its membership", !isCouncilHubMember({ councilHubMembers: removed }, councilOfficer.id));
  check("other members keep access", removed.includes(plainStudent.id));
  checkThrows("the primary administrator cannot be removed", () => removeCouncilMember(state, primaryAdmin.id, primaryAdmin.id), "primary administrator");

  const deniedState = { ...state, councilHubMembers: removed };
  check("a removed account can no longer read the hub", !canReadCouncilHub(deniedState, councilOfficer));
  check("a removed account can no longer post", !canPostToCouncilHub(deniedState, councilOfficer));
  const noop = removeCouncilMember(state, "shr-999", primaryAdmin.id);
  check("removing an unknown account changes nothing", noop.length === state.councilHubMembers.length);
}

section("Posting messages");
{
  const base = { ...seedState(), councilHubMembers: [primaryAdmin.id, councilOfficer.id] };
  const posted = addCouncilMessage(base, councilOfficer, message(councilOfficer));
  check("a member's message is stored", posted.length === 1 && posted[0].authorId === councilOfficer.id);
  check("message bodies are trimmed", addCouncilMessage(base, councilOfficer, message(councilOfficer, "  hello  "))[0].body === "hello");
  check("messages are marked as live", posted[0].removed === false);

  checkThrows("a non-member cannot post", () => addCouncilMessage(base, secondOfficer, message(secondOfficer)), "members");
  checkThrows("a member cannot post as somebody else", () => addCouncilMessage(base, councilOfficer, message(primaryAdmin)), "sign in");
  checkThrows("an empty message is rejected", () => addCouncilMessage(base, councilOfficer, message(councilOfficer, "   ")), "write a message");
  checkThrows(
    "an overlong message is rejected",
    () => addCouncilMessage(base, councilOfficer, message(councilOfficer, "x".repeat(COUNCIL_MESSAGE_LIMIT + 1))),
    "limited to 1500",
  );
  check("the limit boundary is accepted", normalizeCouncilMessage("x".repeat(COUNCIL_MESSAGE_LIMIT)).length === COUNCIL_MESSAGE_LIMIT);
  checkThrows("an unsigned-in visitor cannot post", () => addCouncilMessage(base, null, message(councilOfficer)), "sign in");
}

section("Removing messages");
{
  const authored = message(councilOfficer);
  const base = {
    ...seedState(),
    councilHubMembers: [primaryAdmin.id, councilOfficer.id, secondOfficer.id],
    councilMessages: [authored],
  };
  check("the author can remove their own message", canRemoveCouncilMessage(councilOfficer, authored));
  check("another member cannot remove it", !canRemoveCouncilMessage(secondOfficer, authored));
  check("an administrator can remove any message", canRemoveCouncilMessage(primaryAdmin, authored));
  checkThrows("a member cannot remove someone else's message", () => removeCouncilMessage(base, secondOfficer, authored.id), "only remove your own");
  const byAdmin = removeCouncilMessage(base, primaryAdmin, authored.id);
  check("an administrator's removal clears the body", byAdmin[0].removed === true && byAdmin[0].body === "");
}

section("Member list helpers");
{
  const state = { ...seedState(), councilHubMembers: [plainStudent.id, secondOfficer.id, primaryAdmin.id, "shr-gone"] };
  const members = councilMembers(state);
  check("stale membership ids are dropped", members.length === 3);
  check("officers are listed before students", members[0].id === primaryAdmin.id && members[2].id === plainStudent.id);
  const candidates = councilCandidates(state, "anjali");
  check("search filters the addable roster", candidates.length === 1 && candidates[0].id === councilOfficer.id);
  check("existing members are never addable twice", councilCandidates(state).every((user) => !state.councilHubMembers.includes(user.id)));
  check("officers are offered before ordinary students", councilCandidates(seedState())[1].role === "council");
  const sorted = sortCouncilMessages([
    { ...message(primaryAdmin), id: "old", timestamp: 1 },
    { ...message(primaryAdmin), id: "new", timestamp: 2 },
  ]);
  check("messages are newest first", sorted[0].id === "new");
}

section("Wiring guards");
{
  const reducerSource = readFileSync(path.join(repoRoot, "src/store/hub.tsx"), "utf8");
  check(
    "the reducer delegates council actions to the shared helpers",
    ["addCouncilMessage(state", "removeCouncilMessage(state", "addCouncilMember(state", "removeCouncilMember(state"].every((call) => reducerSource.includes(call)),
  );
  check(
    "the reducer keeps the membership guard server-aligned (no admin bypass)",
    !/POST_COUNCIL_MESSAGE[\s\S]{0,400}role === "admin"/.test(reducerSource),
  );
  const rules = readFileSync(path.join(repoRoot, "firestore.rules"), "utf8");
  check("Firestore rules gate the council room on membership", /match \/hubChat\/council\/messages\/\{messageId\}[\s\S]*?allow read: if councilHubMember\(\)/.test(rules));
  check("Firestore rules derive membership from hubState", rules.includes("profile().data.id in councilHubMembers()"));
  check("the shared hub document no longer carries council chat", /councilMessages: \[\],/.test(readFileSync(path.join(repoRoot, "src/lib/firebase-client.ts"), "utf8")));
}

console.log(`\n${checks - failures}/${checks} Council Hub checks passed.`);
if (failures) {
  console.error(`${failures} check(s) failed.`);
  process.exitCode = 1;
}
