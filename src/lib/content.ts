import type { Branding, House, HouseBranding, LegalContent } from "./types";

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
