import type { CanonicalGrade, CanonicalHouse, User, WhitelistedStudent } from "./ssot-auth";
import { assertExactWhitelistCount } from "./ssot-auth";

export const ROSTER_SOURCE_URL = "https://docs.google.com/spreadsheets/d/1RsaXTwK6Q9vrDVNVBErHS3li_Z8TdwwNUOtXOI7U-Mo/edit?gid=0#gid=0";
const CREATED_AT = "2026-01-01T00:00:00.000Z";

// Snapshot of the school-provided sheet. Format: Name | House | Grade | School email.
const SOURCE_ROWS = `Adhiyajna Bhandari|Blue House|Grade 1|adhiyajna@shristiacademy.edu.np
Karma Sherpa|Blue House|Grade 1|karma@shristiacademy.edu.np
Sayuj Amir Kansakar|Blue House|Grade 1|79029sayuj@shristiacademy.edu.np
Filiya Singh|Blue House|Grade 1|filiya@shristiacademy.edu.np
Sumati Sharma|Blue House|Grade 1|79036sumati@shristiacademy.edu.np
Aavansh Joshi|Blue House|Grade 2|aavanshjoshi@shristiacademy.edu.np
Arjav Gajurel Bhatta|Blue House|Grade 2|arjav@shristiacademy.edu.np
Mirielle Rai|Blue House|Grade 2|miriellerai@shristiacademy.edu.np
Shubham Joshi|Blue House|Grade 2|shubhamjoshi@shristiacademy.edu.np
Swornim Mandal|Blue House|Grade 2|swornimmandal@shristiacademy.edu.np
Aahana Joshi|Blue House|Grade 3|77052aahana@shristiacademy.edu.np
Navrit Pokhrel|Blue House|Grade 3|navrit@shristiacademy.edu.np
Shreem Kafle|Blue House|Grade 3|shreem@shristiacademy.edu.np
Upasana Joshi|Blue House|Grade 3|upasana@shristiacademy.edu.np
Aabhash Sapkota|Blue House|Grade 3|aabash@shristiacademy.edu.np
Sanvi Sah|Blue House|Grade 4|sanvi@shristiacademy.edu.np
Aadya Shah|Blue House|Grade 4|76009aadya@shristiacademy.edu.np
Aaryav Bishankhe|Blue House|Grade 4|78079aaryav@shristiacademy.edu.np
Riyansh Tandukar|Blue House|Grade 4|76031riyansh@shristiacademy.edu.np
Phebe Maharjan|Blue House|Grade 5|75001phebe@shristiacademy.edu.np
Aksha Shrestha|Blue House|Grade 5|aksha@shristiacademy.edu.np
Aluf Rai|Blue House|Grade 5|75027aluf@shristiacademy.edu.np
Samyak Bhattarai|Blue House|Grade 5|75038samyak@shristiacademy.edu.np
Eva Bajgain|Blue House|Grade 6|75017eva@shristiacademy.edu.np
Aarohi Sapkota|Blue House|Grade 6|77042aarohi@shristiacademy.edu.np
Avik Budhathoki|Blue House|Grade 6|75028avik@shristiacademy.edu.np
Swopnil A. Kansakar|Blue House|Grade 6|swopnil@shristiacademy.edu.np
Sakshyam Poudel|Blue House|Grade 6|sakshyam@shristiacademy.edu.np
Shubham Shakya|Blue House|Grade 7|72095shubham@shristiacademy.edu.np
Arnish Arunkarthik|Blue House|Grade 7|arnish@shristiacademy.edu.np
Nimisha Tamrakar|Blue House|Grade 7|73017nimisha@shristiacademy.edu.np
Aahana Shah|Blue House|Grade 8|79048aahana@shristiacademy.edu.np
Nirvik Budhathoki|Blue House|Grade 8|76012nirvik@shristiacademy.edu.np
Lochani Bhattarai|Blue House|Grade 10|72036lochani@shristiacademy.edu.np
Paridhi Tandukar|Blue House|Grade 10|72032paridhi@shristiacademy.edu.np
Prasiddhi Panday|Blue House|Grade 10|72031pranu@shristiacademy.edu.np
Aarav Ghimire|Blue House|Grade 10|72079aarav@shristiacademy.edu.np
Aashutosh Shrestha|Blue House|Grade 10|aashutosh@shristiacademy.edu.np
Sarbagya Adhikari|Blue House|Grade 10|72029sarbagya@shristiacademy.edu.np
Soren Prasad Shrestha|Blue House|Grade 10|sorenshrestha@shristiacademy.edu.np
Aadish Acharya|Red House|Grade 1|aadish@shristiacademy.edu.np
Aayan Pokharel|Red House|Grade 1|aayan@shristiacademy.edu.np
Sahasrajit Bdr. Khatri|Red House|Grade 1|80021sahasrajit@shristiacademy.edu.np
Tezoor Budhathoki|Red House|Grade 1|79035tezoor@shristiacademy.edu.np
Aarav Chaudhary|Red House|Grade 2|aaravchaudhary@shristiacademy.edu.np
Ishan Kharel|Red House|Grade 2|ishankharel@shristiacademy.edu.np
Lois Aino Lhomi|Red House|Grade 2|loislhomi@shristiacademy.edu.np
Sauharda Thapa|Red House|Grade 3|sauhardha@shristiacademy.edu.np
Pranay Raj Shrestha|Red House|Grade 3|pranay@shristiacademy.edu.np
Yoseph Rai|Red House|Grade 3|yoseph@shristiacademy.edu.np
Rhea Karkee|Red House|Grade 3|rheakarki@shristiacademy.edu.np
Deborah Rai|Red House|Grade 3|debora@shristiacademy.edu.np
Nikhilesh P.H. Sharma Whiteman|Red House|Grade 4|78105nikhilesh@shristiacademy.edu.np
Anshuman Tripathi|Red House|Grade 4|82099anshuman@shristiacademy.edu.np
Adhvik Sharma Sapkota|Red House|Grade 4|adhvik@shristiacademy.edu.np
Shuvam Banskota|Red House|Grade 5|75029shuvham@shristiacademy.edu.np
Angad Budha|Red House|Grade 5|75037angad@shristiacademy.edu.np
Aawaz Niraula|Red House|Grade 5|aawaz79009@shristiacademy.edu.np
Aarohi Kharel|Red House|Grade 5|76010aarohi@shristiacademy.edu.np
Aayusha Sherpa|Red House|Grade 5|78077aayusha@shristiacademy.edu.np
Angel Gurung|Red House|Grade 6|83003angel@shristiacademy.edu.np
Nereus Tamang|Red House|Grade 6|nereus@shristiacademy.edu.np
Anmol Tamang|Red House|Grade 6|anmol@shristiacademy.edu.np
Arantha Bhattarai|Red House|Grade 6|74023aranth@shristiacademy.edu.np
Nibriti Nepal|Red House|Grade 6|75003nibriti@shristiacademy.edu.np
Amar Raut|Red House|Grade 7|amar79005@shristiacademy.edu.np
Pranesh Mattaniah Rai|Red House|Grade 7|73005pranesh@shristiacademy.edu.np
Avi Raj Pant|Red House|Grade 7|apant@shristiacademy.edu.np
Aarya Shah|Red House|Grade 7|73011aarya@shristiacademy.edu.np
Prajakta Shrestha|Red House|Grade 7|prajakta@shristiacademy.edu.np
Theia Shrestha|Red House|Grade 7|theia@shristiacademy.edu.np
Javesha Dahal|Red House|Grade 8|74018javesha@shristiacademy.edu.np
Aaryaman Tripathi|Red House|Grade 8|aaryaman@shristiacademy.edu.np
Prabhu Tripathi|Red House|Grade 8|prabhu@shristiacademy.edu.np
Pralav Dhakal|Red House|Grade 8|72081pralav@shristiacademy.edu.np
Arnab Shrestha|Red House|Grade 9|72019arnab@shristiacademy.edu.np
Amrita Raut|Red House|Grade 9|79004amrita@shristiacademy.edu.np
Aayam Niraula|Red House|Grade 10|76004aayam@shristiacademy.edu.np
Adhrit Sharma Sapkota|Red House|Grade 10|79016adhrit@shristiacademy.edu.np
Mayank Shah|Red House|Grade 10|72035mayank@shristiacademy.edu.np
Shodashi Pradhan|Red House|Grade 10|79050shodashi@shristiacademy.edu.np
Pratishara Sthapit|Green House|Grade 1|pratishara@shristiacademy.edu.np
Reyansh Dahal|Green House|Grade 1|79019reyansh@shristiacademy.edu.np
Aariv Karn|Green House|Grade 2|aarivkarn@shristiacademy.edu.np
Atharv Hathi|Green House|Grade 2|atharvhathi@shristiacademy.edu.np
Ayansh Pokhrel|Green House|Grade 2|ayanshpokhrel@shristiacademy.edu.np
Drishyam Jung Karki|Green House|Grade 2|drishyamkarki@shristiacademy.edu.np
Ibhan Khaniya|Green House|Grade 2|83012ibhan@shristiacademy.edu.np
Prayusha Adhikari|Green House|Grade 2|prayushaadhikari@shristiacademy.edu.np
Viyan Joshi|Green House|Grade 3|viyan@shristiacademy.edu.np
Aadhar Bista|Green House|Grade 3|76023aadhar@shristiacademy.edu.np
Aariv Acharya|Green House|Grade 3|82107aariv@shristiacademy.edu.np
Shreyash Shankhadev|Green House|Grade 3|shreyash@shristiacademy.edu.np
Aaradhya Shah|Green House|Grade 3|77044aaradhya@shristiacademy.edu.np
Aasvi Bhattarai|Green House|Grade 3|83004aasvi@shristiacademy.edu.np
Jurika Khadgi|Green House|Grade 3|jurika@shristiacademy.edu.np
Kaya Shrestha|Green House|Grade 3|kaya@shristiacademy.edu.np
Evangeline Joyce Thapa|Green House|Grade 4|76014evangeline@shristiacademy.edu.np
Dirghayu Baniya|Green House|Grade 4|dirghayu@shristiacademy.edu.np
Shivansh Mishra|Green House|Grade 4|79013shivansh@shristiacademy.edu.np
Drishti Karki|Green House|Grade 4|drishti79001@shristiacademy.edu.np
Aarab Ghimire|Green House|Grade 4|aarab@shristiacademy.edu.np
Sanskar Mainali|Green House|Grade 5|75026sanskar@shristiacademy.edu.np
Pranisha Adhikari|Green House|Grade 5|75022pranisha@shristiacademy.edu.np
Yugansh Angdembe|Green House|Grade 5|provisional.yugansh.angdembe@shristiacademy.edu.np
Jehan Karki|Green House|Grade 6|74026jehan@shristiacademy.edu.np
Viaan Lal Joshi|Green House|Grade 6|74022vian@shristiacademy.edu.np
Anushka Shah|Green House|Grade 7|73019anushka@shristiacademy.edu.np
Prajakta Shrestha|Green House|Grade 7|provisional.prajakta.green@shristiacademy.edu.np
Mishika Karki|Green House|Grade 8|72068mishika@shristiacademy.edu.np
Aadeesh Bista|Green House|Grade 8|72005aadeesh@shristiacademy.edu.np
Sayara Upreti|Green House|Grade 8|80001sayara@shristiacademy.edu.np
Pranshu Shakya|Green House|Grade 8|74019pranshu@shristiacademy.edu.np
Paravi Saha|Green House|Grade 8|72088paravi@shristiacademy.edu.np
Eslie K. Bhutia|Green House|Grade 9|72016eslie@shristiacademy.edu.np
Yahosu Rai|Green House|Grade 9|yahosurai@shristiacademy.edu.np
Kavya Sri Nepal|Green House|Grade 9|75004kavya@shristiacademy.edu.np
Aajin Raj Kafle|Green House|Grade 9|72024aajin@shristiacademy.edu.np
Josiah Shankar|Green House|Grade 10|72038josiah@shristiacademy.edu.np
Aangshu Maharjan|Green House|Grade 10|76026angshu@shristiacademy.edu.np
Sanobar Karkee|Green House|Grade 10|sanobar@shristiacademy.edu.np`;

