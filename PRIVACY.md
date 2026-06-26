# Blackbox — Privacy Policy

_Last updated: 2026-06-26_

Blackbox is a browser extension that records a tab you choose so you can replay the
session later to reproduce bugs. **Blackbox does not send your data anywhere.** Everything
it captures stays on your computer.

## What Blackbox captures

Only while you have explicitly started a recording, and only for the single tab you are
recording, Blackbox collects:

- A **video** of the tab.
- **Console output** (logs, warnings, errors, uncaught exceptions).
- **Network requests and responses**, including headers and response bodies.
- A **snapshot of storage** for the recorded site: `localStorage`, `sessionStorage`,
  cookies (including HttpOnly cookies), and a best-effort dump of IndexedDB.

Capture starts when you click **Start recording** and stops when you click **Stop**. When
recording is not active, Blackbox collects nothing.

## How the data is used

When you stop a recording, Blackbox packages everything into a single `.zip` file and
**downloads it to your computer**. That file is the entire output.

## Data transmission and storage

- Blackbox has **no backend server**. It does not transmit, upload, sell, or share your
  data with the developer or any third party.
- There is **no analytics, tracking, or telemetry**.
- The recording `.zip` is stored wherever you save it. Sharing a recording is entirely
  manual — you decide who to send the file to.
- The companion replay viewer is a static web page that reads a `.zip` you open locally,
  in your browser. It also sends nothing anywhere.

## Sensitive content warning

Because a recording faithfully captures the page, it may contain **sensitive information**
— authentication tokens, cookies, personal data, or anything visible on screen or sent over
the network during the recording. Treat recording files as sensitive and share them only
with people authorized to see that data.

## Permissions

Blackbox requests only the permissions required to capture a recording (tab video, console,
network, and storage of the recorded tab) and to save the resulting file. It uses the Chrome
DevTools Protocol (`debugger`) for the duration of a recording and detaches when you stop.

## Contact

Questions about this policy: **plipp@series.ai**.
