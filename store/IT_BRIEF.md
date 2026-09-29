# ParentLog – one page for school IT

**What it is:** a Chrome extension teachers use to copy a parent email they already sent into PowerSchool's log-entry form, and to keep their own list of parent contacts.

**What it is not:** a cloud service. There is no server, no account, no analytics, no AI, no data leaving the browser.

## Data flow
```
Gmail / Outlook tab ──(teacher clicks button)──▶ Chrome extension storage on that computer ──(teacher clicks Fill)──▶ PowerSchool form fields
```
- Reads one email, only when the teacher clicks **Log this contact** on it. Never scans the mailbox.
- Fills PowerSchool's Date, Log Type, Title and Log Entry fields. **Never clicks Submit** – the teacher reviews and submits.
- Stores the ledger in `chrome.storage.local` (not synced to Google). Deleted by the teacher or by uninstalling.
- Makes **zero network requests**. Verify: chrome://extensions → ParentLog → Inspect service worker → Network tab.

## Permissions
| Permission | Scope |
|---|---|
| Gmail, Outlook web | inject the button, read the clicked message |
| Your PowerSchool origin (e.g. `https://ps.district.org`) | requested at runtime, for that one origin only; you can pre-grant via policy |
| storage, sidePanel, activeTab, scripting | local ledger UI and runtime registration for the PowerSchool origin |

## Rolling out via Google Admin (managed Chrome)
Admin console → Devices → Chrome → Apps & extensions → Users & browsers → add by extension ID (from the Web Store listing) → **Force install** or **Allow install**. Under the extension's settings you can set `runtime_allowed_hosts` to your PowerSchool origin so teachers don't see a permission prompt, and `runtime_blocked_hosts` for everything else.

## FERPA note
Student names and parent emails stay on the teacher's device inside Chrome's extension storage, the same place a locally-saved draft would live. ParentLog does not create a new data recipient. School data-retention rules apply to the teacher's ledger as they would to any local file; "Delete all entries" in Settings clears it.

## Source
The extension ships unminified; anyone can read `dist/` after unzipping. Source and tests available on request.
