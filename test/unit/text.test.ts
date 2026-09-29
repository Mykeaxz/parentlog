import assert from "node:assert/strict";
import { formatDate, toIsoDate, splitQuoted, buildEntryText, toCsv, normaliseWhitespace } from "../../src/shared/text";
import { DEFAULT_SETTINGS, LedgerEntry } from "../../src/shared/types";

let n = 0; const t = (name: string, fn: () => void) => { fn(); n++; console.log("  ✓", name); };

t("formatDate all formats", () => {
  assert.equal(formatDate("2026-09-05", "MM/DD/YYYY"), "09/05/2026");
  assert.equal(formatDate("2026-09-05", "DD/MM/YYYY"), "05/09/2026");
  assert.equal(formatDate("2026-09-05", "YYYY-MM-DD"), "2026-09-05");
});
t("toIsoDate parses mail-client strings", () => {
  assert.equal(toIsoDate("Tue, Sep 29, 2026, 8:14 AM"), "2026-09-29");
  assert.equal(toIsoDate("Tue 9/29/2026 7:45 AM"), "2026-09-29");
  assert.equal(toIsoDate("Mon, Sep 28, 2026 at 6:02 PM"), "2026-09-28");
  assert.equal(toIsoDate("2026-01-03T10:00:00Z").slice(0, 7), "2026-01");
  assert.equal(toIsoDate("Sep 29"), `${new Date().getFullYear()}-09-29`);
  assert.equal(toIsoDate("29.09.2026, 18:02"), "2026-09-29");
  assert.equal(toIsoDate("29 Sept 2026 18:02"), "2026-09-29");
  assert.equal(toIsoDate("Wed, Oct 1, 2026, 7:00 AM"), "2026-10-01");
  assert.equal(toIsoDate("Di., 13. Okt. 2026, 18:02"), "2026-10-13");
  assert.equal(toIsoDate("Tuesday, October 13, 2026 6:02 PM"), "2026-10-13");
  assert.equal(toIsoDate("13/10/2026 18:02"), "2026-10-13");
  assert.match(toIsoDate("garbage"), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(toIsoDate(""), /^\d{4}-\d{2}-\d{2}$/);
});
t("splitQuoted: Gmail 'On … wrote:'", () => {
  const r = splitQuoted("Hi\n\nThanks.\n\nOn Mon, Sep 28, 2026 at 3:10 PM X <x@y.org> wrote:\n> old");
  assert.equal(r.body, "Hi\n\nThanks."); assert.ok(r.quoted.startsWith("On Mon"));
});
t("splitQuoted: Outlook 'From:' header and Original Message", () => {
  assert.equal(splitQuoted("New text\nFrom: A <a@b.c>\nSent: yesterday\nold").body, "New text");
  assert.equal(splitQuoted("New\n-----Original Message-----\nold").body, "New");
});
t("splitQuoted: German + '>' quotes + no quote", () => {
  assert.equal(splitQuoted("Neu\nAm 28.09.2026 um 18:02 schrieb Carol:\nalt").body, "Neu");
  assert.equal(splitQuoted("a\n> b").body, "a");
  assert.equal(splitQuoted("only body").quoted, "");
});
t("first line 'From:' is not treated as quote", () => {
  assert.equal(splitQuoted("From: me\nbody").body, "From: me\nbody");
});
const e: LedgerEntry = { id: "1", status: "draft", createdAt: 0, updatedAt: 0, source: "gmail", direction: "sent", parentEmail: "p@x.org", parentName: "Pat", teacherEmail: "t@s.org", emailDateIso: "2026-09-29", emailDateRaw: "", subject: "Sub, with \"quotes\"", body: "Body", quotedBody: "Old", includeQuoted: false, messageUrl: "", studentName: "S", outcome: "", psUrl: "", psStudentOnPage: "", filledAt: null, submittedAt: null, savedAt: null, fillReport: null };
t("buildEntryText: header, outcome, quoted toggles", () => {
  const s = { ...DEFAULT_SETTINGS };
  assert.equal(buildEntryText(e, s), 'Email sent to Pat <p@x.org> on 09/29/2026 — Subject: Sub, with "quotes"\n\nBody');
  assert.equal(buildEntryText({ ...e, outcome: "Replied" }, s).endsWith("\n\nOutcome: Replied"), true);
  assert.ok(buildEntryText({ ...e, includeQuoted: true }, s).includes("--- Earlier messages ---\nOld"));
  assert.equal(buildEntryText({ ...e, direction: "received" }, { ...s, dateFormat: "DD/MM/YYYY" }).startsWith("Email received from Pat <p@x.org> on 29/09/2026"), true);
  assert.equal(buildEntryText(e, { ...s, includeHeaderLine: false }), "Body");
});
t("csv escapes quotes/commas/newlines", () => {
  const csv = toCsv([{ ...e, body: "line1\nline2" }]);
  assert.ok(csv.includes('"Sub, with ""quotes"""')); assert.ok(csv.includes('"line1\nline2"'));
});
t("normaliseWhitespace", () => { assert.equal(normaliseWhitespace("a   b\n\n\n\nc  \n d"), "a b\n\nc\nd"); });
console.log(`${n} unit tests passed`);
