import type { CouncilTask, House, HouseBranding, Role, SiteRating, Student } from "./types";
import { canonicalGradeFromNumber, normalizeEmail } from "./ssot-auth";
import { OFFICIAL_COUNCIL_APPOINTMENTS } from "./whitelist-seed";

export const PRIMARY_ADMIN_ID = "shr-085";
export const DEFAULT_DEPARTMENTS = [
  "General",
  "Event Management",
  "Discipline",
  "Monetary Fund",
  "Audio & Speech",
  "Creative Design",
  "Sports Management",
];
export const FEATURE_PERMISSIONS = [
  { id: "events", name: "Events & News", label: "Events & News", description: "Create events and publish announcements.", detail: "Create events and publish announcements." },
  { id: "voice", name: "Polls & Feedback", label: "Polls & Feedback", description: "Publish polls and respond to suggestions.", detail: "Publish polls and respond to suggestions." },
  { id: "tasks", name: "Task Management", label: "Task Management", description: "Create tasks and update assigned work.", detail: "Create tasks and update assigned work." },
  { id: "houses", name: "House Points", label: "House Points", description: "Award points and record deductions.", detail: "Award points and record deductions." },
  { id: "meetings", name: "Meetings & Files", label: "Meetings & Files", description: "Schedule meetings and record minutes.", detail: "Schedule meetings and record minutes." },
  { id: "finances", name: "Finance", label: "Finance", description: "Record council income and expenditure.", detail: "Record council income and expenditure." },
  { id: "gallery", name: "Gallery", label: "Gallery", description: "Manage event photos and active images.", detail: "Manage event photos and active images." },
  { id: "broadcast", name: "Push Notifications", label: "Push Notifications", description: "Send announcements to selected audiences.", detail: "Send announcements to selected audiences." },
];

export const COUNCIL_TITLES = [
  "President",
  "Vice President",
  "Secretary",
  "Treasurer",
  "Cultural Secretary",
  "Sports Captain",
  "Discipline Incharge",
  "Public Relations Officer",
  "Event Coordinator",
  "Council Representative",
];

export const DEFAULT_PERMISSIONS = ["events", "voice", "tasks"];

export function visiblePermissions(
  student: Student | undefined,
  permissions: Record<string, string[] | undefined>
): string[] {
  if (!student) return [];
  if (student.role === "admin") return FEATURE_PERMISSIONS.map((f) => f.id);
  return permissions[student.id] ?? DEFAULT_PERMISSIONS;
}

function matchDepartment(candidate: string | undefined | null, departments: string[]): string | null {
  if (!candidate) return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  const exact = departments.find((d) => d === trimmed);
  if (exact) return exact;
  const lower = trimmed.toLowerCase();
  const ci = departments.find((d) => d.toLowerCase() === lower);
  if (ci) return ci;
  if (lower === "sports") return departments.find((d) => d.toLowerCase().includes("sport")) ?? null;
  if (lower === "cultural" || lower === "events") return departments.find((d) => d.toLowerCase().includes("event") || d.toLowerCase().includes("design")) ?? null;
  if (lower === "finance" || lower === "finances") return departments.find((d) => d.toLowerCase().includes("monetary")) ?? null;
  return null;
}

export function departmentFor(student: Student, departments: string[] = DEFAULT_DEPARTMENTS) {
  const direct = matchDepartment(student.department, departments);
  if (direct) return direct;

  const emailKey = (student.email ?? "").trim().toLowerCase();
  const official = OFFICIAL_COUNCIL_APPOINTMENTS[emailKey];
  if (official?.department) {
    const matchedOfficial = matchDepartment(official.department, departments);
    if (matchedOfficial) return matchedOfficial;
  }

  const title = (student.councilTitle ?? student.councilPost ?? "").toLowerCase();
  const inferred =
    title.includes("sports") || title.includes("game") || title.includes("captain") ? "Sports Management" :
    title.includes("design") || title.includes("art") || title.includes("creative") ? "Creative Design" :
    title.includes("audio") || title.includes("speech") ? "Audio & Speech" :
    title.includes("monetary") || title.includes("finance") || title.includes("treasur") ? "Monetary Fund" :
    title.includes("discipline") || title.includes("vice-president") || title.includes("secretary") ? "Discipline" :
    title.includes("event") || title.includes("president") ? "Event Management" :
    "General";
  const matchedInferred = matchDepartment(inferred, departments);
  if (matchedInferred) return matchedInferred;
  return departments.includes("General") ? "General" : (departments[0] ?? "General");
}

