import type { Branding, House, HouseBranding, LegalContent, NotificationTemplate } from "./types";

export const DEFAULT_NOTIFICATION_TEMPLATES: Record<string, NotificationTemplate> = {
  poll_new: {
    id: "poll_new",
    category: "Polls & Surveys",
    name: "New Student Poll",
    title: "Student Poll Live",
    body: '"{question}" — cast your vote before {expires}.',
    urgent: false,
    actionTab: "voice",
    variables: ["{question}", "{expires}", "{creator}"],
  },
  poll_teacher: {
    id: "poll_teacher",
    category: "Polls & Surveys",
    name: "Staff / Teacher Survey",
    title: "Teacher Survey Published",
    body: 'Staff Consultation: "{question}" — please share your feedback before {expires}.',
    urgent: false,
    actionTab: "voice",
    variables: ["{question}", "{expires}", "{creator}"],
  },
  suggestion_reply: {
    id: "suggestion_reply",
    category: "Student Suggestions",
    name: "Admin Reply to Suggestion",
    title: "Response to your suggestion",
    body: '{responder} ({role}) responded to: "{suggestion}" — {response}',
    urgent: false,
    actionTab: "voice",
    variables: ["{responder}", "{role}", "{status}", "{suggestion}", "{response}"],
  },
  council_message: {
    id: "council_message",
    category: "Council Hub",
    name: "Council Hub Message",
    title: "Council Hub Alert",
    body: '{author} ({title}): "{message}"',
    urgent: false,
    actionTab: "councilHub",
    variables: ["{author}", "{title}", "{message}"],
  },
  house_message: {
    id: "house_message",
    category: "House Hub",
    name: "House Hub Notice",
    title: "{house} House Notice",
    body: '{title}: {message}',
    urgent: false,
    actionTab: "house",
    variables: ["{house}", "{title}", "{message}", "{author}"],
  },
  inactive_user: {
    id: "inactive_user",
    category: "Engagement & Inactivity",
    name: "Inactive User Reminder (> 3 Days)",
    title: "We miss you at Shristi Hub!",
    body: "Hi {name}! You have been away for {days} days. Jump back in to see new house points and notices.",
    urgent: false,
    actionTab: "dashboard",
    variables: ["{name}", "{days}"],
  },
  assembly_urgent: {
    id: "assembly_urgent",
    category: "Emergency & Assembly",
    name: "Urgent Assembly Notice",
    title: "Urgent Assembly Notice",
    body: "All students are requested to assemble at the Main Hall immediately. House captains, please take attendance.",
    urgent: true,
    actionTab: "events?tab=notices",
    variables: [],
  },
  house_points: {
    id: "house_points",
    category: "House Points",
    name: "House Points Update",
    title: "House Points Update",
    body: "New house points have been verified and added to the official leaderboard. Check your house's latest standing.",
    urgent: false,
    actionTab: "houses",
    variables: [],
  },
  council_meeting: {
    id: "council_meeting",
    category: "Council Operations",
    name: "Council Meeting Alert",
    title: "Council Meeting Alert",
    body: "Reminder: the council executives meeting is scheduled today in the Conference Room. Please bring your department updates.",
    urgent: false,
    actionTab: "meetings",
    variables: [],
  },
  event_reg: {
    id: "event_reg",
    category: "Events & News",
    name: "New Event Registration",
    title: "New Event Registration",
    body: "Registrations are now open for the upcoming school event. Submit your entry before seats fill up.",
    urgent: false,
    actionTab: "events",
    variables: [],
  },
  task_assigned: {
    id: "task_assigned",
    category: "Task Delegation",
    name: "Task Assignment Alert",
    title: "New Council Task Assigned",
    body: 'You have been assigned to task: "{taskTitle}". Due date: {dueDate}.',
    urgent: false,
    actionTab: "tasks",
    variables: ["{taskTitle}", "{dueDate}", "{department}"],
  },
};

export const DEFAULT_BRANDING: Branding = {
  schoolName: "Student Council",
  boardName: "Shristi Academy Board",
  session: "Session 2025-26",
  logoUrl: "",
  tagline: "A place for every student voice. Stay connected with your council, take part in school life, and help shape what comes next.",
  footerNote: "School Student Council System Platform / Version 1.0.0",
};

export const DEFAULT_LEGAL: LegalContent = {
  terms: `## A workspace built on trust
Use the Shristi Academy Student Council Hub respectfully. Keep account credentials private, use school resources responsibly, and do not publish another student's personal information or photos without permission.

## Student roster
The student roster is managed by council administrators, who may add, edit, or remove records at any time. Students cannot self-register; an administrator must create the account first.

## About this preview
This is a functional browser-based demonstration. Changes are stored in this browser and synchronized with other open tabs on the same origin. Do not enter real student credentials or sensitive school records.`,
  credits: `## Designed for the council community
Created for the Shristi Academy Student Council Digital Hub. Built with React, TypeScript, and Tailwind CSS. Interface icons by Lucide; animations by Motion. Typography: Inter and Lora.

## School administration
Primary administrator: Arnab Shrestha, Council President.
Grade 9 / Red House
72019arnab@shristiacademy.edu.np`,
};

export const DEFAULT_HOUSES: Record<House, HouseBranding> = {
  Blue: { name: "Blue", logoUrl: "" },
  Red: { name: "Red", logoUrl: "" },
  Green: { name: "Green", logoUrl: "" },
};

export const DEFAULT_EVENT_TYPES = ["Meetings", "Workshops", "Sports & Games", "Cultural & Arts", "School Assembly", "Community Drive"];

export function categoryToEventType(category: string): string {
  if (category === "Council Meeting") return "Meetings";
  if (category === "Academic") return "Workshops";
  if (category === "Sports") return "Sports & Games";
  if (category === "Cultural") return "Cultural & Arts";
  if (category === "Assembly") return "School Assembly";
  return "Community Drive";
}

export function renderRichText(value: string) {
  return value
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, index) => ({
      key: index,
      heading: block.startsWith("## ") ? block.slice(3).split("\n")[0] : null,
      body: block.startsWith("## ") ? block.split("\n").slice(1).join("\n") : block,
    }));
}
