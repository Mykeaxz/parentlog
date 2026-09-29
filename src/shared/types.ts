// Shared types for ParentLog. Everything lives in chrome.storage.local — nothing leaves the browser.

export type EntryStatus =
  | "draft"      // captured from email, not yet put into PowerSchool
  | "filled"     // fields were filled into a PowerSchool form and verified; teacher has not clicked Submit yet
  | "submitted"  // teacher clicked Submit; waiting to see the post-submit page
  | "saved";     // post-submit page seen (or teacher marked it saved manually)

export interface LedgerEntry {
  id: string;
  status: EntryStatus;
  createdAt: number;          // ms epoch — when captured
  updatedAt: number;

  // From the email
  source: "gmail" | "outlook" | "manual";
  direction: "sent" | "received";
  parentEmail: string;        // the parent's address (the other party)
  parentName: string;
  teacherEmail: string;       // "me" side, if detected
  emailDateIso: string;       // ISO date of the email (YYYY-MM-DD)
  emailDateRaw: string;       // as shown in the mail client, for the teacher's reference
  subject: string;
  body: string;               // plain text, quoted thread removed unless teacher included it
  quotedBody: string;         // the quoted thread, kept separately
  includeQuoted: boolean;
  messageUrl: string;         // link back to the email

  // Teacher-added
  studentName: string;
  outcome: string;            // "Parent replied…", "No reply yet", etc.

  // PowerSchool side
  psUrl: string;              // page where it was filled
  psStudentOnPage: string;    // student name read from the PowerSchool page at fill time
  filledAt: number | null;
  submittedAt: number | null;
  savedAt: number | null;
  fillReport: FillReport | null;
}

export interface FillReport {
  formKind: "stock" | "unknown";
  fields: FieldResult[];
  ok: boolean;                // every filled field verified
  warnings: string[];
}

export interface FieldResult {
  field: "date" | "logType" | "subject" | "entry";
  found: boolean;
  filled: boolean;
  verified: boolean;
  valueSet: string;
  note: string;
}

export type DateFormat = "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";

export interface Settings {
  onboarded: boolean;
  powerschoolOrigins: string[];   // e.g. ["https://ps.district.org"]
  preferredLogType: string;       // option text to select, e.g. "Teacher" or "Teacher Contact"
  dateFormat: DateFormat;
  includeHeaderLine: boolean;     // "Email to parent@x on 09/29/2026 — Subject: …" at top of entry text
  includeOutcomeLine: boolean;
  parentStudentMap: Record<string, string>; // parentEmail -> studentName (learned at fill time)
  counters: { captured: number; filled: number; saved: number };
}

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  powerschoolOrigins: [],
  preferredLogType: "Teacher",
  dateFormat: "MM/DD/YYYY",
  includeHeaderLine: true,
  includeOutcomeLine: true,
  parentStudentMap: {},
  counters: { captured: 0, filled: 0, saved: 0 },
};

// ---- Messages between content scripts / panel / background ----

export type Msg =
  | { type: "CAPTURE_EMAIL"; payload: CapturedEmail }
  | { type: "CAPTURE_ACTIVE_TAB" }                       // panel asks background to extract from the active tab
  | { type: "OPEN_PANEL" }
  | { type: "GET_ENTRIES" }
  | { type: "GET_SETTINGS" }
  | { type: "SAVE_SETTINGS"; payload: Partial<Settings> }
  | { type: "UPSERT_ENTRY"; payload: LedgerEntry }
  | { type: "DELETE_ENTRY"; id: string }
  | { type: "CLEAR_ALL" }
  | { type: "REQUEST_PS_ORIGIN"; origin: string }        // panel → background: register PS content script for origin
  | { type: "REMOVE_PS_ORIGIN"; origin: string }
  | { type: "MARK_FILLED"; id: string; report: FillReport; psUrl: string; psStudentOnPage: string }
  | { type: "MARK_SUBMITTED"; id: string }
  | { type: "MARK_SAVED"; id: string }
  | { type: "PS_PAGE_LOADED"; url: string; looksLikeSuccess: boolean; hasForm: boolean }
  | { type: "PING" };

export interface CapturedEmail {
  source: "gmail" | "outlook";
  direction: "sent" | "received";
  parentEmail: string;
  parentName: string;
  teacherEmail: string;
  emailDateIso: string;
  emailDateRaw: string;
  subject: string;
  body: string;
  quotedBody: string;
  messageUrl: string;
}

export interface MsgResponse {
  ok: boolean;
  error?: string;
  entries?: LedgerEntry[];
  settings?: Settings;
  entry?: LedgerEntry;
}
