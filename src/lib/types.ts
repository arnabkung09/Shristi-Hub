import type { CanonicalGrade, CanonicalHouse, CanonicalRole, CanonicalStatus } from "./ssot-auth";

export type Role = CanonicalRole;
export type House = "Blue" | "Red" | "Green";
export type AccountStatus = CanonicalStatus;
export type GradeLabel = CanonicalGrade;
export type HouseLabel = CanonicalHouse;

export interface Student {
  id: string;
  name: string;
  email: string;
  /** Optional personal or secondary emails that authenticate this same account. */
  aliases?: string[];
  password: string;
  passwordHash?: string;
  /** Teachers may have no class. */
  grade: number | null;
  gradeLabel: GradeLabel | null;
  /** Teachers may belong to no house. */
  house: House | null;
  houseLabel: HouseLabel | null;
  status: AccountStatus;
  role: Role;
  councilPost?: string;
  councilTitle?: string;
  department?: string;
  avatarUrl?: string;
  createdAt: string;
  isStaff?: boolean;
}

export interface Session {
  userId: string;
  token: string;
}

export type Audience =
  | { kind: "all" }
  | { kind: "role"; role: Role }
  | { kind: "user"; userId: string; name?: string }
  | { kind: "house"; house: House }
  | { kind: "grade"; grade: number };

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  timestamp: number;
  urgent: boolean;
  senderName: string;
  senderRole: Role;
  audience: Audience;
  actionTab?: string;
  readBy: string[];
  kind: "broadcast" | "system";
}

export type PointCategory = "Sports" | "Academics" | "Cultural & Arts" | "Discipline" | "Community Service";

export interface PointEntry {
  id: string;
  house: House;
  delta: number;
  category: PointCategory;
  reason: string;
  officerName: string;
  timestamp: number;
  units?: number;
  pointsEach?: number;
}

export type EventCategory = "Academic" | "Cultural" | "Sports" | "Assembly" | "Council Meeting";

export interface SchoolEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  venue: string;
  category: EventCategory;
  eventType?: string;
  capacity: number;
  attendees: string[];
  attended: string[];
  organizer: string;
}

export type NoticePriority = "urgent" | "important" | "general" | "event";

export interface Announcement {
  id: string;
  title: string;
  body: string;
  priority: NoticePriority;
  audience: Audience;
  authorName: string;
  authorPost: string;
  timestamp: number;
}

export type TaskStatus = "todo" | "progress" | "review" | "done";
export type TaskPriority = "Low" | "Medium" | "High" | "Urgent";

export interface CouncilTask {
  id: string;
  title: string;
  details: string;
  due: string;
  priority: TaskPriority;
  assigneeId: string;
  status: TaskStatus;
  createdBy: string;
  createdAt: number;
  department?: string;
}

export type SuggestionCategory = "Academics" | "Facilities" | "Canteen" | "Sports" | "Clubs" | "Student Welfare";
export type SuggestionStatus = "pending" | "consideration" | "implemented" | "declined";

export interface Suggestion {
  id: string;
  category: SuggestionCategory;
  text: string;
  anonymous: boolean;
  authorId?: string;
  authorLabel: string;
  status: SuggestionStatus;
  response?: string;
  responderName?: string;
  timestamp: number;
}

export interface Poll {
  id: string;
  question: string;
  description: string;
  options: string[];
  votes: number[];
  voters: string[];
  expires: string;
  audience: Audience;
  creatorName: string;
  createdAt: number;
}

export interface Meeting {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  venue: string;
  attendeeIds: string[];
  agenda: string[];
  minutes?: string;
}

export type FinanceType = "income" | "expense";
export type FinanceStatus = "Approved" | "Pending" | "Reimbursed";

export interface FinanceEntry {
  id: string;
  date: string;
  title: string;
  type: FinanceType;
  category: string;
  amount: number;
  invoiceRef: string;
  approvedBy: string;
  status: FinanceStatus;
}

export interface GalleryItem {
  id: string;
  title: string;
  date: string;
  category: string;
  caption: string;
  image?: string;
  gradient?: string;
}

export interface ResourceDoc {
  id: string;
  title: string;
  category: string;
  tag: string;
  updated: string;
  size: string;
}

export interface BroadcastRecord {
  id: string;
  title: string;
  body: string;
  urgent: boolean;
  audience: Audience;
  senderName: string;
  timestamp: number;
  delivered: number;
}

export interface AuditEntry {
  id: string;
  action: string;
  actor: string;
  timestamp: number;
}

export interface Branding {
  schoolName: string;
  boardName: string;
  session: string;
  logoUrl: string;
  footerNote: string;
  tagline: string;
}

export interface LegalContent {
  terms: string;
  credits: string;
}

export interface HouseMessage {
  id: string;
  house: House;
  title: string;
  body: string;
  kind: "instruction" | "message";
  authorId: string;
  authorName: string;
  authorRole: string;
  timestamp: number;
}

export interface HouseBranding {
  name: string;
  logoUrl: string;
}

export interface SiteRating {
  userId: string;
  userName: string;
  house: House;
  value: number;
  comment: string;
  timestamp: number;
}

export interface CouncilChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: Role;
  authorTitle?: string;
  /** Inline markup: **bold**, __underline__, *italic*. */
  body: string;
  timestamp: number;
  removed?: boolean;
}

/**
 * Shared chat rooms backed by the Firestore `hubChat/{room}/messages` collection.
 * The Council Hub room is membership-gated; device-only previews keep using the
 * locally persisted `councilMessages` slice instead.
 */
export type HubRoom = "council";

/** A message stored in a shared hub chat room. */
export type HubChatMessage = CouncilChatMessage;

export interface HubState {
  users: Student[];
  /** Accounts granted access to the Council Hub chat. */
  councilHubMembers: string[];
  councilMessages: CouncilChatMessage[];
  session: Session | null;
  theme: "dark" | "light";
  notifications: AppNotification[];
  pointsLedger: PointEntry[];
  events: SchoolEvent[];
  announcements: Announcement[];
  tasks: CouncilTask[];
  suggestions: Suggestion[];
  polls: Poll[];
  meetings: Meeting[];
  finances: FinanceEntry[];
  gallery: GalleryItem[];
  broadcastHistory: BroadcastRecord[];
  departments: string[];
  permissions: Record<string, string[]>;
  activeImageIds: string[];
  audit: AuditEntry[];
  branding: Branding;
  legal: LegalContent;
  eventTypes: string[];
  houseCaptains: Partial<Record<House, string>>;
  houseMessages: HouseMessage[];
  houses: Record<House, HouseBranding>;
  siteRatings: SiteRating[];
}
