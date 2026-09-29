import { EntryStatus, LedgerEntry, MsgResponse, Settings } from "../shared/types";
import { buildEntryText, escapeHtml, formatDate, short, statusLabel, toCsv } from "../shared/text";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let entries: LedgerEntry[] = [];
let settings: Settings;
let tab: "draft" | "filled" | "saved" | "all" = "draft";
let editing: LedgerEntry | null = null;

async function send(msg: unknown): Promise<MsgResponse> {
  return chrome.runtime.sendMessage(msg);
}

async function load(): Promise<void> {
  const [a, b] = await Promise.all([send({ type: "GET_ENTRIES" }), send({ type: "GET_SETTINGS" })]);
  entries = a.entries ?? [];
  settings = b.settings!;
  renderList();
  if (!settings.onboarded) show("onboarding");
}

function toast(text: string, err = false): void {
  const t = $("toast");
  t.textContent = text;
  t.className = `toast ${err ? "err" : ""}`;
  setTimeout(() => t.classList.add("hidden"), 3500);
}

function show(sheet: "editor" | "settings" | "onboarding" | null): void {
  for (const id of ["editor", "settings", "onboarding"]) $(id).classList.toggle("hidden", id !== sheet);
}

// ---------- list ----------
function visibleFor(t: typeof tab): EntryStatus[] {
  return t === "draft" ? ["draft"] : t === "filled" ? ["filled", "submitted"] : t === "saved" ? ["saved"] : ["draft", "filled", "submitted", "saved"];
}

function renderList(): void {
  const q = ($("search") as HTMLInputElement).value.trim().toLowerCase();
  const counts = { draft: 0, filled: 0, saved: 0 };
  for (const e of entries) {
    if (e.status === "draft") counts.draft++;
    else if (e.status === "saved") counts.saved++;
    else counts.filled++;
  }
  $("c-draft").textContent = String(counts.draft);
  $("c-filled").textContent = String(counts.filled);
  $("c-saved").textContent = String(counts.saved);

  const list = entries
    .filter((e) => visibleFor(tab).includes(e.status))
    .filter((e) => !q || [e.studentName, e.parentName, e.parentEmail, e.subject, e.body, e.outcome].join(" ").toLowerCase().includes(q));

  const host = $("list");
  if (!list.length) {
    host.innerHTML =
      tab === "draft" && !q
        ? `<div class="empty"><b>No drafts.</b><br>Open a parent email in Gmail or Outlook and click <b>Log this contact</b>, or use <b>+ Capture open email</b> above.</div>`
        : `<div class="empty">Nothing here${q ? " for that search" : ""}.</div>`;
    return;
  }
  host.innerHTML = list
    .map(
      (e) => `<div class="card" data-id="${e.id}" role="button" tabindex="0">
        <div class="card-top"><span class="badge ${e.status}">${escapeHtml(statusLabel(e.status))}</span><span class="card-date">${escapeHtml(formatDate(e.emailDateIso, settings.dateFormat))}</span></div>
        <div class="card-title">${escapeHtml(e.subject || "(no subject)")}</div>
        <div class="card-meta">${e.studentName ? `<b>${escapeHtml(e.studentName)}</b> · ` : ""}${escapeHtml(e.parentName || e.parentEmail || "unknown parent")}</div>
        <div class="card-snip">${escapeHtml(short(e.outcome ? `Outcome: ${e.outcome}` : e.body, 100))}</div>
      </div>`,
    )
    .join("");
  host.querySelectorAll<HTMLElement>(".card").forEach((c) => {
    const open = () => openEditor(c.dataset.id!);
    c.addEventListener("click", open);
    c.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); open(); } });
  });
}

// ---------- editor ----------
function openEditor(id: string): void {
  const e = entries.find((x) => x.id === id);
  if (!e) return;
  editing = { ...e };
  ($("ed-status") as HTMLElement).textContent = statusLabel(e.status);
  $("ed-status").className = `badge ${e.status}`;
  ($("ed-student") as HTMLInputElement).value = e.studentName;
  ($("ed-parent") as HTMLInputElement).value = e.parentName ? `${e.parentName} <${e.parentEmail}>` : e.parentEmail;
  ($("ed-date") as HTMLInputElement).value = e.emailDateIso;
  ($("ed-subject") as HTMLInputElement).value = e.subject;
  ($("ed-body") as HTMLTextAreaElement).value = e.body;
  ($("ed-quoted") as HTMLInputElement).checked = e.includeQuoted;
  $("ed-quoted-len").textContent = String(e.quotedBody.length);
  $("ed-quoted-wrap").classList.toggle("hidden", !e.quotedBody);
  ($("ed-outcome") as HTMLInputElement).value = e.outcome;
  ($("ed-open-mail") as HTMLAnchorElement).href = e.messageUrl || "#";
  $("ed-open-mail").classList.toggle("hidden", !e.messageUrl);
  $("ed-mark-saved").classList.toggle("hidden", e.status === "saved");
  renderReport(e);
  updatePreview();
  show("editor");
}

