# ParentLog – Parent Contact Ledger for PowerSchool

Chrome extension (Manifest V3). Turns a parent email in Gmail/Outlook into a filled PowerSchool log entry, and keeps the teacher's own ledger of contacts with Draft → Filled → Submitted → Saved states.

## Upload today (Chrome Web Store)

1. `parentlog-1.0.0.zip` is the store package (built from `dist/`).
2. Go to https://chrome.google.com/webstore/devconsole → **New item** → upload the zip ($5 one-time developer fee if you haven't paid it).
3. Fill the listing from `store/STORE_LISTING.md` (name, summary, description, category, permission justifications, data disclosure).
4. Upload screenshots from `test/shots/` (1280×800). Re-shoot 1_gmail_buttons.png on real Gmail before publishing – the mock is plain.
5. Host `store/PRIVACY_POLICY.md` somewhere public (GitHub Pages is fine) and paste the URL.
6. Visibility: **Unlisted** for the pilot (teachers install from the link, no public discovery), switch to Public later.
7. Submit for review. Extensions with `optional_host_permissions: <all_urls>` get a manual review – the justifications in STORE_LISTING.md are written for exactly that question. Expect 1–5 days.

## Test it yourself first (5 minutes, no store needed)

1. `chrome://extensions` → Developer mode → **Load unpacked** → pick the `dist/` folder.
2. Click the ParentLog icon → side panel opens with onboarding. Enter your (or a pilot teacher's) PowerSchool address → Allow.
3. Open Gmail, open any sent email → green **Log this contact** button in the message header → click.
4. Open PowerSchool → student → Submit Log Entry. Panel appears top-right → **Fill this form** → check → Submit.

## Build

```
npm install
npx tsc -p .          # type-check
node build.mjs        # → dist/        (production)
node build.mjs test   # → dist-test/   (adds mock host for automated tests)
cd dist && zip -r ../parentlog-1.0.0.zip .
```

## Tests

```
python3 test/e2e.py   # loads dist-test into Chromium, 65 checks: Gmail, Outlook, both PowerSchool layouts, side panel, save confirmation
npx esbuild test/unit/text.test.ts --bundle --platform=node --format=esm --outfile=/tmp/t.mjs && node /tmp/t.mjs   # 9 unit tests
```
Screenshots land in `test/shots/`.

## Architecture

```
src/
  manifest.json          MV3; Gmail/Outlook hosts static, PowerSchool host optional (requested at runtime)
  background.ts          service worker: storage owner, state transitions, registers PowerSchool script for allowed origins
  shared/types.ts        LedgerEntry, Settings, message types
  shared/storage.ts      chrome.storage.local wrapper
  shared/text.ts         date parsing/formatting, quote splitting, entry text builder, CSV
  content/gmail.ts       button on each expanded message; extracts from DOM (span[email], span.g3[title], h2.hP, div.a3s)
  content/outlook.ts     same for Outlook web via ARIA landmarks (best-effort – Outlook's DOM changes often)
  content/powerschool.ts detects log form (labels + PowerSchool [Log_Entries]… names), fills, verifies, watches Submit, confirms save on next page load
  panel/                 side panel: ledger, editor, settings, onboarding
```

### State machine
```
draft ──Fill this form──▶ filled ──teacher clicks Submit──▶ submitted ──next PS page loads w/o form & w/o error──▶ saved
                                                                                     (or teacher: "Mark as saved")
```
"Filled" never means "saved". The ledger says which it is.

### Form detection
A page is a stock log form when it has a visible textarea labelled Log Entry / Log Entry Text / Comment (or named `…]Entry`), a text/date input labelled Date (or `Entry_Date`), and either a Title/Subject input or a Log Type select. Anything else → "not recognised" → copy buttons, no filling. Tested against the PowerTeacher "Submit Log Entry" layout (framed) and the PowerSchool admin "Log Entries" layout (Nova Scotia guide, May 2026).

### What is deliberately NOT in v1
- Payments / licence (Stripe + Cloudflare Worker) – add after the pilot proves willingness to pay
- AI summaries – privacy conversation with schools first; the header line + trimmed body covers the common case
- Guided field mapping for custom district forms – build after seeing a second genuinely different form in the wild
- Inbox-wide Gmail API access – never; DOM read on click only

## Known limits
- Outlook web was tested against a mock of its ARIA structure, not a live tenant. Expect to tweak `content/outlook.ts` after the first real Outlook teacher.
- Gmail's account address is read from the profile button's aria-label; in a non-English Gmail UI the label differs and direction detection falls back to the "me" span.
- Save confirmation relies on PowerSchool loading a page without the form after Submit. If a district's form stays on-page after saving, the entry stays "Submitted – confirming" and the teacher uses "Mark as saved".
