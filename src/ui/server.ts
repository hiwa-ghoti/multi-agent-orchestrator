import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadConfig, getProjectRoot } from "../config.js";
import {
  orchestrateLoop,
  orchestrateOnce,
  orchestrateParallel,
} from "../orchestrator.js";
import { runParallel } from "../pool.js";
import { exitCodeForResults } from "../agentRunner.js";
import { saveState } from "../state.js";
import { parseTasksInput, tasksToPlainText } from "../tasksText.js";
import type { TaskItem } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../../public");
const PORT = Number(process.env.UI_PORT || 3847);
const HOST = "127.0.0.1";
const SHOULD_OPEN_BROWSER =
  process.env.UI_OPEN_BROWSER === "1" || process.argv.includes("--open");

function openBrowser(url: string): void {
  const cmd =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) console.error(`ブラウザを開けませんでした: ${err.message}`);
  });
}

type SseClient = {
  id: number;
  res: http.ServerResponse;
};

type RunBody = {
  mode: "once" | "parallel" | "loop";
  prompt?: string;
  maxSteps?: number;
  maxMinutes?: number;
  resume?: boolean;
  tasksFile?: string;
  tasks?: TaskItem[];
  /** Plain text (1 line = 1 task) or JSON. Preferred for the GUI. */
  tasksText?: string;
};

let sseSeq = 0;
const sseClients = new Map<number, SseClient>();
let jobAbort: AbortController | null = null;
let jobRunning = false;

function sendSse(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients.values()) {
    client.res.write(payload);
  }
}

function broadcastLog(text: string): void {
  sendSse("log", { text });
}

function installLogCapture(): () => void {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWrite = process.stdout.write.bind(process.stdout);

  console.log = (...args: unknown[]) => {
    const line = args.map(String).join(" ");
    broadcastLog(`${line}\n`);
    originalLog(...args);
  };
  console.error = (...args: unknown[]) => {
    const line = args.map(String).join(" ");
    broadcastLog(`${line}\n`);
    originalError(...args);
  };
  process.stdout.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
    broadcastLog(
      typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"),
    );
    return (originalWrite as (...a: unknown[]) => boolean)(chunk, ...rest);
  }) as typeof process.stdout.write;

  return () => {
    console.log = originalLog;
    console.error = originalError;
    process.stdout.write = originalWrite;
  };
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function contentType(filePath: string): string {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

async function serveStatic(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  let rel = url.pathname === "/" ? "/index.html" : url.pathname;
  rel = path.normalize(rel).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    res.end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
}

async function handleRun(body: RunBody): Promise<void> {
  if (jobRunning) {
    throw new Error(
      "別の実行が進行中です。先に停止するか、完了を待ってください。",
    );
  }

  const config = loadConfig();
  jobAbort = new AbortController();
  jobRunning = true;
  const restoreLogs = installLogCapture();
  sendSse("status", { running: true, mode: body.mode });

  try {
    let code = 0;
    if (body.mode === "once") {
      const prompt = body.prompt?.trim();
      if (!prompt) throw new Error("プロンプトを入力してください。");
      code = await orchestrateOnce(config, prompt, jobAbort.signal);
    } else if (body.mode === "parallel") {
      let tasks: TaskItem[] | null = null;
      if (body.tasksText?.trim()) {
        tasks = parseTasksInput(body.tasksText);
      } else if (body.tasks && body.tasks.length > 0) {
        tasks = body.tasks;
      }

      if (tasks) {
        console.log(`[parallel] ${tasks.length} タスクを同時実行します`);
        for (const task of tasks) {
          console.log(`  - ${task.id ?? "?"}: ${task.prompt.slice(0, 80)}`);
        }
        const results = await runParallel(config, tasks, jobAbort.signal);
        await saveState(config.statePath, {
          mode: "parallel",
          lastPrompt: "ui-inline-tasks",
          step: results.length,
          lastStatus: results.every((r) => r.status === "finished")
            ? "finished"
            : "mixed",
        });
        code = exitCodeForResults(results);
      } else {
        const tasksFile =
          body.tasksFile?.trim() ||
          path.join(getProjectRoot(), "examples", "tasks.sample.json");
        code = await orchestrateParallel(config, tasksFile, jobAbort.signal);
      }
    } else if (body.mode === "loop") {
      const prompt = body.prompt?.trim();
      if (!prompt) throw new Error("プロンプトを入力してください。");
      const maxSteps = Number(body.maxSteps ?? 5);
      const maxMinutes = Number(body.maxMinutes ?? 30);
      if (!Number.isFinite(maxSteps) || maxSteps < 1) {
        throw new Error("maxSteps は 1 以上にしてください。");
      }
      if (!Number.isFinite(maxMinutes) || maxMinutes <= 0) {
        throw new Error("maxMinutes は正の数にしてください。");
      }
      code = await orchestrateLoop(
        config,
        {
          prompt,
          maxSteps,
          maxMinutes,
          resume: Boolean(body.resume),
        },
        jobAbort.signal,
      );
    } else {
      throw new Error(`未知のモード: ${String(body.mode)}`);
    }

    sendSse("done", { ok: code === 0, code });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    broadcastLog(`\nエラー: ${message}\n`);
    sendSse("done", {
      ok: false,
      code: message.includes("中断") ? 130 : 1,
      error: message,
    });
  } finally {
    restoreLogs();
    jobRunning = false;
    jobAbort = null;
    sendSse("status", { running: false });
  }
}

function handleSse(req: http.IncomingMessage, res: http.ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  const id = ++sseSeq;
  sseClients.set(id, { id, res });
  sendSse("status", { running: jobRunning });
  req.on("close", () => {
    sseClients.delete(id);
  });
}

async function handleSampleTasks(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  const samplePath = path.join(
    getProjectRoot(),
    "examples",
    "tasks.sample.json",
  );
  const raw = await fs.readFile(samplePath, "utf8");
  const format = url.searchParams.get("format") || "text";
  if (format === "json") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(raw);
    return;
  }
  const tasks = parseTasksInput(raw);
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(tasksToPlainText(tasks));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

    if (req.method === "GET" && url.pathname === "/api/events") {
      handleSse(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/sample-tasks") {
      await handleSampleTasks(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/status") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ running: jobRunning }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/cancel") {
      if (jobAbort) {
        jobAbort.abort();
        broadcastLog("\n[ui] 停止を要求しました\n");
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/run") {
      if (jobRunning) {
        res.writeHead(409, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "別の実行が進行中です。" }));
        return;
      }
      const body = (await readJsonBody(req)) as RunBody;
      res.writeHead(202, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ accepted: true }));
      void handleRun(body);
      return;
    }

    if (req.method === "GET") {
      await serveStatic(req, res);
      return;
    }

    res.writeHead(405).end("Method not allowed");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: message }));
  }
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  console.log(`UI server listening on ${url}`);
  console.log("ブラウザで開いて once / parallel / loop を実行できます。");
  console.log("停止: Ctrl+C");
  if (SHOULD_OPEN_BROWSER) {
    openBrowser(url);
  }
});
