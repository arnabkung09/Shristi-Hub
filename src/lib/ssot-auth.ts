import type { House, Role } from "./types";

export const SCHOOL_NAME = "Shristi Academy" as const;
export const INSTITUTIONAL_EMAIL_DOMAIN = "@shristiacademy.edu.np" as const;
export const HOUSE_VALUES = ["Blue House", "Red House", "Green House"] as const;
export const GRADE_VALUES = [
  "Grade 1",
  "Grade 2",
  "Grade 3",
  "Grade 4",
  "Grade 5",
  "Grade 6",
  "Grade 7",
  "Grade 8",
  "Grade 9",
  "Grade 10",
] as const;
export const ROLE_VALUES = ["admin", "council", "student", "teacher"] as const;
export const STATUS_VALUES = ["active", "pending"] as const;
export const COUNCIL_HUB_ACCESS = "councilHub" as const;

export type CanonicalHouse = (typeof HOUSE_VALUES)[number];
export type CanonicalGrade = (typeof GRADE_VALUES)[number];
export type CanonicalRole = (typeof ROLE_VALUES)[number];
export type CanonicalStatus = (typeof STATUS_VALUES)[number];

export interface WhitelistedStudent {
  id: string;
  email: string;
  name: string;
  /** Teacher accounts may have no class. */
  grade: CanonicalGrade | null;
  /** Teacher accounts may belong to no house. */
  house: CanonicalHouse | null;
  role: CanonicalRole;
  councilTitle?: string;
  status: CanonicalStatus;
  createdAt: string;
}

export function isTeacher(student: { role: CanonicalRole }): boolean {
  return student.role === "teacher";
}

export function displayGrade(grade: CanonicalGrade | null, role: CanonicalRole): string {
  return grade ?? (role === "teacher" ? "Staff" : "—");
}

export function displayHouseLabel(house: CanonicalHouse | null, role: CanonicalRole): string {
  return house ?? (role === "teacher" ? "No House" : "—");
}

export interface User extends WhitelistedStudent {
  passwordHash: string;
  aliases?: string[];
}

export class AuthorizationError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "AuthorizationError";
    this.statusCode = statusCode;
  }
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function assertInstitutionalEmail(email: string): string {
  const normalized = normalizeEmail(email);
  if (!normalized.endsWith(INSTITUTIONAL_EMAIL_DOMAIN)) {
    throw new AuthorizationError(403, "Email is not recognized on the official Shristi Academy student roster.");
  }
  return normalized;
}

export function isCanonicalGrade(value: string): value is CanonicalGrade {
  return (GRADE_VALUES as readonly string[]).includes(value);
}

export function isCanonicalHouse(value: string): value is CanonicalHouse {
  return (HOUSE_VALUES as readonly string[]).includes(value);
}

export function isCanonicalRole(value: string): value is CanonicalRole {
  return (ROLE_VALUES as readonly string[]).includes(value);
}

export function isCanonicalStatus(value: string): value is CanonicalStatus {
  return (STATUS_VALUES as readonly string[]).includes(value);
}

export function canonicalGradeToNumber(grade: CanonicalGrade): number {
  return Number(grade.replace("Grade ", ""));
}

export function canonicalGradeFromNumber(grade: number): CanonicalGrade {
  const normalized = `Grade ${grade}`;
  if (!isCanonicalGrade(normalized)) {
    throw new AuthorizationError(400, "Grade must be between Grade 1 and Grade 10.");
  }
  return normalized;
}

export function canonicalHouseToLegacy(house: CanonicalHouse): House {
  if (house === "Blue House") return "Blue";
  if (house === "Red House") return "Red";
  return "Green";
}

export function canonicalRoleToLegacy(role: CanonicalRole): Role {
  return role;
}

export function validateWhitelistedStudentShape(student: WhitelistedStudent): WhitelistedStudent {
  const email = assertInstitutionalEmail(student.email);
  if (!student.id.trim()) throw new AuthorizationError(400, "Student id is required.");
  if (!student.name.trim()) throw new AuthorizationError(400, "Student name is required.");
  const isTeacherRecord = student.role === "teacher";
  if (student.grade === null) {
    if (!isTeacherRecord) throw new AuthorizationError(400, "Only teacher accounts may have no class.");
  } else if (!isCanonicalGrade(student.grade)) throw new AuthorizationError(400, "Grade must be between Grade 1 and Grade 10.");
  if (student.house === null) {
    if (!isTeacherRecord) throw new AuthorizationError(400, "Only teacher accounts may have no house.");
  } else if (!isCanonicalHouse(student.house)) throw new AuthorizationError(400, "House must be Blue House, Red House, or Green House.");
  if (!isCanonicalRole(student.role)) throw new AuthorizationError(400, "Role must be admin, council, student, or teacher.");
  if (!isCanonicalStatus(student.status)) throw new AuthorizationError(400, "Status must be active or pending.");
  if (Number.isNaN(Date.parse(student.createdAt))) throw new AuthorizationError(400, "createdAt must be a valid ISO timestamp.");
  return { ...student, email };
}