export interface RosterSourceIssue {
  studentName: string;
  sourceValue: string;
  resolvedValue: string;
  reason: string;
  requiresVerification: boolean;
}

export const ROSTER_SOURCE_ISSUES: RosterSourceIssue[] = [
  { studentName: "Lochani Bhattarai", sourceValue: "72036lochani@shriatiacademy.edu.np", resolvedValue: "72036lochani@shristiacademy.edu.np", reason: "Corrected obvious misspelling in institutional domain.", requiresVerification: false },
  { studentName: "Mayank Shah", sourceValue: "72035mayank@shriatiacademy.edu.np", resolvedValue: "72035mayank@shristiacademy.edu.np", reason: "Corrected obvious misspelling in institutional domain.", requiresVerification: false },
  { studentName: "Prayusha Adhikari", sourceValue: "prayushaadhikari@shriatiacademy.edu.np", resolvedValue: "prayushaadhikari@shristiacademy.edu.np", reason: "Corrected obvious misspelling in institutional domain.", requiresVerification: false },
  { studentName: "Yugansh Angdembe", sourceValue: "(blank)", resolvedValue: "provisional.yugansh.angdembe@shristiacademy.edu.np", reason: "Source row has no email. Provisional address preserves the record but must be verified before credentials are issued.", requiresVerification: true },
  { studentName: "Prajakta Shrestha (Green House)", sourceValue: "prajakta@shristiacademy.edu.np", resolvedValue: "provisional.prajakta.green@shristiacademy.edu.np", reason: "The same name/email also appears in Red House. A provisional unique address prevents account collision and requires school verification.", requiresVerification: true },
];

