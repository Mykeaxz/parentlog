# Chrome Web Store listing – copy/paste fields

## Name (max 45 chars)
ParentLog – Parent Contact Log for PowerSchool

## Summary (max 132 chars)
Turn a parent email you already sent into a PowerSchool log entry in one click. Keep your own contact ledger. Nothing leaves your browser.

## Category
Productivity → Workflow & Planning

## Language
English

## Description
You emailed the parent. Now your school wants the same contact logged in PowerSchool. ParentLog does the retyping for you.

HOW IT WORKS
1. In Gmail or Outlook, open the email and click "Log this contact".
2. In PowerSchool, open the student → Submit Log Entry. ParentLog fills Date, Log Type, Title and the entry text from the email.
3. Check it, click PowerSchool's Submit. ParentLog marks the contact as saved.

YOUR OWN CONTACT LEDGER
Every contact you capture is listed in the side panel: Drafts (not yet logged), Filled (in PowerSchool, not yet submitted) and Saved. Search by student or parent, add an outcome note ("parent replied 9/30"), export to CSV. Finally you can see your own parent contacts for the week without hunting through PowerSchool.

WORKS WITH
• Gmail and Outlook on the web
• PowerTeacher "Submit Log Entry" and PowerSchool "Log Entries" forms (Date / Log Type / Title or Subject / Log Entry text)
• Your district's own PowerSchool address – you allow it once in Settings
• Any log type: pick which dropdown option ParentLog should select (Teacher, Teacher Contact, Parent Contact…)
• US (MM/DD/YYYY) and international date formats

BUILT FOR SCHOOLS
• No account, no server, no AI. Email and student text never leave your browser.
• ParentLog never clicks Submit. You always review before anything is saved.
• Reads one email only when you click, never your inbox.
• Runs only on Gmail, Outlook and the PowerSchool site you allow.
• If your school uses a custom log form ParentLog doesn't recognise, it gives you copy buttons instead of guessing.

Not affiliated with PowerSchool Holdings, Google or Microsoft.

## Single purpose description (for the review form)
Copy the details of an email the user selects (sender/recipient, date, subject, text) into the user's PowerSchool log-entry form and keep a local list of those entries.

## Permission justifications (review form)
- **storage**: Stores the user's contact ledger and settings locally. No sync, no server.
- **sidePanel**: The ledger UI is a Chrome side panel.
- **activeTab**: When the user clicks "Capture open email" in the side panel, the extension reads the email currently open in the active Gmail/Outlook tab.
- **scripting**: Registers the PowerSchool content script at runtime for the single PowerSchool origin the user allows in Settings (origin is not known at install time – every district has its own domain).
- **Host permissions (mail.google.com, outlook.office.com, outlook.office365.com, outlook.live.com)**: Injects the "Log this contact" button on open messages and reads that message when clicked.
- **Optional host permissions (https://*/*, http://*/*)**: The user's PowerSchool site has a district-specific domain (e.g. ps.district.org). The extension requests permission only for the exact origin the user types, via chrome.permissions.request, and registers its content script for that origin alone.
- **Remote code**: No. All code is packaged. No eval, no remote scripts.

## Data usage disclosure (Privacy tab)
- Personally identifiable information: **Yes** (name, email address) – stored locally only
- Personal communications: **Yes** (email content) – stored locally only
- Authentication information: No · Financial: No · Health: No · Location: No · Web history: No · User activity: No · Website content: Yes (the PowerSchool form fields and student name on the page, used locally)
- Certify: not sold, not used for unrelated purposes, not used for creditworthiness.

## Privacy policy URL
Host store/PRIVACY_POLICY.md on your site (GitHub Pages works) and paste the URL.

## Screenshots to upload (1280×800, from test/shots/)
1. 6_ps_panel.png – ParentLog panel on the PowerSchool form
2. 7_ps_filled.png – form filled, "now click Submit" pill
3. 3_panel_drafts.png – side panel ledger
4. 4_editor.png – edit a contact, add outcome
5. 1_gmail_buttons.png – button on Gmail (re-shoot on real Gmail before publishing)

## Icon
icons/icon128.png (already in the zip)
