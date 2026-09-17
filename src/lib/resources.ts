import type { ResourceDoc } from "./types";

const CONTENT: Record<string, string> = {
  "res-1": "1. Representation\nThe council represents student voices from Grades 1 through 10.\n\n2. Responsibilities\nOfficers maintain accurate records, communicate respectfully, and report decisions to the student body.\n\n3. Governance\nRecord meeting agendas, attendance, decisions, and action owners. Financial and house-point decisions need a documented reason.\n\n4. Review\nSchool administration must approve the final constitution before adoption.",
  "res-2": "EVENT CIRCULAR\n\nEvent title: ____________________\nDate and time: ____________________\nVenue: ____________________\nEligible grades: ____________________\nRegistration deadline: ____________________\nOrganizer: ____________________\n\nDescription and instructions:\n__________________________________________________\n\nApproved by: ____________________",
  "res-3": "FIELD TRIP PERMISSION\n\nStudent name: ____________________\nGrade and house: ____________________\nTrip destination: ____________________\nDeparture and return: ____________________\n\nGuardian consent:\nI have reviewed the school-issued trip information and consent to the student's participation.\n\nGuardian name: ____________________\nContact number: ____________________\nSignature and date: ____________________\n\nSubmit the completed form privately to the school office, not through a public feed.",
  "res-4": "CLUB REGISTRATION\n\nStudent name: ____________________\nStudent ID: ____________________\nGrade and house: ____________________\nSelected club: ____________________\n\nWhy would you like to join?\n__________________________________________________\n\nMeeting availability: ____________________\nFaculty approval: ____________________",
  "res-5": "HOUSE CHAMPIONSHIP DRAFT\n\nOfficial houses: Blue House, Red House, Green House.\n\nRecord awards in Sports, Academics, Cultural & Arts, Discipline, or Community Service.\n\nEvery point entry should include the house, signed point amount, reason, officer, and date.\n\nThe final school-approved scoring policy takes precedence over this demonstration outline.",
  "res-6": "COMPETITION PLANNING CHECKLIST\n\n1. Confirm eligible grades and teams.\n2. Publish the format, schedule, venue, and registration deadline.\n3. Confirm judging criteria and impartial judges.\n4. Arrange safety and accessibility support.\n5. Record attendance and verified results.\n6. Publish approved results and add justified house-point entries.",
  "res-7": "BUDGET & REIMBURSEMENT DRAFT\n\n1. Describe the proposed purchase and obtain approval.\n2. Keep an itemized receipt or invoice.\n3. Record the date, amount, category, reference, and approving officer.\n4. Mark requests pending until reviewed.\n5. Reconcile reimbursements against supporting records.\n\nApproval thresholds must be supplied by school administration.",
  "res-8": "MINUTES OF MEETING\n\nMeeting title: ____________________\nDate: ____________________\nStart / end time: ____________________\nVenue: ____________________\nAttendees: ____________________\n\nAgenda:\n1. ____________________\n2. ____________________\n\nDecisions:\n__________________________________________________\n\nAction / Owner / Due date:\n__________________________________________________\n\nRecorded by: ____________________\nApproved by: ____________________",
};

export function resourceText(resource: ResourceDoc) {
  return `${resource.title}\nShristi Academy Student Council\n\nDEMONSTRATION TEMPLATE\nThis is not an official school-issued document. School administration must review and approve it before use.\n\n${CONTENT[resource.id] ?? "Contact the school office for the approved document."}`;
}

export function downloadResource(resource: ResourceDoc) {
  const blob = new Blob([resourceText(resource)], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${resource.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-template.txt`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}