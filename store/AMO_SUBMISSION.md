# Firefox Add-on (AMO) submission guide

For [addons.mozilla.org/developers](https://addons.mozilla.org/developers/). Free, no fee.

## 0. Build the two zips you upload

```bash
npm run package:firefox       # -> blackbox-firefox-v0.1.0.zip   (the add-on)
npm run package:firefox-src   # -> blackbox-source.zip           (source for reviewers)
```

- **`blackbox-firefox-v0.1.0.zip`** — the built add-on. `manifest.json` is at the zip root
  (required). This is what gets signed/published.
- **`blackbox-source.zip`** — required because the add-on's JS is bundled by esbuild
  (machine-generated). It's a clean archive of the tracked source (no `node_modules`/`dist`).

Bump `version` in `firefox/manifest.json` before each new upload (AMO rejects duplicate
versions).

## 1. Submit the add-on

1. Sign in → **Submit a New Add-on**.
2. Choose distribution:
   - **On this site (listed):** public/unlisted on AMO, auto-updates, full review.
   - **On your own (unlisted):** AMO signs it and gives you a signed `.xpi` to distribute
     internally (e.g. send to your team or host it). Recommended for an internal QA tool.
3. Upload `blackbox-firefox-v0.1.0.zip`. The validator runs immediately.

## 2. Source code (required)

When asked "Do you use tools that generate/bundle code?" answer **Yes** and upload
`blackbox-source.zip`. Paste these build instructions:

```
Build environment: Node.js 20+, npm 10+.
Steps:
  1. npm install
  2. npm run build:firefox
Output: firefox/dist/  (matches the uploaded add-on exactly)

The Firefox add-on lives in firefox/. It is bundled with esbuild (firefox/build.mjs)
into IIFE files. Mapping of uploaded files -> source:
  background.js   <- firefox/src/background.ts
  content.js      <- firefox/src/content.ts
  page-capture.js <- firefox/src/page-capture.ts
  recorder.js     <- firefox/src/recorder.ts (bundles jszip, an MIT library)
  recorder.html, manifest.json, icons/ are copied as-is.
Shared zip-format types: shared/format.ts. No remote code is loaded or eval'd;
no analytics or network calls are made by the add-on itself.
Public repository: https://github.com/paullpp/blackbox
```

## 3. Listing details

- **Name:** Blackbox
- **Summary:** Record a browser tab with synced console logs, network requests, and storage state, then replay it to reproduce bugs.
- **Category:** Developer Tools
- **Privacy policy:** `https://github.com/paullpp/blackbox/blob/master/PRIVACY.md`
- **Screenshots:** capture the recorder window and the replay viewer (run `npm run sample`
  + `npm run dev:viewer`, drag the zip in).

## 4. Permissions / data disclosure

Permissions requested and why:

| Permission | Why |
|---|---|
| `scripting` | Injects the capture content script into the tab being recorded. |
| `tabs` | Reads the recorded tab's URL/title for metadata; opens the recorder window. |
| `cookies` | Snapshots the recorded site's cookies at start and end of a recording. |
| `downloads` | Saves the assembled recording as a .zip. |
| host `<all_urls>` | The user may record any site, so capture must work on any origin. |

Data handling: Blackbox captures the recorded tab's console/network/storage and a video,
packages them into a local `.zip`, and **transmits nothing** — no servers, analytics, or
third parties. See `PRIVACY.md`.