function renderReport(e: LedgerEntry): void {
  const r = $("ed-report");
  if (!e.fillReport) { r.className = "report"; r.innerHTML = ""; return; }
  const rows = e.fillReport.fields.filter((f) => f.found).map((f) => `${f.verified ? "✓" : "✗"} ${({ date: "Date", logType: "Log type", subject: "Title", entry: "Entry text" })[f.field]}${f.note ? ` — ${escapeHtml(f.note)}` : ""}`);
  const when = e.savedAt ? `Saved ${new Date(e.savedAt).toLocaleString()}` : e.submittedAt ? `Submitted ${new Date(e.submittedAt).toLocaleString()} — waiting for PowerSchool to confirm` : e.filledAt ? `Filled ${new Date(e.filledAt).toLocaleString()} — not yet submitted` : "";
  r.className = `report ${e.status === "saved" ? "ok" : e.fillReport.ok ? "warn" : "err"}`;
  r.innerHTML = `<b>${escapeHtml(when)}</b>${e.psStudentOnPage ? `<br>Student on PowerSchool page: <b>${escapeHtml(e.psStudentOnPage)}</b>` : ""}<br>${rows.join("<br>")}${e.fillReport.warnings.length ? `<br>${e.fillReport.warnings.map(escapeHtml).join("<br>")}` : ""}`;
}

function readEditor(): LedgerEntry {
  const e = editing!;
  e.studentName = ($("ed-student") as HTMLInputElement).value.trim();
  const p = ($("ed-parent") as HTMLInputElement).value.trim();
  const m = /^(.*?)\s*<([^>]+)>$/.exec(p);
  if (m) { e.parentName = m[1].trim(); e.parentEmail = m[2].trim(); }
  else if (p.includes("@")) { e.parentEmail = p; e.parentName = ""; }
  else { e.parentName = p; }
  e.emailDateIso = ($("ed-date") as HTMLInputElement).value || e.emailDateIso;
  e.subject = ($("ed-subject") as HTMLInputElement).value.trim();
  e.body = ($("ed-body") as HTMLTextAreaElement).value;
  e.includeQuoted = ($("ed-quoted") as HTMLInputElement).checked;
  e.outcome = ($("ed-outcome") as HTMLInputElement).value.trim();
  return e;
}

function updatePreview(): void {
  if (!editing) return;
  $("ed-preview").textContent = buildEntryText(readEditor(), settings);
}

async function saveEditor(): Promise<void> {
  const e = readEditor();
  const r = await send({ type: "UPSERT_ENTRY", payload: e });
  if (!r.ok) return toast(r.error ?? "Save failed", true);
  toast("Saved");
  await load();
  openEditor(e.id);
}

// ---------- settings ----------
function renderSettings(): void {
  ($("st-logtype") as HTMLInputElement).value = settings.preferredLogType;
  ($("st-datefmt") as HTMLSelectElement).value = settings.dateFormat;
  ($("st-header") as HTMLInputElement).checked = settings.includeHeaderLine;
  ($("st-outcome") as HTMLInputElement).checked = settings.includeOutcomeLine;
  $("st-c-captured").textContent = String(settings.counters.captured);
  $("st-c-filled").textContent = String(settings.counters.filled);
  $("st-c-saved").textContent = String(settings.counters.saved);
  $("st-version").textContent = chrome.runtime.getManifest().version;
  $("st-ps-list").innerHTML = settings.powerschoolOrigins.length
    ? settings.powerschoolOrigins.map((o) => `<li>${escapeHtml(o)}<button class="btn" data-origin="${escapeHtml(o)}">Remove</button></li>`).join("")
    : `<li class="hint">No PowerSchool site allowed yet.</li>`;
  $("st-ps-list").querySelectorAll<HTMLButtonElement>("button[data-origin]").forEach((b) =>
    b.addEventListener("click", async () => {
      const r = await send({ type: "REMOVE_PS_ORIGIN", origin: b.dataset.origin });
      if (r.settings) settings = r.settings;
      renderSettings();
    }),
  );
}

function normaliseOrigin(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    if (!u.hostname.includes(".")) return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/** Ask Chrome for host permission (needs the user's click), then tell the background to register the content script. */
async function allowOrigin(raw: string, msgEl: HTMLElement): Promise<boolean> {
  const origin = normaliseOrigin(raw);
  if (!origin) { msgEl.className = "msg err"; msgEl.textContent = "Enter your PowerSchool address, e.g. https://ps.yourdistrict.org"; return false; }
  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  } catch (e) {
    msgEl.className = "msg err"; msgEl.textContent = `Chrome refused: ${e instanceof Error ? e.message : String(e)}`; return false;
  }
  if (!granted) { msgEl.className = "msg err"; msgEl.textContent = "Permission not granted. ParentLog can't see that site until you allow it."; return false; }
  const r = await send({ type: "REQUEST_PS_ORIGIN", origin });
  if (r.settings) settings = r.settings;
  msgEl.className = "msg ok"; msgEl.textContent = `Allowed ${origin}. Reload your PowerSchool tab if it's already open.`;
  return true;
}

