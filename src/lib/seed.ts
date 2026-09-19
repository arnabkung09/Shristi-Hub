import type {
  Announcement, AppNotification, BroadcastRecord, CouncilTask, FinanceEntry,
  GalleryItem, HubState, Meeting, PointEntry, Poll, ResourceDoc, SchoolEvent,
  Student, Suggestion,
} from "./types";
import {
  canonicalGradeToNumber,
  canonicalHouseToLegacy,
  type CanonicalGrade,
} from "./ssot-auth";
import { PRIMARY_ADMIN, SHRISTI_USER_ROSTER } from "./whitelist-seed";
import { DEFAULT_DEPARTMENTS, FEATURE_PERMISSIONS } from "./admin";
import { DEFAULT_BRANDING, DEFAULT_EVENT_TYPES, DEFAULT_HOUSES, DEFAULT_LEGAL } from "./content";

import gallerySports from "../assets/gallery-sports.jpg";
import galleryAnnual from "../assets/gallery-annual.jpg";
import galleryScience from "../assets/gallery-science.jpg";
import galleryInvestiture from "../assets/gallery-investiture.jpg";

export const HOUSES = ["Blue", "Red", "Green"] as const;
export const HOUSE_LABELS = ["Blue House", "Red House", "Green House"] as const;
export const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export const GRADE_LABELS: CanonicalGrade[] = [
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
];
export const POINT_CATEGORIES = ["Sports", "Academics", "Cultural & Arts", "Discipline", "Community Service"] as const;
export const EVENT_CATEGORIES = ["Academic", "Cultural", "Sports", "Assembly", "Council Meeting"] as const;
export const SUGGESTION_CATEGORIES = ["Academics", "Facilities", "Canteen", "Sports", "Clubs", "Student Welfare"] as const;
export const TASK_PRIORITIES = ["Low", "Medium", "High", "Urgent"] as const;
export const DEPARTMENTS = ["Executive", "Sports", "Cultural", "Editorial", "Discipline", "Welfare", "Environment"] as const;
export const COUNCIL_POSTS = [
  "President",
  "Vice President",
  "Sports Captain",
  "Cultural Secretary",
  "Editorial Secretary",
  "Blue House Captain",
  "Red House Captain",
  "Green House Captain",
  "Discipline Prefect",
  "Welfare Prefect",
] as const;

export const RESOURCES: ResourceDoc[] = [
  { id: "res-1", title: "Council Constitution & Bylaws", category: "Governance", tag: "PDF", updated: "Jan 2026", size: "1.2 MB" },
  { id: "res-2", title: "Event Circular Template", category: "Event Circulars", tag: "DOCX", updated: "Dec 2025", size: "84 KB" },
  { id: "res-3", title: "Field Trip Permission Slip", category: "Event Circulars", tag: "PDF", updated: "Nov 2025", size: "120 KB" },
  { id: "res-4", title: "Club Registration Form 2026", category: "Forms", tag: "PDF", updated: "Jan 2026", size: "96 KB" },
  { id: "res-5", title: "House Championship Rulebook", category: "House Rulebooks", tag: "PDF", updated: "Jan 2026", size: "2.4 MB" },
  { id: "res-6", title: "Inter-House Competition Guidelines", category: "House Rulebooks", tag: "PDF", updated: "Dec 2025", size: "1.1 MB" },
  { id: "res-7", title: "Council Budget & Reimbursement SOP", category: "Governance", tag: "PDF", updated: "Oct 2025", size: "640 KB" },
  { id: "res-8", title: "Meeting Minutes (MoM) Template", category: "Governance", tag: "DOCX", updated: "Sep 2025", size: "52 KB" },
];

const DAY = 86400000;
const now = Date.now();
const ts = (daysOffset: number, h = 10, m = 0) => {
  const d = new Date(now + daysOffset * DAY);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};
const dateStr = (daysOffset: number) => new Date(now + daysOffset * DAY).toISOString().slice(0, 10);

