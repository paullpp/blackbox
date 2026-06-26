import type { PopupMessage, RecorderStatus, StatusResponse } from "../types";

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const dot = $("dot");
const toggle = $<HTMLButtonElement>("toggle");
const consoleCount = $("consoleCount");
const networkCount = $("networkCount");
const elapsed = $("elapsed");
const errorBox = $("error");

let state: RecorderStatus["state"] = "idle";
let startEpoch: number | null = null;
let elapsedTimer: number | undefined;

function send(message: PopupMessage): Promise<StatusResponse> {
  return chrome.runtime.sendMessage(message) as Promise<StatusResponse>;
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function render(status: RecorderStatus, error?: string): void {
  state = status.state;
  startEpoch = status.recordingStartEpochMs;
  consoleCount.textContent = String(status.counts.console);
  networkCount.textContent = String(status.counts.network);

  const recording = state === "recording";
  dot.classList.toggle("recording", recording);
  toggle.classList.toggle("stop", recording);

  if (state === "starting") {
    toggle.textContent = "Starting…";
    toggle.disabled = true;
  } else if (state === "stopping") {
    toggle.textContent = "Saving…";
    toggle.disabled = true;
  } else if (recording) {
    toggle.textContent = "Stop & download";
    toggle.disabled = false;
  } else {
    toggle.textContent = "Start recording";
    toggle.disabled = false;
  }

  const msg = error || status.error;
  errorBox.textContent = msg || "";
  errorBox.classList.toggle("hidden", !msg);

  tickElapsed();
}

function tickElapsed(): void {
  window.clearInterval(elapsedTimer);
  if (state === "recording" && startEpoch) {
    const update = () => {
      elapsed.textContent = fmtElapsed(Date.now() - (startEpoch as number));
    };
    update();
    elapsedTimer = window.setInterval(update, 500);
  } else {
    elapsed.textContent = "";
  }
}

async function refresh(): Promise<void> {
  const res = await send({ target: "background", type: "GET_STATUS" });
  render(res.status, res.error);
}

toggle.addEventListener("click", async () => {
  toggle.disabled = true;
  try {
    const res =
      state === "recording"
        ? await send({ target: "background", type: "STOP_RECORDING" })
        : await send({ target: "background", type: "START_RECORDING" });
    render(res.status, res.error);
  } catch (e) {
    await refresh();
    errorBox.textContent = e instanceof Error ? e.message : String(e);
    errorBox.classList.remove("hidden");
  }
});

// Poll while open so counts/elapsed stay live.
void refresh();
window.setInterval(refresh, 1000);
