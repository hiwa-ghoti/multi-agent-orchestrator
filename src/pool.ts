import type { AppConfig, TaskItem, WorkerResult } from "./types.js";
import {
  createLocalAgent,
  disposeAgent,
  formatWorkerResult,
  runPrompt,
} from "./agentRunner.js";
import type { SDKAgent } from "@cursor/sdk";

/**
 * Run multiple independent agents in parallel.
 * One active run per agent — never reuse a single agent for concurrent prompts.
 */
export async function runParallel(
  config: AppConfig,
  tasks: TaskItem[],
  signal: AbortSignal,
): Promise<WorkerResult[]> {
  if (tasks.length === 0) {
    throw new Error("並列タスクが空です。examples/tasks.sample.json を確認してください。");
  }

  const agents: SDKAgent[] = [];
  try {
    const results = await Promise.all(
      tasks.map(async (task, index) => {
        const workerId = task.id?.trim() || `worker-${index + 1}`;
        const agent = await createLocalAgent(config, workerId);
        agents.push(agent);
        console.log(`[pool] created ${workerId} -> ${agent.agentId}`);
        const result = await runPrompt(agent, task.prompt, workerId, signal);
        console.log(`[pool] done ${formatWorkerResult(result)}`);
        return result;
      }),
    );
    return results;
  } finally {
    await Promise.all(agents.map((agent) => disposeAgent(agent)));
  }
}
