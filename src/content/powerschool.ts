// ParentLog – PowerSchool adapter. Registered at runtime for the teacher's PowerSchool origin (all frames).
// 1. Detects the stock "Submit Log Entry" / "Log Entry" form (Date, Log Type, Title/Subject, Log Entry text, Submit).
// 2. Shows a small panel listing draft contacts; teacher picks one → fields are filled and verified → entry = Filled.
// 3. Watches the Submit button → entry = Submitted; the next page load on this origin without the form = Saved.
// 4. Unrecognised form → copy buttons instead of filling (never guesses).

import { FieldResult, FillReport, LedgerEntry, Settings } from "../shared/types";
import { buildEntryText, escapeHtml, formatDate, short } from "../shared/text";

type Field = "date" | "logType" | "subject" | "entry";

interface DetectedForm {
  kind: "stock" | "unknown";
  form: HTMLFormElement | null;
  date: HTMLInputElement | null;
  logType: HTMLSelectElement | null;
  subject: HTMLInputElement | null;
  entry: HTMLTextAreaElement | null;
  submit: HTMLElement | null;
}

const LABEL_RX: Record<Field, RegExp> = {
  date: /^(date|entry date|date\s*&\s*time|date and time|log date)\b/i,
  logType: /^(log type|type|category|log category)\b/i,
  subject: /^(title|subject|subject \(or title\)|log title)\b/i,
  entry: /^(log entry|log entry text|entry|entry text|comment|comments|notes|log text|description)\b/i,
};
const NAME_RX: Record<Field, RegExp> = {
  date: /entry_?date|logdate|\bdate\b/i,
  logType: /logtype|log_?type|typeid/i,
  subject: /subject|title/i,
  entry: /\]entry$|\bentry\b|logtext|comment|entry_?text/i,
};

