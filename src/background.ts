import { CapturedEmail, LedgerEntry, Msg, MsgResponse } from "./shared/types";
import { clearAll, deleteEntry, getEntries, getEntry, getSettings, newId, saveSettings, upsertEntry } from "./shared/storage";

const MAIL_ORIGINS = new Set([
  "https://mail.google.com",
  "https://outlook.office.com",
  "https://outlook.office365.com",
  "https://outlook.live.com",
]);

const PS_SCRIPT_ID = "parentlog-powerschool";

// Clicking the toolbar icon opens the side panel.
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  await registerPowerSchoolScripts();
});
chrome.runtime.onStartup.addListener(() => {
  registerPowerSchoolScripts();
});
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

/** (Re)register the PowerSchool content script for every granted non-mail origin. */
async function registerPowerSchoolScripts(): Promise<void> {
  const settings = await getSettings();
  const granted = await chrome.permissions.getAll();
  const origins = new Set<string>();
  for (const o of granted.origins ?? []) {
    const m = /^(https?:\/\/[^/]+)\/\*$/.exec(o);
    if (!m) continue;
    if (MAIL_ORIGINS.has(m[1])) continue;
    if (m[1].includes("*")) continue; // ignore wildcard grants
    origins.add(m[1]);
  }
  for (const o of settings.powerschoolOrigins) origins.add(o);
  // Only register for origins Chrome actually lets us touch (a teacher may have revoked one in chrome://extensions).
  const matches: string[] = [];
  for (const o of origins) {
    try {
      if (await chrome.permissions.contains({ origins: [`${o}/*`] })) matches.push(`${o}/*`);
    } catch { /* skip */ }
  }

  try {
    await chrome.scripting.unregisterContentScripts({ ids: [PS_SCRIPT_ID] });
  } catch { /* not registered yet */ }
  if (matches.length === 0) return;
  try {
    await chrome.scripting.registerContentScripts([
      {
        id: PS_SCRIPT_ID,
        matches,
        js: ["content/powerschool.js"],
        css: ["content/powerschool.css"],
        allFrames: true,
        runAt: "document_idle",
        persistAcrossSessions: true,
      },
    ]);
  } catch (e) {
    console.warn("[ParentLog] registerContentScripts failed", e);
  }
}

async function entryFromCapture(c: CapturedEmail): Promise<LedgerEntry> {
  const settings = await getSettings();
  const now = Date.now();
  const studentGuess = settings.parentStudentMap[c.parentEmail.toLowerCase()] ?? "";
  return {
    id: newId(),
    status: "draft",
    createdAt: now,
    updatedAt: now,
    source: c.source,
    direction: c.direction,
    parentEmail: c.parentEmail,
    parentName: c.parentName,
    teacherEmail: c.teacherEmail,
    emailDateIso: c.emailDateIso,
    emailDateRaw: c.emailDateRaw,
    subject: c.subject,
    body: c.body,
    quotedBody: c.quotedBody,
    includeQuoted: false,
    messageUrl: c.messageUrl,
    studentName: studentGuess,
    outcome: "",
    psUrl: "",
    psStudentOnPage: "",
    filledAt: null,
    submittedAt: null,
    savedAt: null,
    fillReport: null,
  };
}

async function openPanelForTab(tabId: number | undefined, windowId: number | undefined): Promise<void> {
  try {
    if (tabId != null) await chrome.sidePanel.open({ tabId });
    else if (windowId != null) await chrome.sidePanel.open({ windowId });
  } catch (e) {
    console.warn("[ParentLog] sidePanel.open failed", e);
  }
}

