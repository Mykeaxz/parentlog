"use strict";
(() => {
  // src/shared/text.ts
  function todayIso() {
    const d = /* @__PURE__ */ new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  var MONTHS = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    sept: 9,
    oct: 10,
    nov: 11,
    dec: 12,
    januar: 1,
    februar: 2,
    m\u00E4rz: 3,
    mai: 5,
    juni: 6,
    juli: 7,
    okt: 10,
    dez: 12
  };
  var iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  var valid = (y, m, d) => y >= 2e3 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
  function toIsoDate(raw) {
    if (!raw) return todayIso();
    const s = raw.replace(/ | /g, " ").replace(/\s+at\s+/i, " ").replace(/^[A-Za-zäöü]{2,10}\.?,\s*/, "").replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s+/i, "").trim();
    let m;
    if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)) && valid(+m[1], +m[2], +m[3])) return iso(+m[1], +m[2], +m[3]);
    if (m = /^([A-Za-zäöü]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s)) {
      const mo = MONTHS[m[1].toLowerCase()];
      if (mo && valid(+m[3], mo, +m[2])) return iso(+m[3], mo, +m[2]);
    }
    if (m = /^(\d{1,2})\.?\s+([A-Za-zäöü]{3,9})\.?\s+(\d{4})/.exec(s)) {
      const mo = MONTHS[m[2].toLowerCase()];
      if (mo && valid(+m[3], mo, +m[1])) return iso(+m[3], mo, +m[1]);
    }
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s)) && valid(+m[3], +m[1], +m[2])) return iso(+m[3], +m[1], +m[2]);
    if ((m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(s)) && +m[1] > 12 && valid(+m[3], +m[2], +m[1])) return iso(+m[3], +m[2], +m[1]);
    if (m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})$/.exec(s)) {
      const mo = MONTHS[m[1].toLowerCase()];
      const y = (/* @__PURE__ */ new Date()).getFullYear();
      if (mo && valid(y, mo, +m[2])) return iso(y, mo, +m[2]);
    }
    const t = Date.parse(s);
    if (!isNaN(t)) {
      const d = new Date(t);
      if (valid(d.getFullYear(), d.getMonth() + 1, d.getDate())) return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
    }
    return todayIso();
  }
  function elementToText(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll("style,script,noscript").forEach((n) => n.remove());
    clone.querySelectorAll("br").forEach((n) => n.replaceWith("\n"));
    clone.querySelectorAll("p,div,li,tr,h1,h2,h3,h4,h5,h6,blockquote").forEach((n) => {
      n.prepend("\n");
      n.append("\n");
    });
    return normaliseWhitespace(clone.textContent ?? "");
  }
  function normaliseWhitespace(s) {
    return s.replace(/\r/g, "").replace(/[ \t ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function splitQuoted(text) {
    const lines = text.split("\n");
    const markers = [
      /^On .{5,200} wrote:\s*$/i,
      /^-{2,}\s*Original Message\s*-{2,}$/i,
      /^From:\s.+$/i,
      /^Am .{5,200} schrieb .+:\s*$/i,
      /^Le .{5,200} a écrit\s*:\s*$/i,
      /^_{5,}$/
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

  // src/content/mail-common.ts
  var BTN_CLASS = "parentlog-btn";
  function makeButton(onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = BTN_CLASS;
    b.title = "ParentLog: save this email as a parent-contact draft for PowerSchool";
    b.innerHTML = `<span class="parentlog-dot"></span><span class="parentlog-label">Log this contact</span>`;
    b.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      onClick(b);
    });
    return b;
  }
  function setButtonState(b, state, text) {
    b.dataset.state = state;
    const label = b.querySelector(".parentlog-label");
    if (!label) return;
    label.textContent = text ?? { idle: "Log this contact", busy: "Saving\u2026", done: "Saved to ledger \u2713", dup: "Already in ledger", err: "Couldn't read email" }[state];
    if (state === "done" || state === "dup") {
      setTimeout(() => setButtonState(b, "idle"), 4e3);
    }
  }
  async function sendCapture(c) {
    return chrome.runtime.sendMessage({ type: "CAPTURE_EMAIL", payload: c });
  }
  function pickParent(from, to, me) {
    const meL = me.toLowerCase();
    const fromIsMe = !!from && (from.email.toLowerCase() === meL || !!meL && from.name.toLowerCase() === "me");
    if (fromIsMe || !from) {
      const first = to.find((t) => t.email.toLowerCase() !== meL) ?? to[0] ?? { name: "", email: "" };
      return { direction: "sent", parent: first, teacher: me };
    }
    return { direction: "received", parent: from, teacher: me || (to[0]?.email ?? "") };
  }

  // src/content/outlook.ts
  function readingPane() {
    return document.querySelector('[data-app-section="ConversationContainer"]') ?? document.querySelector('div[role="main"]') ?? null;
  }
  function bodyEls() {
    return Array.from(document.querySelectorAll('[aria-label="Message body"], [aria-label="Nachrichtentext"], div[role="document"]'));
  }
  function myAddress() {
    const el = document.querySelector('[data-testid="OwaAccountManagerButton"], #O365_MainLink_Me, button[aria-label*="account manager"]');
    const m = el && /[\w.+-]+@[\w.-]+\.\w+/.exec(el.getAttribute("aria-label") ?? el.textContent ?? "");
    return m ? m[0] : "";
  }
  function parseAddresses(text) {
    const out = [];
    const re = /(?:"?([^"<;,]+?)"?\s*)?<?([\w.+-]+@[\w.-]+\.\w+)>?/g;
    let m;
    while (m = re.exec(text)) {
      const email = m[2].trim();
      if (!out.some((p) => p.email === email)) out.push({ name: cleanName(m[1] ?? ""), email });
    }
    return out;
  }
  function cleanName(n) {
    return n.replace(/^(from|to|an|von|cc)\s*:\s*/i, "").replace(/\s+/g, " ").trim();
  }
  function peopleIn(el) {
    if (!el) return [];
    const out = [];
    el.querySelectorAll("[title*='@']").forEach((t) => {
      const email = (/[\w.+-]+@[\w.-]+\.\w+/.exec(t.getAttribute("title") ?? "") ?? [""])[0];
      if (email && !out.some((p) => p.email === email)) out.push({ name: cleanName(t.textContent ?? ""), email });
    });
    if (out.length) return out;
    return parseAddresses(`${el.textContent ?? ""} ${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("title") ?? ""}`);
  }
  function messageContainer(body) {
    let el = body;
    for (let i = 0; i < 12 && el; i++) {
      if (el.querySelector('[aria-label^="From"], [title*="@"], span[title*="@"], [aria-label*="Sent"]') && el !== body) return el;
      el = el.parentElement;
    }
    return body.parentElement ?? body;
  }
  function extract(body) {
    const container = messageContainer(body);
    const headingEl = readingPane()?.querySelector('div[role="heading"], h1, h2') ?? document.querySelector('div[role="main"] [role="heading"]');
    const subject = (headingEl?.textContent ?? document.title.replace(/ - .*$/, "")).replace(/\s+/g, " ").trim();
    const fromEl = container.querySelector('[aria-label^="From"], [aria-label^="Von"]') ?? container.querySelector('span[title*="@"]')?.parentElement ?? null;
    const from = peopleIn(fromEl)[0] ?? null;
    const toEl = container.querySelector('[aria-label^="To"], [aria-label^="An"]');
    const to = peopleIn(toEl).filter((p) => !from || p.email !== from.email);
    const dateEl = container.querySelector('[data-testid="SentReceivedSavedTime"], [aria-label^="Sent"], time, span[title*=", 20"], span[title*="/20"]');
    const dateRaw = (dateEl?.getAttribute("title") || dateEl?.getAttribute("datetime") || dateEl?.textContent || "").replace(/^Sent:\s*/i, "").trim();
    const clone = body.cloneNode(true);
    const quotedParts = [];
    clone.querySelectorAll('#divRplyFwdMsg, [id^="divRplyFwdMsg"], blockquote, #x_divRplyFwdMsg').forEach((q) => {
      let n = q;
      while (n) {
        quotedParts.push(elementToText(n));
        const next = n.nextElementSibling;
        n.remove();
        n = next;
      }
    });
    const split = splitQuoted(elementToText(clone));
    const me = myAddress();
    const pp = pickParent(from, to, me);
    if (!split.body && !subject) return null;
    return {
      source: "outlook",
      direction: pp.direction,
      parentEmail: pp.parent.email,
      parentName: pp.parent.name,
      teacherEmail: pp.teacher,
      emailDateIso: toIsoDate(dateRaw),
      emailDateRaw: dateRaw,
      subject,
      body: split.body,
      quotedBody: [split.quoted, ...quotedParts].filter(Boolean).join("\n\n").trim(),
      messageUrl: location.href
    };
  }
  function inject(body) {
    const container = messageContainer(body);
    if (container.querySelector(`.${BTN_CLASS}`)) return;
    const host = document.createElement("div");
    host.className = "parentlog-host parentlog-host-outlook";
    const btn = makeButton(async (b) => {
      setButtonState(b, "busy");
      const captured = extract(body);
      if (!captured) return setButtonState(b, "err");
      try {
        const res = await sendCapture(captured);
        if (!res.ok) return setButtonState(b, "err", res.error);
        setButtonState(b, res.error === "duplicate" ? "dup" : "done");
      } catch {
        setButtonState(b, "err");
      }
    });
    host.appendChild(btn);
    body.parentElement?.insertBefore(host, body);
  }
  function scan() {
    bodyEls().forEach(inject);
  }
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "EXTRACT_NOW") return;
    const bodies = bodyEls();
    const last = bodies[bodies.length - 1];
    const captured = last ? extract(last) : null;
    sendResponse(captured ? { ok: true, captured } : { ok: false, error: "Open a single email in the reading pane first." });
    return true;
  });
  var obs = new MutationObserver(() => {
    clearTimeout(window.__plT);
    window.__plT = window.setTimeout(scan, 300);
  });
  obs.observe(document.body, { childList: true, subtree: true });
  scan();
})();
