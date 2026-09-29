import { DateFormat, LedgerEntry, Settings } from "./types";

/** Format an ISO date (YYYY-MM-DD) in the teacher's chosen PowerSchool format. */
export function formatDate(iso: string, fmt: DateFormat): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  switch (fmt) {
    case "DD/MM/YYYY": return `${d}/${mo}/${y}`;
    case "YYYY-MM-DD": return `${y}-${mo}-${d}`;
    default: return `${mo}/${d}/${y}`;
  }
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Parse a date string a mail client shows ("Sep 29, 2026, 8:14 AM", "Tue, Sep 29, 2026", ISO…) into YYYY-MM-DD. Falls back to today. */
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  januar: 1, februar: 2, märz: 3, mai: 5, juni: 6, juli: 7, okt: 10, dez: 12,
};
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const valid = (y: number, m: number, d: number) => y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;

/** Explicit patterns first (Date.parse is unreliable for "Tue, Sep 29, 2026, 8:14 AM"), then Date.parse, then today. */
export function toIsoDate(raw: string | null | undefined): string {
  if (!raw) return todayIso();
  const s = raw.replace(/ | /g, " ").replace(/\s+at\s+/i, " ").replace(/^[A-Za-zäöü]{2,10}\.?,\s*/, "").replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s+/i, "").trim();
  let m: RegExpExecArray | null;

  // ISO 2026-09-29…
  if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)) && valid(+m[1], +m[2], +m[3])) return iso(+m[1], +m[2], +m[3]);
  // "Sep 29, 2026", "September 29 2026"
  if ((m = /^([A-Za-zäöü]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s))) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo && valid(+m[3], mo, +m[2])) return iso(+m[3], mo, +m[2]);
  }
  // "29 Sep 2026", "29. September 2026"
  if ((m = /^(\d{1,2})\.?\s+([A-Za-zäöü]{3,9})\.?\s+(\d{4})/.exec(s))) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (mo && valid(+m[3], mo, +m[1])) return iso(+m[3], mo, +m[1]);
  }
  // "9/29/2026" (US) — Gmail/Outlook in en-US
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s)) && valid(+m[3], +m[1], +m[2])) return iso(+m[3], +m[1], +m[2]);
  // "29.09.2026" (de) or "29/09/2026" where first number can't be a month
  if ((m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(s)) && +m[1] > 12 && valid(+m[3], +m[2], +m[1])) return iso(+m[3], +m[2], +m[1]);
  // "Sep 29" (this year)
  if ((m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})$/.exec(s))) {
    const mo = MONTHS[m[1].toLowerCase()];
    const y = new Date().getFullYear();
    if (mo && valid(y, mo, +m[2])) return iso(y, mo, +m[2]);
  }
  const t = Date.parse(s);
  if (!isNaN(t)) {
    const d = new Date(t);
    if (valid(d.getFullYear(), d.getMonth() + 1, d.getDate())) return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  return todayIso();
}

/** Turn an HTML element's content into readable plain text (keeps line breaks). */
export function elementToText(el: Element): string {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("style,script,noscript").forEach((n) => n.remove());
  clone.querySelectorAll("br").forEach((n) => n.replaceWith("\n"));
  clone.querySelectorAll("p,div,li,tr,h1,h2,h3,h4,h5,h6,blockquote").forEach((n) => {
    n.prepend("\n");
    n.append("\n");
  });
  return normaliseWhitespace(clone.textContent ?? "");
}

export function normaliseWhitespace(s: string): string {
  return s
    .replace(/\r/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Split a plain-text email body into the new text and the quoted thread ("On … wrote:", "From: …", "-----Original Message-----"). */
export function splitQuoted(text: string): { body: string; quoted: string } {
  const lines = text.split("\n");
  const markers = [
    /^On .{5,200} wrote:\s*$/i,
    /^-{2,}\s*Original Message\s*-{2,}$/i,
    /^From:\s.+$/i,
    /^Am .{5,200} schrieb .+:\s*$/i,
    /^Le .{5,200} a écrit\s*:\s*$/i,
    /^_{5,}$/,
  ];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (i > 0 && markers.some((m) => m.test(l))) {
      return { body: lines.slice(0, i).join("\n").trim(), quoted: lines.slice(i).join("\n").trim() };
    }
    if (l.startsWith(">") && i > 0) {
      return { body: lines.slice(0, i).join("\n").trim(), quoted: lines.slice(i).join("\n").trim() };
    }
  }
  return { body: text.trim(), quoted: "" };
}

/** The text that goes into the PowerSchool "Log Entry" box. */
export function buildEntryText(e: LedgerEntry, s: Settings): string {
  const parts: string[] = [];
  if (s.includeHeaderLine) {
    const who = e.parentName ? `${e.parentName} <${e.parentEmail}>` : e.parentEmail || "parent";
    const verb = e.direction === "received" ? "Email received from" : "Email sent to";
    parts.push(`${verb} ${who} on ${formatDate(e.emailDateIso, s.dateFormat)}${e.subject ? ` — Subject: ${e.subject}` : ""}`);
    parts.push("");
  }
  parts.push(e.body.trim());
  if (e.includeQuoted && e.quotedBody) {
    parts.push("", "--- Earlier messages ---", e.quotedBody.trim());
  }
  if (s.includeOutcomeLine && e.outcome.trim()) {
    parts.push("", `Outcome: ${e.outcome.trim()}`);
  }
  return parts.join("\n").trim();
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

export function short(s: string, n = 90): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

export function statusLabel(st: LedgerEntry["status"]): string {
  return { draft: "Draft", filled: "Filled in PowerSchool", submitted: "Submitted – confirming", saved: "Saved in PowerSchool" }[st];
}

export function csvEscape(v: string | number | null): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(entries: LedgerEntry[]): string {
  const head = ["status", "student", "parent_name", "parent_email", "email_date", "subject", "outcome", "entry_text", "captured_at", "saved_at", "email_link"];
  const rows = entries.map((e) => [
    e.status, e.studentName, e.parentName, e.parentEmail, e.emailDateIso, e.subject, e.outcome,
    e.body + (e.includeQuoted && e.quotedBody ? "\n\n" + e.quotedBody : ""),
    new Date(e.createdAt).toISOString(), e.savedAt ? new Date(e.savedAt).toISOString() : "", e.messageUrl,
  ]);
  return [head, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
}