function buildStudents(): Student[] {
  const students: Student[] = SHRISTI_USER_ROSTER.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    // Sample accounts carry no usable password: production sign-in is Firebase-only.
    password: "",
    passwordHash: user.passwordHash,
    grade: user.grade ? canonicalGradeToNumber(user.grade) : null,
    gradeLabel: user.grade,
    house: user.house ? canonicalHouseToLegacy(user.house) : null,
    houseLabel: user.house,
    status: user.status,
    role: user.role,
    councilPost: user.councilTitle,
    councilTitle: user.councilTitle,
    department: user.role === "admin" ? "General" : user.councilTitle?.includes("Captain") ? "Sports & Recreation" : user.councilTitle?.includes("Editorial") ? "Media & Communications" : user.councilTitle?.includes("Cultural") ? "Events & Activities" : "General",
    createdAt: user.createdAt,
    isStaff: false,
    aliases: [],
    verifiedAliases: [],
  }));

  const teachers: Student[] = [
    {
      id: "tch-001",
      name: "Anita Sharma",
      email: "anita.sharma@shristiacademy.edu.np",
      password: "",
      passwordHash: "teacher-password-hash",
      grade: 10,
      gradeLabel: "Grade 10",
      house: "Blue",
      houseLabel: "Blue House",
      status: "active",
      role: "teacher",
      createdAt: "2026-01-01T08:00:00.000Z",
      isStaff: true,
      aliases: ["anita.personal@gmail.com"],
      verifiedAliases: ["anita.personal@gmail.com"],
    },
    {
      id: "tch-002",
      name: "Bikram Thapa",
      email: "bikram.thapa@shristiacademy.edu.np",
      password: "",
      passwordHash: "teacher-password-hash",
      grade: 9,
      gradeLabel: "Grade 9",
      house: "Red",
      houseLabel: "Red House",
      status: "active",
      role: "teacher",
      createdAt: "2026-01-01T08:00:00.000Z",
      isStaff: true,
      aliases: [],
      verifiedAliases: [],
    },
    {
      id: "tch-003",
      name: "Sunita Gurung",
      email: "sunita.gurung@shristiacademy.edu.np",
      password: "",
      passwordHash: "teacher-password-hash",
      grade: 8,
      gradeLabel: "Grade 8",
      house: "Green",
      houseLabel: "Green House",
      status: "active",
      role: "teacher",
      createdAt: "2026-01-01T08:00:00.000Z",
      isStaff: true,
      aliases: [],
      verifiedAliases: [],
    },
  ];

  const classAccounts: Student[] = [
    {
      id: "cls-010",
      name: "Grade 10 Class",
      email: "grade10@shristiacademy.edu.np",
      password: "",
      passwordHash: "grade-password-hash",
      grade: 10,
      gradeLabel: "Grade 10",
      house: null,
      houseLabel: null,
      status: "active",
      role: "grade",
      createdAt: "2026-01-01T08:00:00.000Z",
      isStaff: false,
      aliases: [],
      verifiedAliases: [],
    },
    {
      id: "cls-009",
      name: "Grade 9 Class",
      email: "grade9@shristiacademy.edu.np",
      password: "",
      passwordHash: "grade-password-hash",
      grade: 9,
      gradeLabel: "Grade 9",
      house: null,
      houseLabel: null,
      status: "active",
      role: "grade",
      createdAt: "2026-01-01T08:00:00.000Z",
      isStaff: false,
      aliases: [],
      verifiedAliases: [],
    },
    {
      id: "cls-008",
      name: "Grade 8 Class",
      email: "grade8@shristiacademy.edu.np",
      password: "",
      passwordHash: "grade-password-hash",
      grade: 8,
      gradeLabel: "Grade 8",
      house: null,
      houseLabel: null,
      status: "active",
      role: "grade",
      createdAt: "2026-01-01T08:00:00.000Z",
      isStaff: false,
      aliases: [],
      verifiedAliases: [],
    },
  ];

  return [...students, ...teachers, ...classAccounts];
}

