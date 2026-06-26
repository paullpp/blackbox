import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Blackbox",
  version: "0.1.0",
  description:
    "Records the active tab (video) plus console logs, network requests, and storage state, and downloads it as a replayable zip.",
  action: {
    default_popup: "popup.html",
    default_title: "Blackbox",
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
    "storage",
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
