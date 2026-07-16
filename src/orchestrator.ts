import fs from "node:fs/promises";
import path from "node:path";
import type { AppConfig, LoopOptions, ParallelTasksFile, TaskItem, WorkerResult } from "./types.js";
import {
  createLocalAgent,
  disposeAgent,
  exitCodeForResults,
  formatWorkerResult,
  runPrompt,
} from "./agentRunner.js";
import { runParallel } from "./pool.js";
import { runLoop } from "./loop.js";
import { saveState } from "./state.js";

export async function runOnce(
  config: AppConfig,
  prompt: string,
  signal: AbortSignal,
): Promise<WorkerResult> {
  const agent = await createLocalAgent(config, "once-worker");
  try {
    await saveState(config.statePath, {
      agentId: agent.agentId,
      mode: "once",
      lastPrompt: prompt,
      step: 1,
    });
    const result = await runPrompt(agent, prompt, "once", signal);
    await saveState(config.statePath, {
      agentId: agent.agentId,
      mode: "once",
      lastPrompt: prompt,
      step: 1,
      lastRunId: result.runId || null,
      lastStatus: result.status,
    });
    console.log(`[once] ${formatWorkerResult(result)}`);
    return result;
  } finally {
    await disposeAgent(agent);
  }
}

export async function loadTasksFile(filePath: string): Promise<TaskItem[]> {
  const absolute = path.resolve(filePath);
  const raw = await fs.readFile(absolute, "utf8");
  const parsed = JSON.parse(raw) as ParallelTasksFile | TaskItem[];
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.tasks)) return parsed.tasks;
  throw new Error(
    `タスクファイルの形式が不正です: ${absolute}\n{ "tasks": [ { "id": "...", "prompt": "..." } ] } を想定しています。`,
  );
}

export async function orchestrateOnce(
  config: AppConfig,
  prompt: string,
  signal: AbortSignal,
): Promise<number> {
  const result = await runOnce(config, prompt, signal);
  return exitCodeForResults([result]);
}

export async function orchestrateParallel(
  config: AppConfig,
  tasksFile: string,
  signal: AbortSignal,
): Promise<number> {
  const tasks = await loadTasksFile(tasksFile);
  console.log(`[parallel] ${tasks.length} タスクを同時実行します`);
  const results = await runParallel(config, tasks, signal);
  await saveState(config.statePath, {
    mode: "parallel",
    lastPrompt: tasksFile,
    step: results.length,
    lastStatus: results.every((r) => r.status === "finished")
      ? "finished"
      : "mixed",
  });
  return exitCodeForResults(results);
}

export async function orchestrateLoop(
  config: AppConfig,
  options: LoopOptions,
  signal: AbortSignal,
): Promise<number> {
  const results = await runLoop(config, options, signal);
  return exitCodeForResults(results);
}
