const tabs = [...document.querySelectorAll(".tab")];
const form = document.getElementById("run-form");
const promptEl = document.getElementById("prompt");
const tasksEl = document.getElementById("tasks-json");
const maxStepsEl = document.getElementById("max-steps");
const maxMinutesEl = document.getElementById("max-minutes");
const resumeEl = document.getElementById("resume");
const runBtn = document.getElementById("run-btn");
const cancelBtn = document.getElementById("cancel-btn");
const statusPill = document.getElementById("status-pill");
const logEl = document.getElementById("log");
const clearBtn = document.getElementById("clear-log");
const loadSampleBtn = document.getElementById("load-sample");

let mode = "once";
let running = false;

function setMode(next) {
  mode = next;
  tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.mode === mode);
  });
  document.querySelectorAll("[data-show]").forEach((node) => {
    const modes = node.getAttribute("data-show").split(/\s+/);
    node.classList.toggle("hidden", !modes.includes(mode));
  });
}

function setRunning(next) {
  running = next;
  runBtn.disabled = next;
  cancelBtn.disabled = !next;
  statusPill.textContent = next ? "実行中" : "待機中";
  statusPill.classList.toggle("running", next);
}

function appendLog(text) {
  logEl.textContent += text;
  logEl.scrollTop = logEl.scrollHeight;
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => setMode(tab.dataset.mode));
});

clearBtn.addEventListener("click", () => {
  logEl.textContent = "";
});

loadSampleBtn.addEventListener("click", async () => {
  const res = await fetch("/api/sample-tasks");
  const text = await res.text();
  tasksEl.value = text;
});

cancelBtn.addEventListener("click", async () => {
  await fetch("/api/cancel", { method: "POST" });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (running) return;

  const body = { mode };

  if (mode === "once" || mode === "loop") {
    body.prompt = promptEl.value;
  }
  if (mode === "loop") {
    body.maxSteps = Number(maxStepsEl.value);
    body.maxMinutes = Number(maxMinutesEl.value);
    body.resume = resumeEl.checked;
  }
  if (mode === "parallel") {
    const raw = tasksEl.value.trim();
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        body.tasks = Array.isArray(parsed) ? parsed : parsed.tasks;
        if (!Array.isArray(body.tasks)) {
          appendLog("エラー: tasks 配列が見つかりません。\n");
          return;
        }
      } catch (err) {
        appendLog(`エラー: JSON が不正です (${err.message})\n`);
        return;
      }
    }
  }

  appendLog(`\n--- ${mode} 開始 ---\n`);
  setRunning(true);
  const res = await fetch("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    appendLog(`エラー: ${err.error || res.statusText}\n`);
    setRunning(false);
  }
});

function connectEvents() {
  const es = new EventSource("/api/events");
  es.addEventListener("log", (event) => {
    const data = JSON.parse(event.data);
    appendLog(data.text);
  });
  es.addEventListener("status", (event) => {
    const data = JSON.parse(event.data);
    setRunning(Boolean(data.running));
  });
  es.addEventListener("done", (event) => {
    const data = JSON.parse(event.data);
    appendLog(
      `\n--- 終了 code=${data.code}${data.ok ? " (ok)" : ""}${
        data.error ? ` error=${data.error}` : ""
      } ---\n`,
    );
    setRunning(false);
  });
  es.onerror = () => {
    // Browser will retry EventSource automatically.
  };
}

setMode("once");
promptEl.value =
  "このリポジトリの構成を短く説明して。ファイルは変えないで。";
connectEvents();
