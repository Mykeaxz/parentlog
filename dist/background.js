"use strict";
(() => {
  // src/shared/types.ts
  var DEFAULT_SETTINGS = {
    onboarded: false,
    powerschoolOrigins: [],
    preferredLogType: "Teacher",
    dateFormat: "MM/DD/YYYY",
    includeHeaderLine: true,
    includeOutcomeLine: true,
    parentStudentMap: {},
    counters: { captured: 0, filled: 0, saved: 0 }
  };

  // src/shared/storage.ts
  var ENTRIES_KEY = "pl_entries";
  var SETTINGS_KEY = "pl_settings";
  async function getEntries() {
    const r = await chrome.storage.local.get(ENTRIES_KEY);
    const list = r[ENTRIES_KEY] ?? [];
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async function saveEntries(entries) {
    await chrome.storage.local.set({ [ENTRIES_KEY]: entries });
  }
  async function upsertEntry(entry) {
    const entries = await getEntries();
    const i = entries.findIndex((e) => e.id === entry.id);
    entry.updatedAt = Date.now();
    if (i >= 0) entries[i] = entry;
    else entries.unshift(entry);
    await saveEntries(entries);
    return entry;
  }
  async function getEntry(id) {
    return (await getEntries()).find((e) => e.id === id);
  }
  async function deleteEntry(id) {
    const entries = await getEntries();
    await saveEntries(entries.filter((e) => e.id !== id));
  }
  async function clearAll() {
    await chrome.storage.local.remove(ENTRIES_KEY);
  }
  async function getSettings() {
    const r = await chrome.storage.local.get(SETTINGS_KEY);
    const s = r[SETTINGS_KEY] ?? {};
    return { ...DEFAULT_SETTINGS, ...s, counters: { ...DEFAULT_SETTINGS.counters, ...s.counters ?? {} } };
  }
  async function saveSettings(patch) {
    const cur = await getSettings();
    const next = { ...cur, ...patch };
    await chrome.storage.local.set({ [SETTINGS_KEY]: next });
    return next;
  }
  function newId() {
    return `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  // src/background.ts
  var MAIL_ORIGINS = /* @__PURE__ */ new Set([
    "https://mail.google.com",
    "https://outlook.office.com",
    "https://outlook.office365.com",
    "https://outlook.live.com"
  ]);
  var PS_SCRIPT_ID = "parentlog-powerschool";
  chrome.runtime.onInstalled.addListener(async () => {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
    });
    await registerPowerSchoolScripts();
  });
  chrome.runtime.onStartup.addListener(() => {
    registerPowerSchoolScripts();
  });
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
  });
  async function registerPowerSchoolScripts() {
    const settings = await getSettings();
    const granted = await chrome.permissions.getAll();
    const origins = /* @__PURE__ */ new Set();
    for (const o of granted.origins ?? []) {
      const m = /^(https?:\/\/[^/]+)\/\*$/.exec(o);
      if (!m) continue;
      if (MAIL_ORIGINS.has(m[1])) continue;
      if (m[1].includes("*")) continue;
      origins.add(m[1]);
    }
    for (const o of settings.powerschoolOrigins) origins.add(o);
    const matches = [];
    for (const o of origins) {
      try {
        if (await chrome.permissions.contains({ origins: [`${o}/*`] })) matches.push(`${o}/*`);
      } catch {
      }
    }
    try {
      await chrome.scripting.unregisterContentScripts({ ids: [PS_SCRIPT_ID] });
    } catch {
    }
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
          persistAcrossSessions: true
        }
      ]);
    } catch (e) {
      console.warn("[ParentLog] registerContentScripts failed", e);
    }
  }
  async function entryFromCapture(c) {
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
      fillReport: null
    };
  }
  async function openPanelForTab(tabId, windowId) {
    try {
      if (tabId != null) await chrome.sidePanel.open({ tabId });
      else if (windowId != null) await chrome.sidePanel.open({ windowId });
    } catch (e) {
      console.warn("[ParentLog] sidePanel.open failed", e);
    }
  }
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    handle(msg, sender).then(sendResponse).catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    return true;
  });
  async function handle(msg, sender) {
    switch (msg.type) {
      case "PING":
        return { ok: true };
      case "CAPTURE_EMAIL": {
        const entry = await entryFromCapture(msg.payload);
        const dup = (await getEntries()).find(
          (e) => e.parentEmail === entry.parentEmail && e.subject === entry.subject && e.emailDateIso === entry.emailDateIso && e.body === entry.body
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
        const s = await getSettings();
        const origins = Array.from(/* @__PURE__ */ new Set([...s.powerschoolOrigins, msg.origin]));
        await saveSettings({ powerschoolOrigins: origins });
        await registerPowerSchoolScripts();
        return { ok: true, settings: await getSettings() };
      }
      case "REMOVE_PS_ORIGIN": {
        const s = await getSettings();
        await saveSettings({ powerschoolOrigins: s.powerschoolOrigins.filter((o) => o !== msg.origin) });
        try {
          await chrome.permissions.remove({ origins: [`${msg.origin}/*`] });
        } catch {
        }
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
        if (!msg.looksLikeSuccess) return { ok: true };
        const entries = await getEntries();
        const cutoff = Date.now() - 2 * 60 * 1e3;
        const pending = entries.filter((e) => e.status === "submitted" && (e.submittedAt ?? 0) > cutoff);
        for (const e of pending) await markSaved(e);
        return { ok: true };
      }
    }
    return { ok: false, error: "Unknown message" };
  }
  async function markSaved(e) {
    e.status = "saved";
    e.savedAt = Date.now();
    await upsertEntry(e);
    const s = await getSettings();
    await saveSettings({ counters: { ...s.counters, saved: s.counters.saved + 1 } });
  }
})();