export function taskDepartment(task: CouncilTask, students: Student[], departments: string[] = DEFAULT_DEPARTMENTS) {
  const direct = matchDepartment(task.department, departments);
  if (direct) return direct;
  const assignee = students.find((s) => s.id === task.assigneeId);
  return assignee ? departmentFor(assignee, departments) : (departments.includes("General") ? "General" : departments[0] ?? "General");
}

export function tasksForDepartment(department: string, tasks: CouncilTask[], students: Student[], departments: string[] = DEFAULT_DEPARTMENTS) {
  const target = matchDepartment(department, departments) ?? department;
  return tasks.filter((task) => taskDepartment(task, students, departments) === target);
}

export function houseShortName(houses: Record<House, HouseBranding> | undefined, house: House): string {
  return houses?.[house]?.name?.trim() || house;
}

export function houseFullName(houses: Record<House, HouseBranding> | undefined, house: House): string {
  const name = houseShortName(houses, house);
  return /house$/i.test(name) ? name : `${name} House`;
}

export function houseLogo(houses: Record<House, HouseBranding> | undefined, house: House): string {
  return houses?.[house]?.logoUrl ?? "";
}

export function houseStandings(totals: Record<House, number>): Array<{ house: House; points: number; rank: number }> {
  const sorted = (Object.entries(totals) as Array<[House, number]>).sort((a, b) => b[1] - a[1]);
  return sorted.map(([house, points], i) => ({ house, points, rank: i + 1 }));
}

export function rankLabel(rank: number): string {
  return rank === 1 ? "1st Place" : rank === 2 ? "2nd Place" : rank === 3 ? "3rd Place" : `${rank}th Place`;
}

export function ratingStats(ratings: SiteRating[]): { count: number; average: number; distribution: number[] } {
  const count = ratings.length;
  const distribution = [0, 0, 0, 0, 0];
  ratings.forEach((r) => { if (r.value >= 1 && r.value <= 5) distribution[r.value - 1] += 1; });
  const average = count ? ratings.reduce((s, r) => s + r.value, 0) / count : 0;
  return { count, average, distribution };
}

export function publicRoster(students: Student[]) {
  return students.map(({ id, name, email, gradeLabel, houseLabel, role, councilTitle, status, createdAt }) => ({
    id, name, email, grade: gradeLabel, house: houseLabel, role, councilTitle, status, createdAt,
  }));
}

export function downloadJson(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * One-time password for an administrator-created account. Random per account instead of a
 * shared role default, so knowing the role never reveals a working credential.
 * Generated with the platform CSPRNG when available.
 */
export function generateAccountPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  const source = typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function"
    ? crypto
    : undefined;
  if (source) source.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  const code = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `SHR-${code.slice(0, 4)}-${code.slice(4)}`;
}

export function buildStudentRecord(input: {
  id: string;
  name: string;
  email: string;
  grade: number | null;
  house: House | null;
  role?: Role;
  aliases?: string[];
  verifiedAliases?: string[];
  /** Pre-generated one-time password; a fresh random one is used when omitted. */
  password?: string;
}): Student {
  const role = input.role ?? "student";
  const isClassAccount = role === "grade";
  const isTeacher = role === "teacher";
  const resolvedHouse = isClassAccount ? null : input.house;
  const defaultPw = input.password ?? generateAccountPassword();
  return {
    id: input.id,
    name: input.name.trim(),
    email: normalizeEmail(input.email),
    password: defaultPw,
    passwordHash: "seeded-password-hash",
    grade: input.grade,
    gradeLabel: input.grade ? canonicalGradeFromNumber(input.grade) : null,
    house: resolvedHouse,
    houseLabel: resolvedHouse ? `${resolvedHouse} House` : null,
    status: "pending",
    role,
    isStaff: isTeacher,
    aliases: input.aliases ?? [],
    verifiedAliases: input.verifiedAliases ?? [],
    createdAt: new Date().toISOString(),
  };
}