async function patchSettings(patch: Partial<Settings>): Promise<void> {
  const r = await send({ type: "SAVE_SETTINGS", payload: patch });
  if (r.settings) settings = r.settings;
}

function download(name: string, content: string, type = "text/csv"): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- wire up ----------
document.addEventListener("DOMContentLoaded", () => {
  $("tabs").querySelectorAll<HTMLButtonElement>(".tab").forEach((b) =>
    b.addEventListener("click", () => {
      tab = b.dataset.tab as typeof tab;
      $("tabs").querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === b));
      renderList();
    }),
  );
  $("search").addEventListener("input", renderList);

  $("btn-capture").addEventListener("click", async () => {
    const b = $("btn-capture") as HTMLButtonElement;
    b.disabled = true;
    const r = await send({ type: "CAPTURE_ACTIVE_TAB" });
    b.disabled = false;
    if (!r.ok) return toast(r.error ?? "Couldn't capture", true);
    toast(r.error === "duplicate" ? "Already in your ledger" : "Captured as draft");
    await load();
    if (r.entry) openEditor(r.entry.id);
  });

  $("btn-settings").addEventListener("click", () => { renderSettings(); show("settings"); });
  $("st-back").addEventListener("click", () => show(null));
  $("ed-back").addEventListener("click", () => { editing = null; show(null); });

  ["ed-student", "ed-parent", "ed-date", "ed-subject", "ed-body", "ed-quoted", "ed-outcome"].forEach((id) =>
    $(id).addEventListener("input", updatePreview),
  );
  $("ed-save").addEventListener("click", saveEditor);
  $("ed-copy").addEventListener("click", async () => {
    await navigator.clipboard.writeText(buildEntryText(readEditor(), settings));
    toast("Entry text copied");
  });
  $("ed-mark-saved").addEventListener("click", async () => {
    if (!editing) return;
    await saveEditor();
    const r = await send({ type: "MARK_SAVED", id: editing.id });
    if (!r.ok) return toast(r.error ?? "Failed", true);
    toast("Marked as saved");
    await load();
    openEditor(editing.id);
  });
  $("ed-delete").addEventListener("click", async () => {
    if (!editing) return;
    if (!confirm("Delete this contact from your ledger? This does not touch PowerSchool.")) return;
    await send({ type: "DELETE_ENTRY", id: editing.id });
    editing = null;
    show(null);
    toast("Deleted");
    await load();
  });

  $("st-ps-add").addEventListener("click", async () => {
    const ok = await allowOrigin(($("st-ps-url") as HTMLInputElement).value, $("st-ps-msg"));
    if (ok) { ($("st-ps-url") as HTMLInputElement).value = ""; renderSettings(); }
  });
  $("st-logtype").addEventListener("change", () => patchSettings({ preferredLogType: ($("st-logtype") as HTMLInputElement).value.trim() || "Teacher" }));
  $("st-datefmt").addEventListener("change", () => patchSettings({ dateFormat: ($("st-datefmt") as HTMLSelectElement).value as Settings["dateFormat"] }));
  $("st-header").addEventListener("change", () => patchSettings({ includeHeaderLine: ($("st-header") as HTMLInputElement).checked }));
  $("st-outcome").addEventListener("change", () => patchSettings({ includeOutcomeLine: ($("st-outcome") as HTMLInputElement).checked }));
  $("st-export").addEventListener("click", () => download(`parentlog-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(entries)));
  $("st-clear").addEventListener("click", async () => {
    if (!confirm(`Delete all ${entries.length} entries from your ledger? This cannot be undone and does not touch PowerSchool.`)) return;
    await send({ type: "CLEAR_ALL" });
    toast("Ledger cleared");
    await load();
    renderSettings();
  });

  $("ob-ps-add").addEventListener("click", () => allowOrigin(($("ob-ps-url") as HTMLInputElement).value, $("ob-ps-msg")));
  $("ob-done").addEventListener("click", async () => { await patchSettings({ onboarded: true }); show(null); });

  chrome.storage.onChanged.addListener(async () => {
    const wasEditing = editing?.id;
    await load();
    if (wasEditing && !$("editor").classList.contains("hidden")) {
      const fresh = entries.find((e) => e.id === wasEditing);
      if (fresh && fresh.status !== editing?.status) openEditor(fresh.id);
    }
  });

  load();
});