chrome.runtime.onMessage.addListener((msg: Msg, sender, sendResponse: (r: MsgResponse) => void) => {
  handle(msg, sender)
    .then(sendResponse)
    .catch((e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  return true; // async
});

async function handle(msg: Msg, sender: chrome.runtime.MessageSender): Promise<MsgResponse> {
  switch (msg.type) {
    case "PING":
      return { ok: true };

    case "CAPTURE_EMAIL": {
      const entry = await entryFromCapture(msg.payload);
      // Duplicate guard: same parent + subject + date already captured → return existing instead of a second draft.
      const dup = (await getEntries()).find(
        (e) => e.parentEmail === entry.parentEmail && e.subject === entry.subject && e.emailDateIso === entry.emailDateIso && e.body === entry.body,
      );
      if (dup) {
        await openPanelForTab(sender.tab?.id, sender.tab?.windowId);
        return { ok: true, entry: dup, error: "duplicate" };
      }
      await upsertEntry(entry);
      const s = await getSettings();
      await saveSettings({ counters: { ...s.counters, captured: s.counters.captured + 1 } });
      await openPanelForTab(sender.tab?.id, sender.tab?.windowId);
      return { ok: true, entry };
    }

    case "CAPTURE_ACTIVE_TAB": {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab?.id) return { ok: false, error: "No active tab." };
      try {
        const res = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_NOW" });
        if (res?.ok && res.captured) {
          return handle({ type: "CAPTURE_EMAIL", payload: res.captured }, { tab });
        }
        return { ok: false, error: res?.error ?? "No open email found on this tab. Open a single message first." };
      } catch {
        return { ok: false, error: "This tab is not Gmail or Outlook web. Open the email there, then try again." };
      }
    }

    case "OPEN_PANEL":
      await openPanelForTab(sender.tab?.id, sender.tab?.windowId);
      return { ok: true };

    case "GET_ENTRIES":
      return { ok: true, entries: await getEntries() };

    case "GET_SETTINGS":
      return { ok: true, settings: await getSettings() };

    case "SAVE_SETTINGS": {
      const settings = await saveSettings(msg.payload);
      if (msg.payload.powerschoolOrigins) await registerPowerSchoolScripts();
      return { ok: true, settings };
    }

    case "UPSERT_ENTRY":
      return { ok: true, entry: await upsertEntry(msg.payload) };

    case "DELETE_ENTRY":
      await deleteEntry(msg.id);
      return { ok: true };

    case "CLEAR_ALL":
      await clearAll();
      return { ok: true };

    case "REQUEST_PS_ORIGIN": {
      // Permission itself must be requested from the panel (needs a user gesture). Here we just record + register.
      const s = await getSettings();
      const origins = Array.from(new Set([...s.powerschoolOrigins, msg.origin]));
      await saveSettings({ powerschoolOrigins: origins });
      await registerPowerSchoolScripts();
      return { ok: true, settings: await getSettings() };
    }

    case "REMOVE_PS_ORIGIN": {
      const s = await getSettings();
      await saveSettings({ powerschoolOrigins: s.powerschoolOrigins.filter((o) => o !== msg.origin) });
      try { await chrome.permissions.remove({ origins: [`${msg.origin}/*`] }); } catch { /* ignore */ }
      await registerPowerSchoolScripts();
      return { ok: true, settings: await getSettings() };
    }

    case "MARK_FILLED": {
      const e = await getEntry(msg.id);
      if (!e) return { ok: false, error: "Entry not found" };
      e.status = "filled";
      e.filledAt = Date.now();
      e.fillReport = msg.report;
      e.psUrl = msg.psUrl;
      e.psStudentOnPage = msg.psStudentOnPage;
      if (!e.studentName && msg.psStudentOnPage) e.studentName = msg.psStudentOnPage;
      await upsertEntry(e);
      const s = await getSettings();
      const map = { ...s.parentStudentMap };
      if (e.parentEmail && e.studentName) map[e.parentEmail.toLowerCase()] = e.studentName;
      await saveSettings({ parentStudentMap: map, counters: { ...s.counters, filled: s.counters.filled + 1 } });
      return { ok: true, entry: e };
    }

    case "MARK_SUBMITTED": {
      const e = await getEntry(msg.id);
      if (!e) return { ok: false, error: "Entry not found" };
      e.status = "submitted";
      e.submittedAt = Date.now();
      await upsertEntry(e);
      return { ok: true, entry: e };
    }

    case "MARK_SAVED": {
      const e = await getEntry(msg.id);
      if (!e) return { ok: false, error: "Entry not found" };
      await markSaved(e);
      return { ok: true, entry: e };
    }

    case "PS_PAGE_LOADED": {
      // A PowerSchool page finished loading. If an entry was submitted in the last 2 minutes and this page
      // is not the form (form gone, no error), that entry is confirmed saved.
      if (!msg.looksLikeSuccess) return { ok: true };
      const entries = await getEntries();
      const cutoff = Date.now() - 2 * 60 * 1000;
      const pending = entries.filter((e) => e.status === "submitted" && (e.submittedAt ?? 0) > cutoff);
      for (const e of pending) await markSaved(e);
      return { ok: true };
    }
  }
  return { ok: false, error: "Unknown message" };
}

async function markSaved(e: LedgerEntry): Promise<void> {
  e.status = "saved";
  e.savedAt = Date.now();
  await upsertEntry(e);
  const s = await getSettings();
  await saveSettings({ counters: { ...s.counters, saved: s.counters.saved + 1 } });
}
