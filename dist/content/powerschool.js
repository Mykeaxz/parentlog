"use strict";
(() => {
  // src/shared/text.ts
  function formatDate(iso, fmt) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return iso;
    const [, y, mo, d] = m;
    switch (fmt) {
      case "DD/MM/YYYY":
        return `${d}/${mo}/${y}`;
      case "YYYY-MM-DD":
        return `${y}-${mo}-${d}`;
      default:
        return `${mo}/${d}/${y}`;
    }
  }
  function buildEntryText(e, s) {
    const parts = [];
    if (s.includeHeaderLine) {
      const who = e.parentName ? `${e.parentName} <${e.parentEmail}>` : e.parentEmail || "parent";
      const verb = e.direction === "received" ? "Email received from" : "Email sent to";
      parts.push(`${verb} ${who} on ${formatDate(e.emailDateIso, s.dateFormat)}${e.subject ? ` \u2014 Subject: ${e.subject}` : ""}`);
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
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }
  function short(s, n = 90) {
    const t = s.replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n - 1) + "\u2026" : t;
  }

  // src/content/powerschool.ts
  var LABEL_RX = {
    date: /^(date|entry date|date\s*&\s*time|date and time|log date)\b/i,
    logType: /^(log type|type|category|log category)\b/i,
    subject: /^(title|subject|subject \(or title\)|log title)\b/i,
    entry: /^(log entry|log entry text|entry|entry text|comment|comments|notes|log text|description)\b/i
  };
  var NAME_RX = {
    date: /entry_?date|logdate|\bdate\b/i,
    logType: /logtype|log_?type|typeid/i,
    subject: /subject|title/i,
    entry: /\]entry$|\bentry\b|logtext|comment|entry_?text/i
  };
  function labelFor(el) {
    const id = el.id;
    if (id) {
      const l = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (l?.textContent?.trim()) return l.textContent.trim();
    }
    const aria = el.getAttribute("aria-label");
    if (aria) return aria.trim();
    const parentLabel = el.closest("label");
    if (parentLabel?.textContent?.trim()) return parentLabel.textContent.trim();
    const td = el.closest("td");
    const prev = td?.previousElementSibling;
    if (prev?.textContent?.trim()) return prev.textContent.trim();
    const row = el.closest("div, li");
    const l2 = row?.querySelector("label");
    if (l2?.textContent?.trim()) return l2.textContent.trim();
    return "";
  }
  function matches(el, f) {
    const name = el.getAttribute("name") ?? "";
    const id = el.id ?? "";
    const lbl = labelFor(el);
    return LABEL_RX[f].test(lbl) || NAME_RX[f].test(name) || NAME_RX[f].test(id);
  }
  function visible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function detectForm(root = document) {
    const textareas = Array.from(root.querySelectorAll("textarea")).filter(visible);
    const entry = textareas.find((t) => matches(t, "entry")) ?? (textareas.length === 1 ? textareas[0] : null);
    const scope = entry?.closest("form") ?? root;
    const form = entry?.closest("form") ?? null;
    const inputs = Array.from(scope.querySelectorAll('input[type="text"], input:not([type]), input[type="date"]')).filter(visible);
    const selects = Array.from(scope.querySelectorAll("select")).filter(visible);
    const date = inputs.find((i) => matches(i, "date")) ?? null;
    const subject = inputs.find((i) => i !== date && matches(i, "subject")) ?? null;
    const logType = selects.find((s) => matches(s, "logType")) ?? null;
    const buttons = Array.from(
      scope.querySelectorAll('button, input[type="submit"], input[type="button"], a.button, [role="button"]')
    ).filter(visible);
    const submit = buttons.find((b) => /^(submit|save|ok)$/i.test((b.textContent || b.value || "").trim())) ?? buttons.find((b) => /submit|save/i.test((b.textContent || b.value || "").trim())) ?? buttons.find((b) => b.type === "submit") ?? null;
    const kind = entry && date && (subject || logType) ? "stock" : "unknown";
    return { kind, form, date, logType, subject, entry, submit };
  }
  function studentOnPage() {
    const cands = [
      document.querySelector("#studentName, .studentName, .student-name, h1.student, .psStudentName"),
      document.querySelector('div[id*="student" i] h1, div[id*="student" i] h2, .student_header h1, #content-main h1'),
      document.querySelector("h1")
    ].filter(Boolean);
    for (const c of cands) {
      const t = (c.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!t) continue;
      if (/log entry|submit|select screens|powerschool|welcome/i.test(t)) continue;
      const name = t.split(/\s{2,}|\s\d/)[0].trim();
      if (name.length >= 3 && name.length <= 60) return name;
    }
    return "";
  }
  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }
  function selectOption(sel, preferred) {
    const opts = Array.from(sel.options);
    const norm = (s) => s.trim().toLowerCase();
    const p = norm(preferred);
    let opt = opts.find((o) => norm(o.text) === p) ?? opts.find((o) => norm(o.text).includes(p)) ?? opts.find((o) => /teacher contact|parent contact|parent communication/i.test(o.text)) ?? opts.find((o) => /teacher/i.test(o.text)) ?? opts.find((o) => /contact|communication|email/i.test(o.text)) ?? null;
    if (!opt) {
      return { ok: false, chosen: sel.selectedOptions[0]?.text ?? "", note: `No option matching "${preferred}" \u2014 left as "${sel.selectedOptions[0]?.text ?? ""}". Check it.` };
    }
    sel.value = opt.value;
    sel.dispatchEvent(new Event("input", { bubbles: true }));
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    const note = norm(opt.text) === p || norm(opt.text).includes(p) ? "" : `Chose "${opt.text}" (closest to "${preferred}")`;
    return { ok: sel.value === opt.value, chosen: opt.text, note };
  }
  async function fill(entry, settings, df2) {
    const fields = [];
    const warnings = [];
    const want = {
      date: formatDate(entry.emailDateIso, settings.dateFormat),
      subject: entry.subject || `Parent contact \u2013 ${entry.parentName || entry.parentEmail}`,
      entry: buildEntryText(entry, settings)
    };
    if (df2.date) {
      if (df2.date.type === "date") setNativeValue(df2.date, entry.emailDateIso);
      else setNativeValue(df2.date, want.date);
      const expected = df2.date.type === "date" ? entry.emailDateIso : want.date;
      fields.push({ field: "date", found: true, filled: true, verified: df2.date.value === expected, valueSet: df2.date.value, note: "" });
    } else {
      fields.push({ field: "date", found: false, filled: false, verified: false, valueSet: "", note: "No date field found" });
      warnings.push("Date field not found \u2014 enter it by hand.");
    }
    if (df2.logType) {
      const r = selectOption(df2.logType, settings.preferredLogType);
      fields.push({ field: "logType", found: true, filled: r.ok, verified: r.ok, valueSet: r.chosen, note: r.note });
      if (r.note) warnings.push(r.note);
    } else {
      fields.push({ field: "logType", found: false, filled: false, verified: false, valueSet: "", note: "No log-type dropdown on this form" });
    }
    if (df2.subject) {
      const max = df2.subject.maxLength > 0 ? df2.subject.maxLength : 255;
      const v = want.subject.slice(0, max);
      setNativeValue(df2.subject, v);
      fields.push({ field: "subject", found: true, filled: true, verified: df2.subject.value === v, valueSet: df2.subject.value, note: v.length < want.subject.length ? `Trimmed to ${max} characters` : "" });
    } else {
      fields.push({ field: "subject", found: false, filled: false, verified: false, valueSet: "", note: "No title/subject field on this form" });
    }
    if (df2.entry) {
      const max = df2.entry.maxLength > 0 ? df2.entry.maxLength : 0;
      const v = max ? want.entry.slice(0, max) : want.entry;
      setNativeValue(df2.entry, v);
      fields.push({ field: "entry", found: true, filled: true, verified: df2.entry.value === v, valueSet: df2.entry.value, note: max && v.length < want.entry.length ? `Trimmed to ${max} characters` : "" });
      if (max && v.length < want.entry.length) warnings.push(`Entry text trimmed to ${max} characters (form limit).`);
    } else {
      fields.push({ field: "entry", found: false, filled: false, verified: false, valueSet: "", note: "No entry text box found" });
      warnings.push("Entry text box not found.");
    }
    const ok = fields.filter((f) => f.found).every((f) => f.verified) && !!df2.entry;
    return { formKind: df2.kind, fields, ok, warnings };
  }
  var panel = null;
  var activeEntryId = null;
  var df = detectForm();
  async function getState() {
    const [a, b] = await Promise.all([
      chrome.runtime.sendMessage({ type: "GET_ENTRIES" }),
      chrome.runtime.sendMessage({ type: "GET_SETTINGS" })
    ]);
    return { entries: a.entries ?? [], settings: b.settings };
  }
  function h(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  async function render() {
    df = detectForm();
    if (!df.entry) {
      panel?.remove();
      panel = null;
      return;
    }
    if (panel?.classList.contains("pl-collapsed")) return;
    const { entries, settings } = await getState();
    if (panel?.classList.contains("pl-collapsed")) return;
    const drafts = entries.filter((e) => e.status === "draft" || e.status === "filled");
    const student = studentOnPage();
    if (!panel) {
      panel = h(`<div class="pl-panel" role="region" aria-label="ParentLog"></div>`);
      (df.form ?? document.body).ownerDocument.body.appendChild(panel);
    }
    const kindLine = df.kind === "stock" ? `<span class="pl-ok">Log entry form recognised</span>` : `<span class="pl-warn">Form not recognised \u2014 copy buttons instead of auto-fill</span>`;
    const list = drafts.length ? drafts.map((e) => {
      const active = e.id === activeEntryId;
      const st = settings.parentStudentMap[e.parentEmail.toLowerCase()] || e.studentName;
      return `<li class="pl-item ${active ? "pl-active" : ""}" data-id="${e.id}">
            <div class="pl-item-top">
              <span class="pl-badge pl-badge-${e.status}">${e.status === "filled" ? "Filled" : "Draft"}</span>
              <span class="pl-date">${escapeHtml(formatDate(e.emailDateIso, settings.dateFormat))}</span>
            </div>
            <div class="pl-subj">${escapeHtml(e.subject || "(no subject)")}</div>
            <div class="pl-meta">${escapeHtml(e.parentName || e.parentEmail)}${st ? ` \xB7 <b>${escapeHtml(st)}</b>` : ""}</div>
            <div class="pl-snip">${escapeHtml(short(e.body, 110))}</div>
            <div class="pl-actions">
              ${df.kind === "stock" ? `<button class="pl-btn pl-fill" data-id="${e.id}">Fill this form</button>` : ""}
              <button class="pl-btn pl-ghost pl-copy" data-id="${e.id}" data-what="entry">Copy text</button>
              <button class="pl-btn pl-ghost pl-copy" data-id="${e.id}" data-what="subject">Copy subject</button>
              <button class="pl-btn pl-ghost pl-copy" data-id="${e.id}" data-what="date">Copy date</button>
            </div>
          </li>`;
    }).join("") : `<li class="pl-empty">No drafts yet. In Gmail or Outlook, open the parent email and click <b>Log this contact</b>.</li>`;
    panel.innerHTML = `
    <div class="pl-head">
      <span class="pl-logo"></span><b>ParentLog</b>
      <span class="pl-kind">${kindLine}</span>
      <button class="pl-x" title="Hide" aria-label="Hide ParentLog panel">\xD7</button>
    </div>
    ${student ? `<div class="pl-student">Student on this page: <b>${escapeHtml(student)}</b></div>` : ""}
    <ul class="pl-list">${list}</ul>
    <div class="pl-foot" id="pl-status"></div>
  `;
    panel.querySelector(".pl-x")?.addEventListener("click", () => collapse("ParentLog", "ok"));
    panel.querySelectorAll(".pl-fill").forEach(
      (b) => b.addEventListener("click", async () => {
        const e = drafts.find((x) => x.id === b.dataset.id);
        if (!e) return;
        await doFill(e, settings);
      })
    );
    panel.querySelectorAll(".pl-copy").forEach(
      (b) => b.addEventListener("click", async () => {
        const e = drafts.find((x) => x.id === b.dataset.id);
        if (!e) return;
        const what = b.dataset.what;
        const v = what === "entry" ? buildEntryText(e, settings) : what === "subject" ? e.subject : formatDate(e.emailDateIso, settings.dateFormat);
        try {
          await navigator.clipboard.writeText(v);
          status(`Copied ${what}. Paste it into the form.`, "ok");
        } catch {
          status(`<textarea class="pl-copybox" readonly>${escapeHtml(v)}</textarea>Select and copy (Ctrl/Cmd+C).`, "warn");
        }
      })
    );
  }
  function status(html, kind) {
    const s = panel?.querySelector("#pl-status");
    if (!s) return;
    s.className = `pl-foot pl-${kind}`;
    s.innerHTML = html;
  }
  async function doFill(e, settings) {
    df = detectForm();
    if (df.kind !== "stock") return status("Form changed \u2014 not filling. Use the copy buttons.", "err");
    const report = await fill(e, settings, df);
    const student = studentOnPage();
    activeEntryId = e.id;
    const res = await chrome.runtime.sendMessage({ type: "MARK_FILLED", id: e.id, report, psUrl: location.href, psStudentOnPage: student });
    if (!res?.ok) return status("Filled, but couldn't update the ledger: " + (res?.error ?? "unknown"), "err");
    const lines = report.fields.filter((f) => f.found).map((f) => `${f.verified ? "\u2713" : "\u2717"} ${{ date: "Date", logType: "Log type", subject: "Title", entry: "Entry text" }[f.field]}${f.note ? ` \u2014 ${escapeHtml(f.note)}` : ""}`);
    const w = report.warnings.length ? `<div class="pl-warnlist">${report.warnings.map(escapeHtml).join("<br>")}</div>` : "";
    status(
      `<b>${report.ok ? "Filled and verified." : "Filled with warnings."}</b> Check the form, then click PowerSchool's <b>Submit</b>.<br>${lines.join("<br>")}${w}`,
      report.ok ? "ok" : "warn"
    );
    armSubmit();
    collapse(
      `${report.ok ? "\u2713 Filled &amp; verified" : "\u26A0 Filled with warnings"} \u2014 now click PowerSchool's Submit`,
      report.ok ? "ok" : "warn",
      `<b>${report.ok ? "Filled and verified." : "Filled with warnings."}</b> Check the form, then click PowerSchool's <b>Submit</b>.<br>${lines.join("<br>")}${w}`
    );
    df.entry?.scrollIntoView({ block: "center" });
  }
  function collapse(pillHtml, kind, detailHtml) {
    if (!panel) return;
    panel.classList.add("pl-collapsed");
    panel.innerHTML = `<button class="pl-reopen pl-reopen-${kind}" title="Show ParentLog"><span class="pl-logo"></span> ${pillHtml}</button>`;
    panel.querySelector(".pl-reopen")?.addEventListener("click", async () => {
      panel.classList.remove("pl-collapsed");
      await render();
      if (detailHtml) status(detailHtml, kind);
    });
  }
  var submitArmed = false;
  function armSubmit() {
    if (submitArmed) return;
    submitArmed = true;
    const onSubmit = () => {
      if (!activeEntryId) return;
      const id = activeEntryId;
      sessionStorage.setItem("pl_pending", JSON.stringify({ id, at: Date.now(), origin: location.origin }));
      chrome.runtime.sendMessage({ type: "MARK_SUBMITTED", id }).catch(() => {
      });
    };
    df.submit?.addEventListener("click", onSubmit, { capture: true });
    df.form?.addEventListener("submit", onSubmit, { capture: true });
  }
  function reportPageLoad() {
    const hasForm = !!detectForm().entry;
    const text = (document.body?.innerText ?? "").slice(0, 4e3);
    const hasError = /error|not saved|could not|failed|required field|invalid/i.test(text) && !/no errors/i.test(text);
    let pendingHere = false;
    try {
      const p = JSON.parse(sessionStorage.getItem("pl_pending") ?? "null");
      pendingHere = !!p && Date.now() - p.at < 2 * 60 * 1e3;
    } catch {
    }
    const looksLikeSuccess = !hasForm && !hasError;
    if (looksLikeSuccess) sessionStorage.removeItem("pl_pending");
    chrome.runtime.sendMessage({ type: "PS_PAGE_LOADED", url: location.href, looksLikeSuccess, hasForm }).catch(() => {
    });
    if (pendingHere && looksLikeSuccess) toast("ParentLog: entry saved in PowerSchool \u2713");
    if (pendingHere && hasError) toast("ParentLog: PowerSchool showed an error \u2014 entry NOT confirmed. Check the form.", true);
  }
  function toast(text, err = false) {
    const t = h(`<div class="pl-toast ${err ? "pl-toast-err" : ""}">${escapeHtml(text)}</div>`);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 6e3);
  }
  reportPageLoad();
  render();
  chrome.storage.onChanged.addListener(() => render());
  var obs = new MutationObserver(() => {
    clearTimeout(window.__plT);
    window.__plT = window.setTimeout(() => {
      const now = detectForm();
      if (!!now.entry !== !!df.entry) render();
    }, 400);
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
})();
