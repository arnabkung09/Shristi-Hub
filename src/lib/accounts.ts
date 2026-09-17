import type { House, Role, Student, Teacher } from "./types";

export const HOUSE_IDS: House[] = ["Blue", "Red", "Green"];
export const ACCOUNT_ROLES: Role[] = ["admin", "council", "student", "teacher"];

export function isCouncilAccount(account: Pick<Student, "role"> | null | undefined) {
  return account?.role === "admin" || account?.role === "council";
}

export function roleLabel(role: Role) {
  return { admin: "Administrator", council: "Council", student: "Student", teacher: "Teacher" }[role];
}

export function classLabel(account: Pick<Student, "grade">) {
  return account.grade == null ? "No class" : `Grade ${account.grade}`;
}

export function validEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && /^[^\s@/]+@[^\s@/]+\.[^\s@/]{2,}$/i.test(value);
}

export function validAccountAssignments(role: Role, grade: unknown, house: unknown) {
  const validGrade = typeof grade === "number" && Number.isInteger(grade) && grade >= 1 && grade <= 10;
  const validHouse = HOUSE_IDS.includes(house as House);
  return (validGrade || (role === "teacher" && grade === null))
    && (validHouse || (role === "teacher" && house === null));
}

export function validateAccount(account: Student) {
  if (!ACCOUNT_ROLES.includes(account.role)) throw new Error("Select a valid account role.");
  if (!account.name?.trim() || account.name.trim().length > 100) throw new Error("Enter a name of 1 to 100 characters.");
  if (!validEmail(account.email)) throw new Error("Enter a valid email address.");
  if (account.role !== "teacher" && !account.email.toLowerCase().endsWith("@shristiacademy.edu.np")) {
    throw new Error("Students must use a primary school email address.");
  }
  if (!validAccountAssignments(account.role, account.grade, account.house)) {
    throw new Error("Students require a grade (1-10) and a house. Teachers may select No class or No house.");
  }
  if (account.gradeLabel !== (account.grade == null ? null : `Grade ${account.grade}`)
    || account.houseLabel !== (account.house == null ? null : `${account.house} House`)) {
    throw new Error("Account class or house labels are inconsistent.");
  }
}

export function createTeacher(input: { name: string; email: string; grade: number | null; house: House | null }): Teacher {
  const teacher: Teacher = {
    id: `teacher-${crypto.randomUUID()}`, name: input.name.trim(), email: input.email.trim().toLowerCase(),
    aliases: [], password: "", role: "teacher", isStaff: true, status: "pending",
    grade: input.grade, gradeLabel: input.grade == null ? null : `Grade ${input.grade}` as Teacher["gradeLabel"],
    house: input.house, houseLabel: input.house == null ? null : `${input.house} House`,
    createdAt: new Date().toISOString(),
  };
  validateAccount(teacher);
  return teacher;
}

// Explicit membership may differ from a user's primary school-house assignment.
export function normalizeHouseMemberships(input: Partial<Record<House, string[]>> | undefined, users: Student[]): Record<House, string[]> {
  const ids = new Set(users.map((u) => u.id));
  const admins = users.filter((u) => u.role === "admin").map((u) => u.id);
  return Object.fromEntries(HOUSE_IDS.map((house) => {
    const members = Array.isArray(input?.[house]) ? input[house]! : users.filter((u) => u.house === house).map((u) => u.id);
    return [house, Array.from(new Set([...members.filter((id) => ids.has(id)), ...admins]))];
  })) as Record<House, string[]>;
}

export function belongsToHouse(account: Student | null | undefined, house: House, memberships: Record<House, string[]>) {
  return !!account && (account.role === "admin" || memberships[house]?.includes(account.id));
}