function labelFor(el: Element): string {
  const id = (el as HTMLElement).id;
  if (id) {
    const l = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`);
    if (l?.textContent?.trim()) return l.textContent.trim();
  }
  const aria = el.getAttribute("aria-label");
  if (aria) return aria.trim();
  const parentLabel = el.closest("label");
  if (parentLabel?.textContent?.trim()) return parentLabel.textContent.trim();
  // PowerSchool's classic layout: <tr><td class="bold">Label</td><td><input></td></tr>
  const td = el.closest("td");
  const prev = td?.previousElementSibling;
  if (prev?.textContent?.trim()) return prev.textContent.trim();
  // Newer layout: <div class="form-row"><label>..</label><input>
  const row = el.closest("div, li");
  const l2 = row?.querySelector("label");
  if (l2?.textContent?.trim()) return l2.textContent.trim();
  return "";
}

function matches(el: Element, f: Field): boolean {
  const name = el.getAttribute("name") ?? "";
  const id = (el as HTMLElement).id ?? "";
  const lbl = labelFor(el);
  return LABEL_RX[f].test(lbl) || NAME_RX[f].test(name) || NAME_RX[f].test(id);
}

function visible(el: Element): boolean {
  const r = (el as HTMLElement).getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export function detectForm(root: ParentNode = document): DetectedForm {
  const textareas = Array.from(root.querySelectorAll<HTMLTextAreaElement>("textarea")).filter(visible);
  const entry = textareas.find((t) => matches(t, "entry")) ?? (textareas.length === 1 ? textareas[0] : null);
  const scope: ParentNode = entry?.closest("form") ?? root;
  const form = (entry?.closest("form") as HTMLFormElement | null) ?? null;

  const inputs = Array.from(scope.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type]), input[type="date"]')).filter(visible);
  const selects = Array.from(scope.querySelectorAll<HTMLSelectElement>("select")).filter(visible);

  const date = inputs.find((i) => matches(i, "date")) ?? null;
  const subject = inputs.find((i) => i !== date && matches(i, "subject")) ?? null;
  const logType = selects.find((s) => matches(s, "logType")) ?? null;

  const buttons = Array.from(
    scope.querySelectorAll<HTMLElement>('button, input[type="submit"], input[type="button"], a.button, [role="button"]'),
  ).filter(visible);
  const submit =
    buttons.find((b) => /^(submit|save|ok)$/i.test((b.textContent || (b as HTMLInputElement).value || "").trim())) ??
    buttons.find((b) => /submit|save/i.test((b.textContent || (b as HTMLInputElement).value || "").trim())) ??
    buttons.find((b) => (b as HTMLInputElement).type === "submit") ??
    null;

  const kind: "stock" | "unknown" = entry && date && (subject || logType) ? "stock" : "unknown";
  return { kind, form, date, logType, subject, entry, submit };
}

/** Student name from the PowerTeacher student header ("Smith, Jane   12345   2010-05-01") — best effort, never required. */
function studentOnPage(): string {
  const cands = [
    document.querySelector<HTMLElement>("#studentName, .studentName, .student-name, h1.student, .psStudentName"),
    document.querySelector<HTMLElement>('div[id*="student" i] h1, div[id*="student" i] h2, .student_header h1, #content-main h1'),
    document.querySelector<HTMLElement>("h1"),
  ].filter(Boolean) as HTMLElement[];
  for (const c of cands) {
    const t = (c.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!t) continue;
    if (/log entry|submit|select screens|powerschool|welcome/i.test(t)) continue;
    // "Last, First  ID  DOB" → take up to the first run of 2+ spaces or digits
    const name = t.split(/\s{2,}|\s\d/)[0].trim();
    if (name.length >= 3 && name.length <= 60) return name;
  }
  return "";
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}

function selectOption(sel: HTMLSelectElement, preferred: string): { ok: boolean; chosen: string; note: string } {
  const opts = Array.from(sel.options);
  const norm = (s: string) => s.trim().toLowerCase();
  const p = norm(preferred);
  let opt =
    opts.find((o) => norm(o.text) === p) ??
    opts.find((o) => norm(o.text).includes(p)) ??
    opts.find((o) => /teacher contact|parent contact|parent communication/i.test(o.text)) ??
    opts.find((o) => /teacher/i.test(o.text)) ??
    opts.find((o) => /contact|communication|email/i.test(o.text)) ??
    null;
  if (!opt) {
    return { ok: false, chosen: sel.selectedOptions[0]?.text ?? "", note: `No option matching "${preferred}" — left as "${sel.selectedOptions[0]?.text ?? ""}". Check it.` };
  }
  sel.value = opt.value;
  sel.dispatchEvent(new Event("input", { bubbles: true }));
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  const note = norm(opt.text) === p || norm(opt.text).includes(p) ? "" : `Chose "${opt.text}" (closest to "${preferred}")`;
  return { ok: sel.value === opt.value, chosen: opt.text, note };
}

async function fill(entry: LedgerEntry, settings: Settings, df: DetectedForm): Promise<FillReport> {
  const fields: FieldResult[] = [];
  const warnings: string[] = [];
  const want = {
    date: formatDate(entry.emailDateIso, settings.dateFormat),
    subject: entry.subject || `Parent contact – ${entry.parentName || entry.parentEmail}`,
    entry: buildEntryText(entry, settings),
  };

  if (df.date) {
    if (df.date.type === "date") setNativeValue(df.date, entry.emailDateIso);
    else setNativeValue(df.date, want.date);
    const expected = df.date.type === "date" ? entry.emailDateIso : want.date;
    fields.push({ field: "date", found: true, filled: true, verified: df.date.value === expected, valueSet: df.date.value, note: "" });
  } else {
    fields.push({ field: "date", found: false, filled: false, verified: false, valueSet: "", note: "No date field found" });
    warnings.push("Date field not found — enter it by hand.");
  }

  if (df.logType) {
    const r = selectOption(df.logType, settings.preferredLogType);
    fields.push({ field: "logType", found: true, filled: r.ok, verified: r.ok, valueSet: r.chosen, note: r.note });
    if (r.note) warnings.push(r.note);
  } else {
    fields.push({ field: "logType", found: false, filled: false, verified: false, valueSet: "", note: "No log-type dropdown on this form" });
  }

  if (df.subject) {
    const max = df.subject.maxLength > 0 ? df.subject.maxLength : 255;
    const v = want.subject.slice(0, max);
    setNativeValue(df.subject, v);
    fields.push({ field: "subject", found: true, filled: true, verified: df.subject.value === v, valueSet: df.subject.value, note: v.length < want.subject.length ? `Trimmed to ${max} characters` : "" });
  } else {
    fields.push({ field: "subject", found: false, filled: false, verified: false, valueSet: "", note: "No title/subject field on this form" });
  }

  if (df.entry) {
    const max = df.entry.maxLength > 0 ? df.entry.maxLength : 0;
    const v = max ? want.entry.slice(0, max) : want.entry;
    setNativeValue(df.entry, v);
    fields.push({ field: "entry", found: true, filled: true, verified: df.entry.value === v, valueSet: df.entry.value, note: max && v.length < want.entry.length ? `Trimmed to ${max} characters` : "" });
    if (max && v.length < want.entry.length) warnings.push(`Entry text trimmed to ${max} characters (form limit).`);
  } else {
    fields.push({ field: "entry", found: false, filled: false, verified: false, valueSet: "", note: "No entry text box found" });
    warnings.push("Entry text box not found.");
  }

  const ok = fields.filter((f) => f.found).every((f) => f.verified) && !!df.entry;
  return { formKind: df.kind, fields, ok, warnings };
}

// ---------------- UI ----------------

let panel: HTMLElement | null = null;
let activeEntryId: string | null = null;
let df: DetectedForm = detectForm();

async function getState(): Promise<{ entries: LedgerEntry[]; settings: Settings }> {
  const [a, b] = await Promise.all([
    chrome.runtime.sendMessage({ type: "GET_ENTRIES" }),
    chrome.runtime.sendMessage({ type: "GET_SETTINGS" }),
  ]);
  return { entries: a.entries ?? [], settings: b.settings };
}

function h(html: string): HTMLElement {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

async function render(): Promise<void> {
  df = detectForm();
  if (!df.entry) {
    panel?.remove();
    panel = null;
    return;
  }
  if (panel?.classList.contains("pl-collapsed")) return; // stay out of the way until the teacher reopens
  const { entries, settings } = await getState();
  if (panel?.classList.contains("pl-collapsed")) return; // collapsed while we were fetching
  const drafts = entries.filter((e) => e.status === "draft" || e.status === "filled");
  const student = studentOnPage();

  if (!panel) {
    panel = h(`<div class="pl-panel" role="region" aria-label="ParentLog"></div>`);
    (df.form ?? document.body).ownerDocument.body.appendChild(panel);
  }

  const kindLine =
    df.kind === "stock"
      ? `<span class="pl-ok">Log entry form recognised</span>`
      : `<span class="pl-warn">Form not recognised — copy buttons instead of auto-fill</span>`;

  const list = drafts.length
    ? drafts
        .map((e) => {
          const active = e.id === activeEntryId;
          const st = settings.parentStudentMap[e.parentEmail.toLowerCase()] || e.studentName;
          return `<li class="pl-item ${active ? "pl-active" : ""}" data-id="${e.id}">
            <div class="pl-item-top">
              <span class="pl-badge pl-badge-${e.status}">${e.status === "filled" ? "Filled" : "Draft"}</span>
              <span class="pl-date">${escapeHtml(formatDate(e.emailDateIso, settings.dateFormat))}</span>
            </div>
            <div class="pl-subj">${escapeHtml(e.subject || "(no subject)")}</div>
            <div class="pl-meta">${escapeHtml(e.parentName || e.parentEmail)}${st ? ` · <b>${escapeHtml(st)}</b>` : ""}</div>
            <div class="pl-snip">${escapeHtml(short(e.body, 110))}</div>
            <div class="pl-actions">
              ${df.kind === "stock" ? `<button class="pl-btn pl-fill" data-id="${e.id}">Fill this form</button>` : ""}
              <button class="pl-btn pl-ghost pl-copy" data-id="${e.id}" data-what="entry">Copy text</button>
              <button class="pl-btn pl-ghost pl-copy" data-id="${e.id}" data-what="subject">Copy subject</button>
              <button class="pl-btn pl-ghost pl-copy" data-id="${e.id}" data-what="date">Copy date</button>
            </div>
          </li>`;
        })
        .join("")
    : `<li class="pl-empty">No drafts yet. In Gmail or Outlook, open the parent email and click <b>Log this contact</b>.</li>`;

  panel.innerHTML = `
    <div class="pl-head">
      <span class="pl-logo"></span><b>ParentLog</b>
      <span class="pl-kind">${kindLine}</span>
      <button class="pl-x" title="Hide" aria-label="Hide ParentLog panel">×</button>
    </div>
    ${student ? `<div class="pl-student">Student on this page: <b>${escapeHtml(student)}</b></div>` : ""}
    <ul class="pl-list">${list}</ul>
    <div class="pl-foot" id="pl-status"></div>
  `;

  panel.querySelector(".pl-x")?.addEventListener("click", () => collapse("ParentLog", "ok"));

  panel.querySelectorAll<HTMLButtonElement>(".pl-fill").forEach((b) =>
    b.addEventListener("click", async () => {
      const e = drafts.find((x) => x.id === b.dataset.id);
      if (!e) return;
      await doFill(e, settings);
    }),
  );
  panel.querySelectorAll<HTMLButtonElement>(".pl-copy").forEach((b) =>
    b.addEventListener("click", async () => {
      const e = drafts.find((x) => x.id === b.dataset.id);
      if (!e) return;
      const what = b.dataset.what as "entry" | "subject" | "date";
      const v = what === "entry" ? buildEntryText(e, settings) : what === "subject" ? e.subject : formatDate(e.emailDateIso, settings.dateFormat);
      try {
        await navigator.clipboard.writeText(v);
        status(`Copied ${what}. Paste it into the form.`, "ok");
      } catch {
        // Clipboard can be blocked in frames — fall back to a selectable box
        status(`<textarea class="pl-copybox" readonly>${escapeHtml(v)}</textarea>Select and copy (Ctrl/Cmd+C).`, "warn");
      }
    }),
  );
}

function status(html: string, kind: "ok" | "warn" | "err"): void {
  const s = panel?.querySelector("#pl-status");
  if (!s) return;
  s.className = `pl-foot pl-${kind}`;
  s.innerHTML = html;
}

async function doFill(e: LedgerEntry, settings: Settings): Promise<void> {
  df = detectForm();
  if (df.kind !== "stock") return status("Form changed — not filling. Use the copy buttons.", "err");
  const report = await fill(e, settings, df);
  const student = studentOnPage();
  activeEntryId = e.id;
  const res = await chrome.runtime.sendMessage({ type: "MARK_FILLED", id: e.id, report, psUrl: location.href, psStudentOnPage: student });
  if (!res?.ok) return status("Filled, but couldn't update the ledger: " + (res?.error ?? "unknown"), "err");

  const lines = report.fields
    .filter((f) => f.found)
    .map((f) => `${f.verified ? "✓" : "✗"} ${({ date: "Date", logType: "Log type", subject: "Title", entry: "Entry text" })[f.field]}${f.note ? ` — ${escapeHtml(f.note)}` : ""}`);
  const w = report.warnings.length ? `<div class="pl-warnlist">${report.warnings.map(escapeHtml).join("<br>")}</div>` : "";
  status(
    `<b>${report.ok ? "Filled and verified." : "Filled with warnings."}</b> Check the form, then click PowerSchool's <b>Submit</b>.<br>${lines.join("<br>")}${w}`,
    report.ok ? "ok" : "warn",
  );
  armSubmit();
  // Get out of the way of PowerSchool's own Submit button: shrink to a status pill that can be reopened.
  collapse(
    `${report.ok ? "✓ Filled &amp; verified" : "⚠ Filled with warnings"} — now click PowerSchool's Submit`,
    report.ok ? "ok" : "warn",
    `<b>${report.ok ? "Filled and verified." : "Filled with warnings."}</b> Check the form, then click PowerSchool's <b>Submit</b>.<br>${lines.join("<br>")}${w}`,
  );
  df.entry?.scrollIntoView({ block: "center" });
}

