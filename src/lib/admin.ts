import type { CouncilTask, House, HouseBranding, Role, SiteRating, Student } from "./types";
import { canonicalGradeFromNumber, normalizeEmail } from "./ssot-auth";

export const PRIMARY_ADMIN_ID = "shr-085";
export const DEFAULT_DEPARTMENTS = ["General", "Academics", "Sports & Recreation", "Media & Communications", "Student Welfare", "Finance", "Events & Activities"];
export const FEATURE_PERMISSIONS = [
  { id: "events", name: "Events & News", description: "Create events and publish announcements." },
  { id: "voice", name: "Polls & Feedback", description: "Publish polls and respond to suggestions." },
  { id: "tasks", name: "Task Management", description: "Create tasks and update assigned work." },
  { id: "houses", name: "House Points", description: "Award points and record deductions." },
  { id: "meetings", name: "Meetings & Files", description: "Schedule meetings and record minutes." },
  { id: "finances", name: "Finance", description: "Record council income and expenditure." },
  { id: "gallery", name: "Gallery", description: "Manage event photos and active images." },
  { id: "broadcast", name: "Push Notifications", description: "Send announcements to selected audiences." },
];

export function departmentFor(student: Student, departments: string[] = DEFAULT_DEPARTMENTS) {
  if (student.department && departments.includes(student.department)) return student.department;
  const title = (student.councilTitle ?? "").toLowerCase();
  const inferred =
    title.includes("sports") || title.includes("captain") ? "Sports & Recreation" :
    title.includes("cultural") ? "Events & Activities" :
    title.includes("editorial") || title.includes("media") ? "Media & Communications" :
    title.includes("welfare") ? "Student Welfare" :
    title.includes("finance") ? "Finance" :
    title.includes("academic") ? "Academics" :
    "General";
  if (departments.includes(inferred)) return inferred;
  return departments.includes("General") ? "General" : (departments[0] ?? "General");
}

export function taskDepartment(task: CouncilTask, students: Student[], departments: string[] = DEFAULT_DEPARTMENTS) {
  if (task.department && departments.includes(task.department)) return task.department;
  const assignee = students.find((s) => s.id === task.assigneeId);
  return assignee ? departmentFor(assignee, departments) : (departments.includes("General") ? "General" : departments[0] ?? "General");
}

export function tasksForDepartment(department: string, tasks: CouncilTask[], students: Student[], departments: string[] = DEFAULT_DEPARTMENTS) {
  return tasks.filter((task) => taskDepartment(task, students, departments) === department);
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

export function buildStudentRecord(input: {
  id: string;
  name: string;
  email: string;
  grade: number | null;
  house: House | null;
  role?: Role;
  aliases?: string[];
  verifiedAliases?: string[];
}): Student {
  const role = input.role ?? "student";
  const defaultPw = role === "teacher" ? "teacher123" : role === "grade" ? "grade123" : "student123";
  return {
    id: input.id,
    name: input.name.trim(),
    email: normalizeEmail(input.email),
    password: defaultPw,
    passwordHash: "seeded-password-hash",
    grade: input.grade,
    gradeLabel: input.grade ? canonicalGradeFromNumber(input.grade) : null,
    house: input.house,
    houseLabel: input.house ? `${input.house} House` : null,
    status: "pending",
    role,
    aliases: input.aliases ?? [],
    verifiedAliases: input.verifiedAliases ?? [],
    createdAt: new Date().toISOString(),
  };
}