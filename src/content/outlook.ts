// ParentLog – Outlook on the web reader (outlook.office.com / office365 / live).
// Outlook's DOM is obfuscated and changes often, so this uses ARIA landmarks rather than class names.
// Each open message in the reading pane is a region with aria-label "Message body" for its text.

import { CapturedEmail } from "../shared/types";
import { elementToText, splitQuoted, toIsoDate } from "../shared/text";
import { BTN_CLASS, makeButton, pickParent, sendCapture, setButtonState } from "./mail-common";

function readingPane(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('[data-app-section="ConversationContainer"]') ??
    document.querySelector<HTMLElement>('div[role="main"]') ??
    null
  );
}

function bodyEls(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[aria-label="Message body"], [aria-label="Nachrichtentext"], div[role="document"]'));
}

function myAddress(): string {
  const el = document.querySelector<HTMLElement>('[data-testid="OwaAccountManagerButton"], #O365_MainLink_Me, button[aria-label*="account manager"]');
  const m = el && /[\w.+-]+@[\w.-]+\.\w+/.exec(el.getAttribute("aria-label") ?? el.textContent ?? "");
  return m ? m[0] : "";
}

function parseAddresses(text: string): { name: string; email: string }[] {
  // "Jane Smith <jane@x.org>; Bob <bob@y.org>" or bare addresses
  const out: { name: string; email: string }[] = [];
  const re = /(?:"?([^"<;,]+?)"?\s*)?<?([\w.+-]+@[\w.-]+\.\w+)>?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const email = m[2].trim();
    if (!out.some((p) => p.email === email)) out.push({ name: cleanName(m[1] ?? ""), email });
  }
  return out;
}

function cleanName(n: string): string {
  return n.replace(/^(from|to|an|von|cc)\s*:\s*/i, "").replace(/\s+/g, " ").trim();
}

/** Outlook renders each recipient as <span title="addr">Name</span>: read those pairs first, regex text as fallback. */
function peopleIn(el: HTMLElement | null): { name: string; email: string }[] {
  if (!el) return [];
  const out: { name: string; email: string }[] = [];
  el.querySelectorAll<HTMLElement>("[title*='@']").forEach((t) => {
    const email = (/[\w.+-]+@[\w.-]+\.\w+/.exec(t.getAttribute("title") ?? "") ?? [""])[0];
    if (email && !out.some((p) => p.email === email)) out.push({ name: cleanName(t.textContent ?? ""), email });
  });
  if (out.length) return out;
  return parseAddresses(`${el.textContent ?? ""} ${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("title") ?? ""}`);
}

function messageContainer(body: HTMLElement): HTMLElement {
  // Walk up until we find the element that also holds the header (From/To/date) for this message.
  let el: HTMLElement | null = body;
  for (let i = 0; i < 12 && el; i++) {
    if (el.querySelector('[aria-label^="From"], [title*="@"], span[title*="@"], [aria-label*="Sent"]') && el !== body) return el;
    el = el.parentElement;
  }
  return body.parentElement ?? body;
}

function extract(body: HTMLElement): CapturedEmail | null {
  const container = messageContainer(body);
  const headingEl = readingPane()?.querySelector<HTMLElement>('div[role="heading"], h1, h2') ?? document.querySelector<HTMLElement>('div[role="main"] [role="heading"]');
  const subject = (headingEl?.textContent ?? document.title.replace(/ - .*$/, "")).replace(/\s+/g, " ").trim();

  // From: element whose title/aria-label contains an address, first one in the container
  const fromEl = container.querySelector<HTMLElement>('[aria-label^="From"], [aria-label^="Von"]') ?? container.querySelector<HTMLElement>('span[title*="@"]')?.parentElement ?? null;
  const from = peopleIn(fromEl)[0] ?? null;

  const toEl = container.querySelector<HTMLElement>('[aria-label^="To"], [aria-label^="An"]');
  const to = peopleIn(toEl).filter((p) => !from || p.email !== from.email);

  const dateEl = container.querySelector<HTMLElement>('[data-testid="SentReceivedSavedTime"], [aria-label^="Sent"], time, span[title*=", 20"], span[title*="/20"]');
  const dateRaw = (dateEl?.getAttribute("title") || dateEl?.getAttribute("datetime") || dateEl?.textContent || "").replace(/^Sent:\s*/i, "").trim();

  const clone = body.cloneNode(true) as HTMLElement;
  const quotedParts: string[] = [];
  clone.querySelectorAll('#divRplyFwdMsg, [id^="divRplyFwdMsg"], blockquote, #x_divRplyFwdMsg').forEach((q) => {
    // Outlook puts the "From:/Sent:/To:/Subject:" header of the quoted message in divRplyFwdMsg; everything after it is quoted.
    let n: Element | null = q;
    while (n) {
      quotedParts.push(elementToText(n));
      const next: Element | null = n.nextElementSibling;
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
    messageUrl: location.href,
  };
}

function inject(body: HTMLElement): void {
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

function scan(): void {
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

const obs = new MutationObserver(() => {
  clearTimeout((window as unknown as { __plT?: number }).__plT);
  (window as unknown as { __plT?: number }).__plT = window.setTimeout(scan, 300);
});
obs.observe(document.body, { childList: true, subtree: true });
scan();
