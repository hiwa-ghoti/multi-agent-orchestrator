import { Agent, CursorAgentError, type Run, type SDKAgent } from "@cursor/sdk";
import type { AppConfig, WorkerResult } from "./types.js";

export function createAbortHandle(): {
  signal: AbortSignal;
  abort: () => void;
  dispose: () => void;
} {
  const controller = new AbortController();
  const onSigInt = () => controller.abort();
  process.on("SIGINT", onSigInt);
  process.on("SIGTERM", onSigInt);
  return {
    signal: controller.signal,
    abort: () => controller.abort(),
    dispose: () => {
      process.off("SIGINT", onSigInt);
      process.off("SIGTERM", onSigInt);
    },
  };
}

export function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error("中断されました (Ctrl+C)。");
  }
}

export async function createLocalAgent(
  config: AppConfig,
  name?: string,
): Promise<SDKAgent> {
  return Agent.create({
    apiKey: config.apiKey,
    model: { id: config.modelId },
    name,
    local: { cwd: config.cwd },
  });
}

export async function resumeLocalAgent(
  config: AppConfig,
  agentId: string,
): Promise<SDKAgent> {
  return Agent.resume(agentId, {
    apiKey: config.apiKey,
    model: { id: config.modelId },
    local: { cwd: config.cwd },
  });
}

export async function disposeAgent(agent: SDKAgent | undefined): Promise<void> {
  if (!agent) return;
  try {
    await agent[Symbol.asyncDispose]();
  } catch {
    try {
      agent.close();
    } catch {
      // ignore dispose errors on shutdown
    }
  }
}

async function streamAssistantText(run: Run): Promise<void> {
  if (!run.supports("stream")) return;
  for await (const event of run.stream()) {
    if (event.type === "assistant") {
      for (const block of event.message.content) {
        if (block.type === "text") {
          process.stdout.write(block.text);
        }
      }
    }
  }
}

export async function runPrompt(
  agent: SDKAgent,
  prompt: string,
  workerId: string,
  signal: AbortSignal,
): Promise<WorkerResult> {
  assertNotAborted(signal);

  let run: Run;
  try {
    run = await agent.send(prompt);
  } catch (err) {
    if (err instanceof CursorAgentError) {
      return {
        workerId,
        agentId: agent.agentId,
        runId: "",
        status: "startup_error",
        error: `${err.message} (retryable=${err.isRetryable})`,
      };
    }
    throw err;
  }

  console.log(`[${workerId}] agent=${agent.agentId} run=${run.id}`);

  const onAbort = () => {
    if (run.supports("cancel")) {
      void run.cancel().catch(() => undefined);
    }
  };
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    await streamAssistantText(run);
    if (process.stdout.isTTY) process.stdout.write("\n");

    const result = await run.wait();
    return {
      workerId,
      agentId: agent.agentId,
      runId: result.id,
      status: result.status,
      result: result.result,
      error: result.error?.message,
      durationMs: result.durationMs,
    };
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

export function formatWorkerResult(result: WorkerResult): string {
  const lines = [
    `worker=${result.workerId}`,
    `agent=${result.agentId}`,
    `run=${result.runId || "(none)"}`,
    `status=${result.status}`,
  ];
  if (result.durationMs != null) lines.push(`durationMs=${result.durationMs}`);
  if (result.error) lines.push(`error=${result.error}`);
  if (result.result) lines.push(`result=${truncate(result.result, 500)}`);
  return lines.join(" | ");
}

function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max)}...`;
}

export function exitCodeForResults(results: WorkerResult[]): number {
  if (results.some((r) => r.status === "startup_error")) return 1;
  if (results.some((r) => r.status === "error")) return 2;
  if (results.some((r) => r.status === "cancelled")) return 130;
  return 0;
}