export function verifyWhitelistedStudent(email: string, whitelist: readonly WhitelistedStudent[]): WhitelistedStudent {
  const normalized = assertInstitutionalEmail(email);
  const record = whitelist.find((student) => normalizeEmail(student.email) === normalized);
  if (!record) {
    throw new AuthorizationError(403, "Email is not recognized on the official Shristi Academy student roster.");
  }
  return validateWhitelistedStudentShape(record);
}

export function activateStudentAccount(email: string, roster: readonly User[]): { updatedRoster: User[]; account: User } {
  const normalized = assertInstitutionalEmail(email);
  const index = roster.findIndex((student) => normalizeEmail(student.email) === normalized);
  if (index === -1) {
    throw new AuthorizationError(403, "Email is not recognized on the official Shristi Academy student roster.");
  }
  const current = validateUserShape(roster[index]);
  if (current.status === "active") {
    return { updatedRoster: [...roster], account: current };
  }
  const account: User = { ...current, status: "active" };
  const updatedRoster = roster.map((entry, idx) => (idx === index ? account : entry));
  return { updatedRoster, account };
}

export function adminResetStudentCredentials(params: {
  actor: User;
  targetEmail: string;
  nextPasswordHash: string;
  roster: readonly User[];
}): { updatedRoster: User[]; account: User } {
  const { actor, targetEmail, nextPasswordHash, roster } = params;
  if (actor.role !== "admin") {
    throw new AuthorizationError(403, "Only ADMIN users can reset student credentials.");
  }
  if (!nextPasswordHash.trim()) {
    throw new AuthorizationError(400, "Password hash cannot be empty.");
  }
  const normalized = assertInstitutionalEmail(targetEmail);
  const index = roster.findIndex((student) => normalizeEmail(student.email) === normalized);
  if (index === -1) {
    throw new AuthorizationError(404, "Target account was not found on the official roster.");
  }
  const account = { ...validateUserShape(roster[index]), passwordHash: nextPasswordHash.trim() };
  const updatedRoster = roster.map((entry, idx) => (idx === index ? account : entry));
  return { updatedRoster, account };
}

export function adminUpdateRosterRecord(params: {
  actor: User;
  targetEmail: string;
  roster: readonly User[];
  patch: Partial<Pick<User, "name" | "grade" | "house" | "role" | "councilTitle" | "status">>;
}): { updatedRoster: User[]; account: User } {
  const { actor, targetEmail, roster, patch } = params;
  if (actor.role !== "admin") {
    throw new AuthorizationError(403, "Only ADMIN users can modify the source-of-truth roster.");
  }
  const normalized = assertInstitutionalEmail(targetEmail);
  const index = roster.findIndex((student) => normalizeEmail(student.email) === normalized);
  if (index === -1) {
    throw new AuthorizationError(404, "Target account was not found on the official roster.");
  }
  const next: User = validateUserShape({ ...roster[index], ...patch });
  const updatedRoster = roster.map((entry, idx) => (idx === index ? next : entry));
  return { updatedRoster, account: next };
}

export function filterRosterByStatus(roster: readonly User[], status?: CanonicalStatus): User[] {
  const validated = roster.map(validateUserShape);
  if (!status) return validated;
  return validated.filter((student) => student.status === status);
}

export function validateUserShape(user: User): User {
  const validated = validateWhitelistedStudentShape(user);
  if (!user.passwordHash.trim()) {
    throw new AuthorizationError(400, "passwordHash is required for authenticated user records.");
  }
  return { ...validated, passwordHash: user.passwordHash.trim() };
}

export function assertExactWhitelistCount(whitelist: readonly WhitelistedStudent[]): void {
  if (!whitelist.length) {
    throw new AuthorizationError(500, "Roster integrity failure: the student roster cannot be empty.");
  }
  const emails = new Set(whitelist.map((student) => normalizeEmail(student.email)));
  if (emails.size !== whitelist.length) {
    throw new AuthorizationError(500, "Roster integrity failure: duplicate student emails found.");
  }
}
