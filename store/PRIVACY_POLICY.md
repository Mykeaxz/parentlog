# ParentLog – Privacy Policy

_Effective 29 September 2026_

ParentLog is a Chrome extension that helps teachers turn a parent email they have already sent or received into a log entry in their school's PowerSchool system, and keeps a personal list ("ledger") of those contacts.

## What ParentLog collects

**Nothing is collected by us.** ParentLog has no server, no account, no analytics and no telemetry. The extension makes no network requests of its own.

## What ParentLog stores on your device

When you click **Log this contact** on an email, ParentLog reads that one email from the page you are looking at and stores the following in Chrome's extension storage on your computer:

- the other party's name and email address (the parent)
- your own email address (to tell "sent" from "received")
- the email's date and subject
- the email's text, with the quoted earlier thread stored separately
- a link back to the email
- any student name or outcome note you type yourself
- which PowerSchool page you filled it into and whether it was saved

This data stays in your browser profile. It is never transmitted to us or to anyone else. If you use Chrome sync, Chrome does **not** sync this data (ParentLog uses `storage.local`, not `storage.sync`).

## What ParentLog reads

- **Gmail / Outlook on the web:** only the message you click the button on, and only when you click. It does not scan your inbox.
- **PowerSchool:** only on the site address you explicitly allow in Settings. It reads the log-entry form fields and the student name shown on that page so it can fill the form and tell you what it did. It never clicks Submit for you.

## What ParentLog never does

- never sends email or student text anywhere
- never uses AI or external services
- never submits anything to PowerSchool automatically
- never runs on websites other than Gmail, Outlook on the web and the PowerSchool address you allow

## Deleting your data

Open the ParentLog panel → Settings → **Delete all entries**, or remove the extension. Both delete everything ParentLog stored.

## Permissions explained

| Permission | Why |
|---|---|
| `storage` | keep your ledger and settings on your device |
| `sidePanel` | show the ledger beside your tabs |
| `activeTab`, `scripting` | read the open email when you click **Capture open email**, and run on the PowerSchool site you allowed |
| `mail.google.com`, `outlook.office.com`, `outlook.office365.com`, `outlook.live.com` | show the **Log this contact** button on emails |
| optional: any site | so you can allow your own district's PowerSchool address (only the one you enter is ever used) |

## Contact

Questions: somvexdynamics@gmail.com. ParentLog is independent and not affiliated with PowerSchool Holdings, Google or Microsoft.