const parsedRows: WhitelistedStudent[] = SOURCE_ROWS.trim().split("\n").map((line, index) => {
  const [name, house, grade, email] = line.split("|");
  const isArnab = email === "72019arnab@shristiacademy.edu.np";
  return {
    id: isArnab ? "shr-085" : `sheet-${String(index + 1).padStart(3, "0")}`,
    email: email.toLowerCase(),
    name,
    grade: grade as CanonicalGrade,
    house: house as CanonicalHouse,
    role: isArnab ? "admin" : "student",
    councilTitle: isArnab ? "President" : undefined,
    status: isArnab ? "active" : "pending",
    createdAt: CREATED_AT,
  };
});

export const SHRISTI_WHITELIST: WhitelistedStudent[] = parsedRows;

export const SHRISTI_USER_ROSTER: User[] = SHRISTI_WHITELIST.map((student) => ({
  ...student,
  aliases: [],
  passwordHash: student.role === "admin" ? "admin-password-hash" : "seeded-password-hash",
}));

export const PRIMARY_ADMIN = SHRISTI_USER_ROSTER.find((student) => student.email === "72019arnab@shristiacademy.edu.np")!;

export function getGradeDistribution() {
  const grades: CanonicalGrade[] = ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10"];
  return grades.map((grade) => ({ grade, count: SHRISTI_WHITELIST.filter((student) => student.grade === grade).length }));
}

export function getHouseDistribution() {
  const houses: CanonicalHouse[] = ["Blue House", "Red House", "Green House"];
  return houses.map((house) => ({ house, count: SHRISTI_WHITELIST.filter((student) => student.house === house).length }));
}

assertExactWhitelistCount(SHRISTI_WHITELIST);
if (SHRISTI_WHITELIST.length !== 121) {
  throw new Error(`School roster snapshot is incomplete: expected 121 rows, received ${SHRISTI_WHITELIST.length}.`);
}
const houseCounts = Object.fromEntries(getHouseDistribution().map(({ house, count }) => [house, count]));
if (houseCounts["Blue House"] !== 40 || houseCounts["Red House"] !== 41 || houseCounts["Green House"] !== 40) {
  throw new Error("School roster snapshot has unexpected house totals; expected Blue 40, Red 41, Green 40.");
}