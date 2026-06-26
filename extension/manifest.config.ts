import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Blackbox",
  version: "0.1.0",
  description:
    "Record a browser tab with synced console logs, network requests, and storage state, then replay it to reproduce bugs.",
  minimum_chrome_version: "116",
  icons: {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png",
  },
  action: {
    default_popup: "popup.html",
    default_title: "Blackbox",
    default_icon: {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png",
    },
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  permissions: [
    "debugger",
    "cookies",
    "tabs",
    "tabCapture",
    "downloads",
    "scripting",
    "offscreen",
    "activeTab",
  ],
  host_permissions: ["<all_urls>"],
  web_accessible_resources: [
    {
      resources: ["offscreen.html"],
      matches: ["<all_urls>"],
    },
  ],
});