function collapse(pillHtml: string, kind: "ok" | "warn", detailHtml?: string): void {
  if (!panel) return;
  panel.classList.add("pl-collapsed");
  panel.innerHTML = `<button class="pl-reopen pl-reopen-${kind}" title="Show ParentLog"><span class="pl-logo"></span> ${pillHtml}</button>`;
  panel.querySelector(".pl-reopen")?.addEventListener("click", async () => {
    panel!.classList.remove("pl-collapsed");
    await render();
    if (detailHtml) status(detailHtml, kind);
  });
}

let submitArmed = false;
function armSubmit(): void {
  if (submitArmed) return;
  submitArmed = true;
  const onSubmit = () => {
    if (!activeEntryId) return;
    const id = activeEntryId;
    sessionStorage.setItem("pl_pending", JSON.stringify({ id, at: Date.now(), origin: location.origin }));
    chrome.runtime.sendMessage({ type: "MARK_SUBMITTED", id }).catch(() => {});
  };
  df.submit?.addEventListener("click", onSubmit, { capture: true });
  df.form?.addEventListener("submit", onSubmit, { capture: true });
}

// After Submit, PowerSchool loads a new page (usually the student's log list / a confirmation). If we get here
// and there is no log-entry form and no error text, report success so the entry becomes "Saved".
function reportPageLoad(): void {
  const hasForm = !!detectForm().entry;
  const text = (document.body?.innerText ?? "").slice(0, 4000);
  const hasError = /error|not saved|could not|failed|required field|invalid/i.test(text) && !/no errors/i.test(text);
  let pendingHere = false;
  try {
    const p = JSON.parse(sessionStorage.getItem("pl_pending") ?? "null");
    pendingHere = !!p && Date.now() - p.at < 2 * 60 * 1000;
  } catch { /* ignore */ }
  const looksLikeSuccess = !hasForm && !hasError;
  if (looksLikeSuccess) sessionStorage.removeItem("pl_pending");
  chrome.runtime.sendMessage({ type: "PS_PAGE_LOADED", url: location.href, looksLikeSuccess, hasForm }).catch(() => {});
  if (pendingHere && looksLikeSuccess) toast("ParentLog: entry saved in PowerSchool ✓");
  if (pendingHere && hasError) toast("ParentLog: PowerSchool showed an error — entry NOT confirmed. Check the form.", true);
}

function toast(text: string, err = false): void {
  const t = h(`<div class="pl-toast ${err ? "pl-toast-err" : ""}">${escapeHtml(text)}</div>`);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 6000);
}

// ---- boot ---- (runs in every frame; only frames that contain the form show the panel)
reportPageLoad();
render();
chrome.storage.onChanged.addListener(() => render());
const obs = new MutationObserver(() => {
  clearTimeout((window as unknown as { __plT?: number }).__plT);
  (window as unknown as { __plT?: number }).__plT = window.setTimeout(() => {
    const now = detectForm();
    if (!!now.entry !== !!df.entry) render();
  }, 400);
});
obs.observe(document.documentElement, { childList: true, subtree: true });
