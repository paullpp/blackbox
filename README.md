# Blackbox — Recorder + Replay

A flight recorder for browser sessions. Two halves that communicate through a single
self-describing **recording zip**:

- **`extension/`** — a Chrome/Edge (Manifest V3) extension QA runs while reproducing a bug.
  It screen-records the active tab and simultaneously captures **console logs**, **network
  requests** (with response bodies), and **storage state** (localStorage, sessionStorage,
  cookies, best-effort IndexedDB) using the Chrome DevTools Protocol. On stop it zips
  everything and downloads it.
- **`viewer/`** — a fully client-side static web app. Drag a recording zip in and it replays
  the video with console/network/storage panels synchronized to the playhead. No server,
  no upload, no auth — sharing a recording just means sending the zip.
- **`shared/`** — `format.ts`, the TypeScript definition of the zip format, imported by both
  halves so the contract has one source of truth.

## Setup

```bash
npm install        # installs workspaces: shared, extension, viewer
```

## Extension

```bash
npm run build:extension          # outputs extension/dist
# or for dev with HMR:
npm run dev:extension
```

Load it:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. **Load unpacked** → select `extension/dist`

Use it:

1. Navigate the tab you want to record.
2. Click the extension icon → **Start recording**. Chrome shows a yellow "extension is
   debugging this browser" banner (expected — that's the DevTools Protocol attaching).
3. Reproduce the bug.
4. Click **Stop**. A `recording-<timestamp>.zip` downloads.

> Capture uses `chrome.debugger`, so only one recording per tab at a time, and DevTools
> can't be open on that tab simultaneously (Chrome allows only one debugger client).

## Viewer

```bash
npm run dev:viewer      # local dev server
npm run build:viewer    # static build -> viewer/dist (host anywhere)
```

Open the app, drag in a `recording-*.zip`, and replay. Seeking the video re-syncs every
panel; clicking any log or request seeks the video to that moment.

Keyboard: **space** play/pause, **←/→** step 1s (hold **shift** for 5s).

### Try it without the extension

Generate a sample recording (no video; logs/network/storage replay on a synthetic timeline)
to exercise the viewer:

```bash
npm run sample        # writes ./sample-recording.zip
npm run dev:viewer    # then drag sample-recording.zip in
```

## The recording format

See `shared/format.ts`. Every event is timestamped as `offsetMs` relative to a single
clock (`recordingStartEpochMs`), and the viewer derives the playhead from the video's
`currentTime`, so video and data stay aligned.
