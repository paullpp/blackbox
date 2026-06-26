# Chrome Web Store submission guide

Everything you need to publish **Blackbox**. Copy/paste the fields below into the
[Developer Dashboard](https://chrome.google.com/webstore/devconsole).

## 0. Build the upload package

```bash
npm run package:extension     # -> blackbox-extension-v0.1.0.zip (repo root)
```

Upload that zip. (Bump `version` in `extension/manifest.config.ts` before each new upload —
the store rejects re-uploads of an existing version number.)

## 1. One-time setup

- Register as a Chrome Web Store developer (one-time **$5** fee).
- For a **Private** (domain-only) listing, the account must belong to your Google Workspace
  and the item must be published from a group publisher tied to `series.ai`. For an
  **Unlisted** listing (link-only, no domain restriction) no Workspace is needed.

## 2. Store listing fields

**Name**
```
Blackbox
```

**Summary** (132 char max — this is the manifest description)
```
Record a browser tab with synced console logs, network requests, and storage state, then replay it to reproduce bugs.
```

**Category:** Developer Tools  
**Language:** English

**Detailed description** (paste as-is)
```
Blackbox is a flight recorder for browser sessions, built for QA and bug reports.

Click record, reproduce the problem, click stop — Blackbox saves a single .zip that
contains everything an engineer needs to understand what happened:

• A video of the tab
• Every console log, warning, and uncaught error
• All network requests and responses, including headers and bodies
• A snapshot of the page's storage (localStorage, sessionStorage, cookies, IndexedDB)
  at the start and end of the recording

Open the recording in the Blackbox replay viewer and the video plays back with the
console, network, and storage panels synchronized to the timeline. Pause, scrub, and
click any log or request to jump to the exact moment it happened.

Everything stays on your machine. Blackbox has no server and sends no data anywhere —
sharing a recording just means sharing the file.
```

**Privacy policy URL** (required)
```
https://github.com/paullpp/blackbox/blob/master/PRIVACY.md
```

**Store icon:** upload `extension/icons/icon-128.png` (128×128).

**Screenshots:** 1–5 required, each **1280×800** or **640×400** (PNG/JPEG). Suggested shots:
1. The replay viewer mid-playback (run `npm run sample`, `npm run dev:viewer`, drag the zip
   in, open the Network tab with a request detail showing).
2. The viewer's Console tab with the timeline + error markers visible.
3. The extension popup mid-recording (red dot + counts).
Take them at exactly 1280×800 (resize the browser window or use a screenshot tool that crops).

## 3. Privacy practices tab

**Single purpose** (paste)
```
Blackbox records a single browser tab — video plus console logs, network activity, and
storage state — into one file that can be replayed to reproduce and diagnose bugs.
```

**Permission justifications** (one per requested permission):

| Permission | Justification |
|---|---|
| `debugger` | Attaches the Chrome DevTools Protocol to the tab being recorded to capture console messages, uncaught errors, and full network requests/responses. Active only during a recording; detached on stop. |
| `tabCapture` | Captures the video of the tab the user chose to record. |
| `activeTab` | Required by tabCapture; grants access to the active tab when the user starts a recording from the toolbar button. |
| `cookies` | Snapshots the recorded site's cookies (including HttpOnly) at the start and end of a recording so the replay reflects session/auth state. |
| `scripting` | Injects a one-shot script into the recorded tab to read localStorage, sessionStorage, and IndexedDB for the storage snapshot. |
| `downloads` | Saves the assembled recording as a .zip file to the user's computer. |
| `offscreen` | Runs MediaRecorder and assembles the .zip in an offscreen document, because service workers cannot access media APIs or create object URLs. |
| `tabs` | Reads the recorded tab's URL and title for recording metadata and detects when that tab is closed. |
| Host permission `<all_urls>` | The user may record any site, so the extension must be able to capture console/network/storage on whatever origin the recorded tab is on. |

**Data usage declarations:**
- Check that the extension handles **"Website content"** (a recording can contain anything
  on the page).
- Certify all three compliance statements — they are true for Blackbox:
  - ✅ I do not sell or transfer user data to third parties (outside approved use cases).
  - ✅ I do not use or transfer user data for purposes unrelated to the item's single purpose.
  - ✅ I do not use or transfer user data to determine creditworthiness or for lending.
- Blackbox transmits nothing, so there is no "remote code" and no data leaves the device.

## 4. Visibility & distribution

- **Visibility:** **Unlisted** (recommended — installable by anyone with the link, not
  searchable) or **Private** (restricted to `series.ai` members).
- **Distribution:** all regions.

## 5. Review notes

- The `debugger` permission and `<all_urls>` host access draw the most scrutiny; the
  justifications above explain why they're essential. Reviews typically take a few days.
- This is a Manifest V3 extension with no remote code, which keeps review straightforward.
```
