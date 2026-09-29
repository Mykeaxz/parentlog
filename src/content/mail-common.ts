import { CapturedEmail, MsgResponse } from "../shared/types";

export const BTN_CLASS = "parentlog-btn";

export function makeButton(onClick: (btn: HTMLButtonElement) => void): HTMLButtonElement {
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

export function setButtonState(b: HTMLButtonElement, state: "idle" | "busy" | "done" | "dup" | "err", text?: string): void {
  b.dataset.state = state;
  const label = b.querySelector(".parentlog-label") as HTMLElement | null;
  if (!label) return;
  label.textContent =
    text ??
    ({ idle: "Log this contact", busy: "Saving…", done: "Saved to ledger ✓", dup: "Already in ledger", err: "Couldn't read email" }[state]);
  if (state === "done" || state === "dup") {
    setTimeout(() => setButtonState(b, "idle"), 4000);
  }
}

export async function sendCapture(c: CapturedEmail): Promise<MsgResponse> {
  return chrome.runtime.sendMessage({ type: "CAPTURE_EMAIL", payload: c });
}

/** Given a list of {name,email} from the header and the account's own address, work out the parent (other party). */
export function pickParent(
  from: { name: string; email: string } | null,
  to: { name: string; email: string }[],
  me: string,
): { direction: "sent" | "received"; parent: { name: string; email: string }; teacher: string } {
  const meL = me.toLowerCase();
  const fromIsMe = !!from && (from.email.toLowerCase() === meL || (!!meL && from.name.toLowerCase() === "me"));
  if (fromIsMe || !from) {
    const first = to.find((t) => t.email.toLowerCase() !== meL) ?? to[0] ?? { name: "", email: "" };
    return { direction: "sent", parent: first, teacher: me };
  }
  return { direction: "received", parent: from, teacher: me || (to[0]?.email ?? "") };
}