export const ADMIN_USER: Student = {
  id: PRIMARY_ADMIN.id,
  name: PRIMARY_ADMIN.name,
  email: PRIMARY_ADMIN.email,
  password: "",
  passwordHash: PRIMARY_ADMIN.passwordHash,
  grade: PRIMARY_ADMIN.grade ? canonicalGradeToNumber(PRIMARY_ADMIN.grade) : null,
  gradeLabel: PRIMARY_ADMIN.grade,
  house: PRIMARY_ADMIN.house ? canonicalHouseToLegacy(PRIMARY_ADMIN.house) : null,
  houseLabel: PRIMARY_ADMIN.house,
  status: PRIMARY_ADMIN.status,
  role: "admin",
  councilPost: PRIMARY_ADMIN.councilTitle,
  councilTitle: PRIMARY_ADMIN.councilTitle,
  department: "Executive",
  createdAt: PRIMARY_ADMIN.createdAt,
  isStaff: false,
};

export function buildSeedState(): HubState {
  const students = buildStudents();
  const activeIds = students.filter((s) => s.status === "active").map((s) => s.id);
  const councilIds = students.filter((s) => s.role === "council" || s.role === "admin").map((s) => s.id);
  const pick = (count: number, offset = 0) => {
    return activeIds.length ? Array.from({ length: Math.min(count, activeIds.length) }, (_, i) => activeIds[(offset + i) % activeIds.length]) : [];
  };

  const pointsLedger: PointEntry[] = [
    { id: "pt-1", house: "Blue", delta: 100, category: "Sports", reason: "Winner — Inter-House Cricket Cup", officerName: "Anjan Bhattarai", timestamp: ts(-34) },
    { id: "pt-2", house: "Red", delta: 80, category: "Sports", reason: "Runner-up — Inter-House Cricket Cup", officerName: "Anjan Bhattarai", timestamp: ts(-34, 11) },
    { id: "pt-3", house: "Green", delta: 120, category: "Academics", reason: "1st Place — National Science Olympiad", officerName: "Arnab Shrestha", timestamp: ts(-28) },
    { id: "pt-4", house: "Blue", delta: 90, category: "Cultural & Arts", reason: "Best Choreography — Annual Day", officerName: "Asmita Shrestha", timestamp: ts(-24) },
    { id: "pt-5", house: "Red", delta: 60, category: "Community Service", reason: "Campus Cleanliness Drive — 40 volunteers", officerName: "Anjali Nepal", timestamp: ts(-20) },
    { id: "pt-6", house: "Green", delta: 50, category: "Sports", reason: "District Athletics — 3 Gold Medals", officerName: "Anjan Bhattarai", timestamp: ts(-17) },
    { id: "pt-7", house: "Blue", delta: -20, category: "Discipline", reason: "Repeated uniform violation", officerName: "Arnab Shrestha", timestamp: ts(-14) },
    { id: "pt-8", house: "Red", delta: 130, category: "Academics", reason: "Champions — Inter-School Quiz Bowl", officerName: "Anjali Nepal", timestamp: ts(-11) },
    { id: "pt-9", house: "Green", delta: 70, category: "Cultural & Arts", reason: "2nd Place — Zonal Music Fest", officerName: "Asmita Shrestha", timestamp: ts(-9) },
    { id: "pt-10", house: "Blue", delta: 110, category: "Academics", reason: "1st Place — Inter-House Spell Bee", officerName: "Anusha Kandel", timestamp: ts(-7) },
  ];

  const events: SchoolEvent[] = [
    { id: "ev-1", title: "Inter-House Basketball Finals", description: "Blue House vs Red House clash for the winter cup.", date: dateStr(2), time: "16:00", venue: "Main Basketball Court", category: "Sports", capacity: 120, attendees: pick(64, 3), attended: [], organizer: "Anjan Bhattarai" },
    { id: "ev-2", title: "Grade 10 Career Guidance Assembly", description: "University counsellors walk Grade 10 students through stream and entrance choices.", date: dateStr(1), time: "09:30", venue: "Block C Auditorium", category: "Assembly", capacity: 150, attendees: pick(91, 11), attended: [], organizer: "Arnab Shrestha" },
    { id: "ev-3", title: "Inter-House Debate — Semi Finals", description: "Green House vs Blue House. Winner meets Red House in the final.", date: dateStr(4), time: "14:00", venue: "Seminar Hall 2", category: "Cultural", capacity: 80, attendees: pick(41, 21), attended: [], organizer: "Asmita Shrestha" },
    { id: "ev-4", title: "Annual Science Exhibition", description: "Working models across physics, biology and computing.", date: dateStr(6), time: "10:00", venue: "Innovation Block", category: "Academic", capacity: 200, attendees: pick(120, 5), attended: [], organizer: "Anjali Nepal" },
    { id: "ev-5", title: "Council General Body Meeting", description: "Monthly sync: event calendar, finance review and suggestion-box pipeline.", date: dateStr(3), time: "15:30", venue: "Council Room, Admin Block", category: "Council Meeting", capacity: 40, attendees: [...councilIds], attended: councilIds.slice(0, 6), organizer: "Arnab Shrestha" },
  ];

  const announcements: Announcement[] = [
    { id: "an-1", title: "Assembly moved to Block C Auditorium", body: "Due to weather warnings, tomorrow's assembly shifts from the main ground to Block C Auditorium. Report by 8:40 AM sharp.", priority: "urgent", audience: { kind: "all" }, authorName: "Arnab Shrestha", authorPost: "President", timestamp: ts(0, 8, 5) },
    { id: "an-2", title: "Grade 10 board-prep timetable released", body: "The special board-prep timetable is now live in the resource portal.", priority: "important", audience: { kind: "grade", grade: 10 }, authorName: "Arnab Shrestha", authorPost: "President", timestamp: ts(-1, 12, 30) },
    { id: "an-3", title: "Basketball Finals — RSVP open", body: "Seats for the finals are limited to 120. Register on the Events tab.", priority: "event", audience: { kind: "all" }, authorName: "Anjan Bhattarai", authorPost: "Sports Captain", timestamp: ts(-1, 16, 45) },
    { id: "an-4", title: "Blue House practice — Friday 4 PM", body: "All Blue House athletes: mandatory relay practice this Friday at the main track.", priority: "important", audience: { kind: "house", house: "Blue" }, authorName: "Diwas Poudel", authorPost: "Blue House Captain", timestamp: ts(-3, 9, 0) },
  ];

  const tasks: CouncilTask[] = [
    { id: "tk-1", title: "Print finalist certificates", details: "120 certificates for Basketball Finals.", due: dateStr(1), priority: "High", assigneeId: "shr-085", status: "progress", department: "Media & Communications", createdBy: "Arnab Shrestha", createdAt: ts(-3) },
    { id: "tk-2", title: "Draft Founders' Week budget", details: "Consolidate stage, sound and lighting quotes.", due: dateStr(3), priority: "Urgent", assigneeId: "shr-085", status: "progress", createdBy: "Arnab Shrestha", createdAt: ts(-4) },
    { id: "tk-3", title: "Update house notice boards", details: "Refresh standings and upcoming fixtures.", due: dateStr(-1), priority: "Medium", assigneeId: "shr-085", status: "review", createdBy: "Arnab Shrestha", createdAt: ts(-6) },
    { id: "tk-4", title: "Reconcile annual council budget", details: "Reviewed receipts and reconciled all approved winter-term transactions.", due: dateStr(-2), priority: "Medium", assigneeId: "shr-085", status: "done", department: "Finance", createdBy: "Arnab Shrestha", createdAt: ts(-10) },
  ];

  const suggestions: Suggestion[] = [
    { id: "sg-1", category: "Canteen", text: "Can we get a juice and fruit counter during the short break?", anonymous: false, authorId: "shr-001", authorLabel: "Aarav Sharma · Grade 10 · Blue House", authorEmail: "aarav.sharma@shristiacademy.edu.np", authorRole: "student", authorGrade: 10, authorHouse: "Blue", status: "implemented", response: "Approved! A fruit counter pilot launches next Monday.", responderName: "Arnab Shrestha", timestamp: ts(-12) },
    { id: "sg-2", category: "Facilities", text: "The fans in Classroom 4-B make a loud rattling noise during tests.", anonymous: false, authorId: "shr-002", authorLabel: "Pooja Thapa · Grade 9 · Red House", authorEmail: "pooja.thapa@shristiacademy.edu.np", authorRole: "student", authorGrade: 9, authorHouse: "Red", status: "consideration", responderName: "Arnab Shrestha", response: "Logged with maintenance — inspection is scheduled this week.", timestamp: ts(-4) },
    { id: "sg-3", category: "Clubs", text: "A chess club would be amazing for students across Grades 6–10.", anonymous: false, authorId: "shr-003", authorLabel: "Rohan Gurung · Grade 10 · Green House", authorEmail: "rohan.gurung@shristiacademy.edu.np", authorRole: "student", authorGrade: 10, authorHouse: "Green", status: "pending", timestamp: ts(0, 7, 50) },
  ];

  const polls: Poll[] = [
    {
      id: "pl-1",
      question: "Spirit Day theme for Founders' Week?",
      description: "Winning theme becomes the official dress code for Friday.",
      options: ["Retro 90s", "Monochrome", "Neon Future", "Cultural Heritage"],
      votes: [1, 2, 0, 1],
      voters: ["shr-001", "shr-002", "shr-003", "shr-004"],
      ballots: [
        { userId: "shr-001", userName: "Aarav Sharma", userEmail: "aarav.sharma@shristiacademy.edu.np", userRole: "student", userGrade: 10, userHouse: "Blue", optionIndex: 0, optionLabel: "Retro 90s", timestamp: ts(-1, 14) },
        { userId: "shr-002", userName: "Pooja Thapa", userEmail: "pooja.thapa@shristiacademy.edu.np", userRole: "student", userGrade: 9, userHouse: "Red", optionIndex: 1, optionLabel: "Monochrome", timestamp: ts(-1, 15) },
        { userId: "shr-003", userName: "Rohan Gurung", userEmail: "rohan.gurung@shristiacademy.edu.np", userRole: "student", userGrade: 10, userHouse: "Green", optionIndex: 1, optionLabel: "Monochrome", timestamp: ts(-1, 16) },
        { userId: "shr-004", userName: "Suman Shrestha", userEmail: "suman.shrestha@shristiacademy.edu.np", userRole: "student", userGrade: 11, userHouse: "Blue", optionIndex: 3, optionLabel: "Cultural Heritage", timestamp: ts(0, 9) },
      ],
      expires: dateStr(2),
      audience: { kind: "all" },
      creatorName: "Asmita Shrestha",
      createdAt: ts(-2),
    },
    { id: "pl-2", question: "Which counter should join the canteen?", description: "The Welfare desk will pilot the winner for one month.", options: ["Momo Station", "Salad Bar", "Waffle Corner", "Smoothie Counter"], votes: [0, 0, 0, 0], voters: [], ballots: [], expires: dateStr(5), audience: { kind: "all" }, creatorName: "Anjali Nepal", createdAt: ts(-1) },
  ];

  const meetings: Meeting[] = [
    { id: "mt-1", title: "General Body Meeting — February", date: dateStr(3), startTime: "15:30", endTime: "16:45", venue: "Council Room, Admin Block", attendeeIds: councilIds, agenda: ["Founders' Week budget approval", "House points audit", "Suggestion digest review"] },
    { id: "mt-2", title: "Emergency Sync — Assembly Relocation", date: dateStr(0), startTime: "08:00", endTime: "08:25", venue: "Block C Foyer", attendeeIds: councilIds.slice(0, 6), agenda: ["Seating plan for Block C", "Mic and AV confirmation", "House captain roll call"], minutes: "Assembly confirmed for Block C Auditorium, 8:40 AM. House captains will verify attendance by section." },
  ];

  const finances: FinanceEntry[] = [
    { id: "fn-1", date: dateStr(-40), title: "School allocation — Winter Term", type: "income", category: "Allocation", amount: 25000, invoiceRef: "INV-2601", approvedBy: "A. Shrestha", status: "Approved" },
    { id: "fn-2", date: dateStr(-26), title: "Annual Day sound & lighting", type: "expense", category: "Events", amount: 7500, invoiceRef: "EXP-2211", approvedBy: "A. Shrestha", status: "Approved" },
    { id: "fn-3", date: dateStr(-22), title: "Charity bake sale collection", type: "income", category: "Fundraiser", amount: 8400, invoiceRef: "INV-2617", approvedBy: "A. Nepal", status: "Approved" },
  ];

  const gallery: GalleryItem[] = [
    { id: "gl-1", title: "Sports Day 100m Sprint Finals", date: dateStr(-30), category: "Sports Day", caption: "House sprinters at the finish line of the 100m finals.", image: gallerySports },
    { id: "gl-2", title: "Annual Day — Classical Fusion", date: dateStr(-21), category: "Annual Day", caption: "The senior troupe's classical fusion performance under lights.", image: galleryAnnual },
    { id: "gl-3", title: "Young Innovators Showcase", date: dateStr(-13), category: "Science Exhibition", caption: "Judges walk the floor at the annual Science Exhibition.", image: galleryScience },
    { id: "gl-4", title: "Investiture Ceremony 2026", date: dateStr(-45), category: "Investiture Ceremony", caption: "The 2026 council takes oath and receives badges.", image: galleryInvestiture },
    { id: "gl-5", title: "Debate Finals — Rebuttal Round", date: dateStr(-16), category: "Debate Championship", caption: "Semi-finalists trade rebuttals in the auditorium.", gradient: "from-amber-500 via-orange-500 to-rose-500" },
  ];

  const notifications: AppNotification[] = [
    { id: "nt-1", title: "Assembly moved to Block C", body: "Tomorrow's assembly shifts to Block C Auditorium. Report by 8:40 AM.", timestamp: ts(0, 8, 5), urgent: true, senderName: "Arnab Shrestha", senderRole: "admin", audience: { kind: "all" }, actionTab: "notices", readBy: [], kind: "broadcast" },
    { id: "nt-2", title: "New poll published", body: "A new canteen feedback poll is live.", timestamp: ts(-1, 17), urgent: false, senderName: "Anjali Nepal", senderRole: "council", audience: { kind: "all" }, actionTab: "voice", readBy: [], kind: "system" },
  ];

  const broadcastHistory: BroadcastRecord[] = [
    { id: "bc-1", title: "Assembly moved to Block C", body: "Urgent relocation notice to all students.", urgent: true, audience: { kind: "all" }, senderName: "Arnab Shrestha", timestamp: ts(0, 8, 5), delivered: 121 },
    { id: "bc-2", title: "Basketball Finals — RSVP open", body: "120 seats available on the Events tab.", urgent: false, audience: { kind: "all" }, senderName: "Anjan Bhattarai", timestamp: ts(-1, 16, 45), delivered: 121 },
  ];

  return {
    users: students,
    session: null,
    theme: "dark",
    notifications,
    pointsLedger,
    events,
    announcements,
    tasks,
    suggestions,
    polls,
    meetings,
    finances,
    gallery,
    broadcastHistory,
    departments: [...DEFAULT_DEPARTMENTS],
    permissions: Object.fromEntries(students.filter((s) => s.role !== "student" && s.status === "active").map((s) => [s.id, FEATURE_PERMISSIONS.map((p) => p.id)])),
    activeImageIds: gallery.filter((g) => g.image).map((g) => g.id).slice(0, 5),
    audit: [],
    branding: { ...DEFAULT_BRANDING },
    legal: { ...DEFAULT_LEGAL },
    eventTypes: [...DEFAULT_EVENT_TYPES],
    houses: {
      Blue: { ...DEFAULT_HOUSES.Blue },
      Red: { ...DEFAULT_HOUSES.Red },
      Green: { ...DEFAULT_HOUSES.Green },
    },
    siteRatings: [],
    houseCaptains: {},
    houseMemberships: { Blue: [], Red: [], Green: [] },
    houseMessages: [],
    councilHubMembers: [PRIMARY_ADMIN.id],
    councilMessages: [],
  };
}
