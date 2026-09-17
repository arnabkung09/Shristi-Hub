import express from "express";
import type { Request, Response } from "express";
import {
  adminResetStudentCredentials,
  adminUpdateRosterRecord,
  assertExactWhitelistCount,
  AuthorizationError,
  filterRosterByStatus,
  normalizeEmail,
  verifyWhitelistedStudent,
  activateStudentAccount,
  type User,
  type WhitelistedStudent,
} from "../src/lib/ssot-auth";
import { SHRISTI_WHITELIST, SHRISTI_USER_ROSTER } from "../src/lib/whitelist-seed";

const app = express();
app.use(express.json());

let whitelist: WhitelistedStudent[] = [...SHRISTI_WHITELIST];
let users: User[] = [...SHRISTI_USER_ROSTER];
assertExactWhitelistCount(whitelist);

function handleError(res: Response, error: unknown) {
  if (error instanceof AuthorizationError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  return res.status(500).json({ error: "Internal roster service error." });
}

function getActor(req: Request): User {
  const email = normalizeEmail(String(req.header("x-actor-email") || ""));
  const actor = users.find((user) => normalizeEmail(user.email) === email);
  if (!actor) {
    throw new AuthorizationError(401, "Actor is not authenticated on the official roster.");
  }
  return actor;
}

app.get("/api/roster/whitelist", (_req, res) => {
  try {
    assertExactWhitelistCount(whitelist);
    return res.json({ school: "Shristi Academy", total: whitelist.length, students: whitelist });
  } catch (error) {
    return handleError(res, error);
  }
});

app.post("/api/auth/verify-whitelist", (req, res) => {
  try {
    const { email } = req.body as { email?: string };
    const student = verifyWhitelistedStudent(String(email || ""), whitelist);
    return res.json({ ok: true, student });
  } catch (error) {
    return handleError(res, error);
  }
});

app.post("/api/auth/activate", (req, res) => {
  try {
    const { email } = req.body as { email?: string };
    const result = activateStudentAccount(String(email || ""), users);
    users = result.updatedRoster;
    return res.json({ ok: true, account: result.account });
  } catch (error) {
    return handleError(res, error);
  }
});

app.get("/api/admin/roster", (req, res) => {
  try {
    const actor = getActor(req);
    if (actor.role !== "admin") {
      throw new AuthorizationError(403, "Only ADMIN users can view the complete roster.");
    }
    const status = req.query.status ? String(req.query.status) : undefined;
    const filtered = filterRosterByStatus(users, status as User["status"] | undefined);
    return res.json({ ok: true, total: filtered.length, students: filtered });
  } catch (error) {
    return handleError(res, error);
  }
});

app.post("/api/admin/roster/reset-credentials", (req, res) => {
  try {
    const actor = getActor(req);
    const { targetEmail, nextPasswordHash } = req.body as { targetEmail?: string; nextPasswordHash?: string };
    const result = adminResetStudentCredentials({
      actor,
      targetEmail: String(targetEmail || ""),
      nextPasswordHash: String(nextPasswordHash || ""),
      roster: users,
    });
    users = result.updatedRoster;
    return res.json({ ok: true, account: result.account });
  } catch (error) {
    return handleError(res, error);
  }
});

app.patch("/api/admin/roster/update-record", (req, res) => {
  try {
    const actor = getActor(req);
    const { targetEmail, patch } = req.body as {
      targetEmail?: string;
      patch?: Partial<Pick<User, "name" | "grade" | "house" | "role" | "councilTitle" | "status">>;
    };
    const result = adminUpdateRosterRecord({
      actor,
      targetEmail: String(targetEmail || ""),
      patch: patch || {},
      roster: users,
    });
    users = result.updatedRoster;
    return res.json({ ok: true, account: result.account });
  } catch (error) {
    return handleError(res, error);
  }
});

export default app;
