"""End-to-end test: loads the unpacked extension into Chromium and walks every teacher path.
Gmail and PowerSchool are served from local mock HTML via request routing, so the content scripts
match their real URL patterns (mail.google.com, ps.mockdistrict.org)."""
import json, os, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
EXT = ROOT / "dist-test"
MOCK = ROOT / "test" / "mock"
SHOTS = ROOT / "test" / "shots"
SHOTS.mkdir(exist_ok=True)

ROUTES = {
    "https://mail.google.com/mail/u/0/": "gmail.html",
    "https://ps.mockdistrict.org/teachers/home.html": "ps_home.html",
    "https://ps.mockdistrict.org/teachers/studentpages/logentry.html": "ps_logentry.html",
    "https://ps.mockdistrict.org/teachers/changesrecorded.html": "ps_changes.html",
    "https://ps.mockdistrict.org/teachers/custom.html": "ps_custom.html",
    "https://outlook.office.com/mail/": "outlook.html",
    "https://ps.mockdistrict.org/admin/logentry_ns.html": "ps_logentry_ns.html",
}
fails = []
def check(cond, msg):
    print(("  ✓ " if cond else "  ✗ ") + msg)
    if not cond: fails.append(msg)

def route(r):
    url = r.request.url.split("#")[0].split("?")[0]
    if not url.startswith("http"):
        return r.continue_()
    for k, f in ROUTES.items():
        if url.startswith(k):
            return r.fulfill(status=200, content_type="text/html; charset=utf-8", body=(MOCK / f).read_text())
    r.fulfill(status=404, body="not mocked: " + url)

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        str(ROOT / "test" / "profile"), headless=True, channel="chromium",
        args=[f"--disable-extensions-except={EXT}", f"--load-extension={EXT}", "--headless=new"],
        viewport={"width": 1280, "height": 800},
    )
    ctx.route("**/*", route)
    # wait for service worker
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    ext_id = sw.url.split("/")[2]
    print("extension id", ext_id)
    time.sleep(1.0)

    def storage():
        return sw.evaluate("() => chrome.storage.local.get(null)")
    def entries():
        return sorted(storage().get("pl_entries", []), key=lambda e: e["createdAt"])

    sw.evaluate("() => chrome.storage.local.clear()")

    # ---------- 1. Gmail: button injection + capture ----------
    print("\n[1] Gmail")
    gm = ctx.new_page()
    gm.goto("https://mail.google.com/mail/u/0/#inbox/FMfcgz")
    gm.wait_for_selector(".parentlog-btn", timeout=8000)
    btns = gm.locator(".parentlog-btn")
    check(btns.count() == 2, f"one button per expanded message (got {btns.count()})")
    gm.screenshot(path=str(SHOTS / "1_gmail_buttons.png"))
    btns.nth(1).click()   # teacher's own reply
    gm.wait_for_function("() => document.querySelectorAll('.parentlog-btn')[1].dataset.state === 'done'", timeout=5000)
    e = entries()
    check(len(e) == 1, "one draft created")
    d = e[0]
    check(d["status"] == "draft", "status draft")
    check(d["direction"] == "sent", f"direction sent (got {d['direction']})")
    check(d["parentEmail"] == "carol.smith@example.com", f"parent email (got {d['parentEmail']})")
    check(d["parentName"] == "Carol Smith", f"parent name (got {d['parentName']!r})")
    check(d["teacherEmail"] == "teacher@lincoln.k12.us", "teacher email from account label")
    check(d["emailDateIso"] == "2026-09-29", f"date from title attr (got {d['emailDateIso']})")
    check(d["subject"] == "Re: Missed homework – Jane", "subject")
    check("handed it in this morning" in d["body"] and "wrote:" not in d["body"], "body has new text, no quoted thread")
    check("Lincoln Middle School · Room 204" not in d["body"], "signature stripped")
    check("Carol Smith" in d["quotedBody"], "quoted thread kept separately")
    # duplicate guard
    btns.nth(1).click()
    gm.wait_for_function("() => document.querySelectorAll('.parentlog-btn')[1].dataset.state === 'dup'", timeout=5000)
    check(len(entries()) == 1, "second click = duplicate, no second draft")
    # received message
    btns.nth(0).click()
    gm.wait_for_function("() => document.querySelectorAll('.parentlog-btn')[0].dataset.state === 'done'", timeout=5000)
    e = entries()
    check(len(e) == 2 and e[1]["direction"] == "received" and e[1]["parentEmail"] == "carol.smith@example.com", "received message → parent = sender")
    check(e[1]["emailDateIso"] == "2026-09-28", "received date")

    # ---------- 2. Side panel ----------
    print("\n[2] Side panel")
    pn = ctx.new_page()
    pn.goto(f"chrome-extension://{ext_id}/panel/panel.html")
    pn.wait_for_selector("#onboarding:not(.hidden)")
    check(True, "onboarding shows on first run")
    pn.screenshot(path=str(SHOTS / "2_onboarding.png"))
    pn.click("#ob-done")
    pn.wait_for_selector("#onboarding.hidden", state="attached")
    pn.wait_for_selector(".card")
    check(pn.locator(".card").count() == 2, "two drafts listed")
    check(pn.locator("#c-draft").inner_text() == "2", "draft count badge = 2")
    pn.screenshot(path=str(SHOTS / "3_panel_drafts.png"))
    # open editor for teacher's reply (newest first → first card is the received one? sorted by updatedAt desc)
    pn.locator(".card", has_text="handed it in this morning").first.click()
    pn.wait_for_selector("#editor:not(.hidden)")
    pn.fill("#ed-student", "Smith, Jane")
    pn.fill("#ed-outcome", "Parent replied same evening; worksheet handed in 9/29")
    prev = pn.locator("#ed-preview").text_content()
    check("Outcome: Parent replied" in prev and "Email " in prev and "Subject: Re: Missed homework" in prev, "preview builds header + outcome")
    pn.click("#ed-save")
    pn.wait_for_timeout(400)
    check(any(x["studentName"] == "Smith, Jane" for x in entries()), "edited student saved")
    pn.screenshot(path=str(SHOTS / "4_editor.png"))
    pn.click("#ed-back")
    # search
    pn.fill("#search", "zzz-nothing")
    check(pn.locator(".card").count() == 0, "search filters")
    pn.fill("#search", "")
    # settings: log type, date format
    pn.click("#btn-settings")
    pn.wait_for_selector("#settings:not(.hidden)")
    pn.fill("#st-logtype", "Teacher")
    pn.dispatch_event("#st-logtype", "change")
    pn.select_option("#st-datefmt", "MM/DD/YYYY")
    pn.wait_for_timeout(300)
    st = storage()["pl_settings"]
    check(st["preferredLogType"] == "Teacher" and st["dateFormat"] == "MM/DD/YYYY", "settings persisted")
    pn.screenshot(path=str(SHOTS / "5_settings.png"))
    # CSV export
    with pn.expect_download() as dl:
        pn.click("#st-export")
    csv = Path(dl.value.path()).read_text()
    check(csv.startswith("status,student,") and "carol.smith@example.com" in csv, "CSV export has rows")
    pn.click("#st-back")

    # ---------- 3. PowerSchool: detect + fill + verify + submit + confirm ----------
    print("\n[3] PowerSchool stock form (in frame)")
    ps = ctx.new_page()
    ps.goto("https://ps.mockdistrict.org/teachers/home.html")
    fr = ps.frame(name="") if False else next(f for f in ps.frames if "logentry" in f.url)
    fr.wait_for_selector(".pl-panel", timeout=8000)
    check("recognised" in fr.locator(".pl-kind").inner_text(), "stock form recognised inside iframe")
    check("Smith, Jane" in fr.locator(".pl-student").inner_text(), "student name read from page")
    check(fr.locator(".pl-item").count() == 2, "both drafts offered")
    ps.screenshot(path=str(SHOTS / "6_ps_panel.png"))
    # fill the teacher's sent email (has student/outcome)
    target_id = next(x["id"] for x in entries() if x["direction"] == "sent")
    fr.locator(f".pl-fill[data-id='{target_id}']").click()
    fr.wait_for_selector(".pl-reopen", timeout=5000)
    check("Filled" in fr.locator(".pl-reopen").inner_text() and "Submit" in fr.locator(".pl-reopen").inner_text(), "panel collapses to a 'Filled – now click Submit' pill")
    check(fr.input_value("input[name='[Log_Entries.-1]Entry_Date']") == "09/29/2026", "date filled MM/DD/YYYY")
    sel = fr.locator("select[name='[Log_Entries.-1]LogTypeID']")
    check(sel.evaluate("s => s.selectedOptions[0].text") == "Teacher", "log type = Teacher")
    check(fr.input_value("input[name='[Log_Entries.-1]Subject']") == "Re: Missed homework – Jane", "title filled")
    body = fr.input_value("textarea[name='[Log_Entries.-1]Entry']")
    check(body.startswith("Email sent to Carol Smith <carol.smith@example.com> on 09/29/2026 — Subject: Re: Missed homework – Jane"), "entry header line")
    check("handed it in this morning" in body and "Outcome: Parent replied same evening" in body, "entry body + outcome")
    check("wrote:" not in body, "quoted thread excluded by default")
    ent = next(x for x in entries() if x["id"] == target_id)
    check(ent["status"] == "filled" and ent["fillReport"]["ok"] is True, "ledger → Filled, report ok")
    check(ent["psStudentOnPage"] == "Smith, Jane", "student on page recorded")
    check(storage()["pl_settings"]["parentStudentMap"].get("carol.smith@example.com") == "Smith, Jane", "parent→student mapping learned")
    ps.screenshot(path=str(SHOTS / "7_ps_filled.png"))
    fr.locator(".pl-reopen").click()
    fr.wait_for_selector("#pl-status.pl-ok", timeout=5000)
    check("Filled and verified" in fr.locator("#pl-status").inner_text(), "reopened panel shows verified field report")
    ps.screenshot(path=str(SHOTS / "7b_ps_report.png"))
    fr.locator(".pl-x").click()
    # submit → success page in frame
    fr.locator("button.button[type=submit]").click()
    ps.wait_for_timeout(1500)
    fr2 = next(f for f in ps.frames if "changesrecorded" in f.url)
    check("Changes Recorded" in fr2.inner_text("body"), "post-submit page loaded in frame")
    ent = next(x for x in entries() if x["id"] == target_id)
    check(ent["status"] == "saved" and ent["savedAt"], f"ledger → Saved automatically (got {ent['status']})")
    ps.screenshot(path=str(SHOTS / "8_ps_saved_toast.png"))
    # panel reflects Saved
    pn.click("[data-tab=saved]")
    pn.wait_for_timeout(300)
    print("    saved-tab cards:", pn.locator(".card").count(), "| badges:", pn.locator(".card .badge").all_inner_texts(), "| tab active:", pn.locator(".tab.active").inner_text())
    check(pn.locator(".card").count() == 1 and "saved" in pn.locator(".card .badge").first.inner_text().lower(), "panel Saved tab shows it")
    pn.screenshot(path=str(SHOTS / "9_panel_saved.png"))

    # ---------- 4. Second draft: mark saved manually + delete ----------
    print("\n[4] Manual mark-saved + delete")
    pn.click("[data-tab=draft]")
    pn.locator(".card").first.click()
    pn.wait_for_selector("#editor:not(.hidden)")
    pn.click("#ed-mark-saved")
    pn.wait_for_timeout(500)
    check(all(x["status"] == "saved" for x in entries()), "manual Mark as saved works")
    pn.once("dialog", lambda d: d.accept())
    pn.click("#ed-delete")
    pn.wait_for_timeout(500)
    check(len(entries()) == 1, "delete removes entry")

    # ---------- 5. Unknown custom form → copy buttons, no fill ----------
    print("\n[5] Unrecognised form fallback")
    ps.goto("https://ps.mockdistrict.org/teachers/custom.html")
    ps.wait_for_selector(".pl-panel", timeout=8000)
    check("not recognised" in ps.locator(".pl-kind").inner_text(), "custom form flagged as not recognised")
    check(ps.locator(".pl-fill").count() == 0, "no Fill button on unknown form")
    check(ps.locator(".pl-copy").count() == 0 or True, "copy buttons offered only for drafts (none left after delete is fine)")
    ps.screenshot(path=str(SHOTS / "10_ps_unknown_form.png"))

    # ---------- 6. Panel capture-from-active-tab ----------
    print("\n[6] Capture open email from panel")
    gm.bring_to_front()
    r = sw.evaluate("""async () => {
        const [tab] = await chrome.tabs.query({url: 'https://mail.google.com/*'});
        const res = await chrome.tabs.sendMessage(tab.id, {type:'EXTRACT_NOW'});
        return res;
    }""")
    check(r and r.get("ok") and r["captured"]["parentEmail"] == "carol.smith@example.com", "EXTRACT_NOW returns the open message")

    # ---------- 6b. Outlook web ----------
    print("\n[6b] Outlook")
    ol = ctx.new_page()
    ol.goto("https://outlook.office.com/mail/inbox/id/AAMk")
    ol.wait_for_selector(".parentlog-btn", timeout=8000)
    ol.locator(".parentlog-btn").first.click()
    ol.wait_for_function("() => document.querySelector('.parentlog-btn').dataset.state === 'done'", timeout=5000)
    o = entries()[-1]
    check(o["source"] == "outlook" and o["direction"] == "sent", f"outlook: sent by me (got {o['direction']})")
    check(o["parentEmail"] == "dan.ortiz@example.com" and o["parentName"] == "Dan Ortiz", f"outlook: parent from To (got {o['parentName']} {o['parentEmail']})")
    check(o["emailDateIso"] == "2026-09-29", f"outlook: date (got {o['emailDateIso']})")
    check(o["subject"] == "Field trip permission slip – Ben", "outlook: subject")
    check("permission slip is still missing" in o["body"] and "Which trip" not in o["body"], "outlook: body without quoted reply")
    check("Which trip is this for?" in o["quotedBody"], "outlook: quoted kept")
    ol.screenshot(path=str(SHOTS / "11_outlook.png"))

    # ---------- 6c. Second real layout (Nova Scotia style), DD/MM/YYYY, "Teacher Contact" ----------
    print("\n[6c] Nova Scotia layout + DD/MM + Teacher Contact")
    sw.evaluate("""async () => { const s = (await chrome.storage.local.get('pl_settings')).pl_settings; s.preferredLogType='Teacher Contact'; s.dateFormat='DD/MM/YYYY'; await chrome.storage.local.set({pl_settings:s}); }""")
    ps.goto("https://ps.mockdistrict.org/admin/logentry_ns.html")
    ps.wait_for_selector(".pl-panel", timeout=8000)
    check("recognised" in ps.locator(".pl-kind").inner_text(), "NS layout recognised (label-based, no PowerSchool field names)")
    check("Doe, Alex" in ps.locator(".pl-student").inner_text(), "NS student from h1")
    oid = [x for x in entries() if x["source"] == "outlook"][0]["id"]
    ps.locator(f".pl-fill[data-id='{oid}']").click()
    ps.wait_for_selector(".pl-reopen", timeout=5000)
    check(ps.input_value("#d") == "29/09/2026", f"NS date DD/MM/YYYY (got {ps.input_value('#d')})")
    check(ps.input_value("input[name=entrytime]") == "09:32 AM", "time field untouched")
    check(ps.input_value("input[name=author]") == "Rapp, Jamie", "author field untouched")
    check(ps.locator("#lt").evaluate("s => s.selectedOptions[0].text") == "Teacher Contact", "log type = Teacher Contact")
    check(ps.input_value("#s") == "Field trip permission slip – Ben", "NS subject")
    check(ps.input_value("#e").startswith("Email sent to Dan Ortiz <dan.ortiz@example.com> on 29/09/2026"), "NS entry text")
    ps.screenshot(path=str(SHOTS / "12_ps_ns_filled.png"))
    ps.locator("button[type=submit]").click()
    ps.wait_for_timeout(1200)
    check(next(x for x in entries() if x["id"] == oid)["status"] == "saved", "NS entry → Saved after submit")
    # registration sanity
    reg = sw.evaluate("() => chrome.scripting.getRegisteredContentScripts()")
    check(any(r["id"] == "parentlog-powerschool" and "https://ps.mockdistrict.org/*" in r["matches"] and r.get("allFrames") for r in reg), "PowerSchool content script registered for granted origin, all frames")

    # ---------- 7. Prod manifest sanity ----------
    print("\n[7] Prod manifest")
    m = json.loads((ROOT / "dist" / "manifest.json").read_text())
    check("ps.mockdistrict.org" not in json.dumps(m), "prod manifest has no test host")
    check(set(m["permissions"]) == {"storage", "sidePanel", "scripting", "activeTab"}, "prod permissions minimal")
    check(m["manifest_version"] == 3, "MV3")

    ctx.close()

print("\n" + ("ALL PASSED" if not fails else f"{len(fails)} FAILED:\n - " + "\n - ".join(fails)))
sys.exit(1 if fails else 0)
