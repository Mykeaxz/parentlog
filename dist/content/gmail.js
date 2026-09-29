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

  // src/content/gmail.ts
  var MSG_SELECTOR = "div.adn";
  function myAddress() {
    const a = document.querySelector('a[aria-label*="Google Account"], a[aria-label*="Google-Konto"]');
    const m = a && /\(([^)]+@[^)]+)\)/.exec(a.getAttribute("aria-label") ?? "");
    if (m) return m[1].trim();
    const me = document.querySelector('span[email][name="me"]');
    return me?.getAttribute("email") ?? "";
  }
  function people(msg, scope) {
    const out = [];
    const nodes = scope === "from" ? msg.querySelectorAll(".gE .gD[email], .gE span[email].gD, h3 span[email], .iw span[email]") : msg.querySelectorAll(".gE .g2[email], .gE span[email].g2, .ajA span[email], .iw .g2[email]");
    nodes.forEach((n) => {
      const email = (n.getAttribute("email") ?? "").trim();
      const name = (n.getAttribute("name") ?? n.textContent ?? "").trim();
      if (email && !out.some((p) => p.email === email)) out.push({ name, email });
    });
    return out;
  }
  function extractMessage(msg) {
    const subjectEl = document.querySelector("h2.hP") ?? document.querySelector('div[role="main"] h2');
    const subject = (subjectEl?.textContent ?? "").trim();
    const dateEl = msg.querySelector("span.g3, .gH .gK span[title]");
    const dateRaw = (dateEl?.getAttribute("title") || dateEl?.getAttribute("data-tooltip") || dateEl?.textContent || "").trim();
    const bodyEl = msg.querySelector("div.a3s");
    if (!bodyEl) return null;
    const bodyClone = bodyEl.cloneNode(true);
    const quotedParts = [];
    bodyClone.querySelectorAll(".gmail_quote, .adL, blockquote").forEach((q) => {
      quotedParts.push(elementToText(q));
      q.remove();
    });
    bodyClone.querySelectorAll(".gmail_signature").forEach((q) => q.remove());
    const raw = elementToText(bodyClone);
    const split = splitQuoted(raw);
    const quoted = [split.quoted, ...quotedParts].filter(Boolean).join("\n\n").trim();
    const me = myAddress();
    const from = people(msg, "from")[0] ?? null;
    const to = people(msg, "to");
    const pp = pickParent(from, to, me);
    return {
      source: "gmail",
      direction: pp.direction,
      parentEmail: pp.parent.email,
      parentName: pp.parent.name === pp.parent.email ? "" : pp.parent.name,
      teacherEmail: pp.teacher,
      emailDateIso: toIsoDate(dateRaw),
      emailDateRaw: dateRaw,
      subject,
      body: split.body,
      quotedBody: quoted,
      messageUrl: location.href
    };
  }
  function inject(msg) {
    if (msg.querySelector(`.${BTN_CLASS}`)) return;
    if (!msg.querySelector("div.a3s")) return;
    const header = msg.querySelector(".gE.iv.gt") ?? msg.querySelector(".gH") ?? msg.querySelector(".gE");
    if (!header) return;
    const host = document.createElement("div");
    host.className = "parentlog-host";
    const btn = makeButton(async (b) => {
      setButtonState(b, "busy");
      const captured = extractMessage(msg);
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
    header.appendChild(host);
  }
  function scan() {
    document.querySelectorAll(MSG_SELECTOR).forEach(inject);
  }
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "EXTRACT_NOW") return;
    const msgs = Array.from(document.querySelectorAll(MSG_SELECTOR)).filter((m) => m.querySelector("div.a3s"));
    const last = msgs[msgs.length - 1];
    const captured = last ? extractMessage(last) : null;
    sendResponse(captured ? { ok: true, captured } : { ok: false, error: "Open a single email first (click into it so the message text is showing)." });
    return true;
  });
  var obs = new MutationObserver(() => {
    clearTimeout(window.__plT);
    window.__plT = window.setTimeout(scan, 250);
  });
  obs.observe(document.body, { childList: true, subtree: true });
  scan();
})();
