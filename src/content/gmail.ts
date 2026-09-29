// ParentLog – Gmail reader. Injects a "Log this contact" button on every expanded message and
// extracts recipient / date / subject / body from the page DOM when the teacher clicks it.
// Runs only on mail.google.com. Nothing is read until the button is clicked.

import { CapturedEmail } from "../shared/types";
import { elementToText, splitQuoted, toIsoDate } from "../shared/text";
import { BTN_CLASS, makeButton, pickParent, sendCapture, setButtonState } from "./mail-common";

const MSG_SELECTOR = "div.adn"; // one expanded message in a conversation view

function myAddress(): string {
  // Gmail puts the account address in the profile button's aria-label: "Google Account: Name (name@school.org)"
  const a = document.querySelector<HTMLElement>('a[aria-label*="Google Account"], a[aria-label*="Google-Konto"]');
  const m = a && /\(([^)]+@[^)]+)\)/.exec(a.getAttribute("aria-label") ?? "");
  if (m) return m[1].trim();
  // Fallback: the "me" span in the header carries the email attribute
  const me = document.querySelector<HTMLElement>('span[email][name="me"]');
  return me?.getAttribute("email") ?? "";
}

function people(msg: Element, scope: "from" | "to"): { name: string; email: string }[] {
  const out: { name: string; email: string }[] = [];
  const nodes =
    scope === "from"
      ? msg.querySelectorAll<HTMLElement>(".gE .gD[email], .gE span[email].gD, h3 span[email], .iw span[email]")
      : msg.querySelectorAll<HTMLElement>(".gE .g2[email], .gE span[email].g2, .ajA span[email], .iw .g2[email]");
  nodes.forEach((n) => {
    const email = (n.getAttribute("email") ?? "").trim();
    const name = (n.getAttribute("name") ?? n.textContent ?? "").trim();
    if (email && !out.some((p) => p.email === email)) out.push({ name, email });
  });
  return out;
}

function extractMessage(msg: Element): CapturedEmail | null {
  const subjectEl = document.querySelector<HTMLElement>("h2.hP") ?? document.querySelector<HTMLElement>('div[role="main"] h2');
  const subject = (subjectEl?.textContent ?? "").trim();

  const dateEl = msg.querySelector<HTMLElement>("span.g3, .gH .gK span[title]");
  const dateRaw = (dateEl?.getAttribute("title") || dateEl?.getAttribute("data-tooltip") || dateEl?.textContent || "").trim();

  const bodyEl = msg.querySelector<HTMLElement>("div.a3s");
  if (!bodyEl) return null;
  const bodyClone = bodyEl.cloneNode(true) as HTMLElement;
  // Gmail wraps the quoted thread in .gmail_quote (and hides it behind "…" as .h5 / .adL)
  const quotedParts: string[] = [];
  bodyClone.querySelectorAll(".gmail_quote, .adL, blockquote").forEach((q) => {
    quotedParts.push(elementToText(q));
    q.remove();
  });
  // Signature block
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
    messageUrl: location.href,
  };
}

function inject(msg: Element): void {
  if (msg.querySelector(`.${BTN_CLASS}`)) return;
  // Only expanded messages have a body
  if (!msg.querySelector("div.a3s")) return;
  const header = msg.querySelector<HTMLElement>(".gE.iv.gt") ?? msg.querySelector<HTMLElement>(".gH") ?? msg.querySelector<HTMLElement>(".gE");
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

function scan(): void {
  document.querySelectorAll(MSG_SELECTOR).forEach(inject);
}

// Panel "Capture open email" → extract the most recently expanded message on this tab
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "EXTRACT_NOW") return;
  const msgs = Array.from(document.querySelectorAll(MSG_SELECTOR)).filter((m) => m.querySelector("div.a3s"));
  const last = msgs[msgs.length - 1];
  const captured = last ? extractMessage(last) : null;
  sendResponse(captured ? { ok: true, captured } : { ok: false, error: "Open a single email first (click into it so the message text is showing)." });
  return true;
});

const obs = new MutationObserver(() => {
  clearTimeout((window as unknown as { __plT?: number }).__plT);
  (window as unknown as { __plT?: number }).__plT = window.setTimeout(scan, 250);
});
obs.observe(document.body, { childList: true, subtree: true });
scan();
