import type { AppConfig, LoopOptions, WorkerResult } from "./types.js";
import {
  assertNotAborted,
  createLocalAgent,
  disposeAgent,
  formatWorkerResult,
  resumeLocalAgent,
  runPrompt,
} from "./agentRunner.js";
import { loadState, saveState } from "./state.js";

const FOLLOW_UP_TEMPLATE = (step: number, maxSteps: number) =>
  [
    `これは自律ループのステップ ${step}/${maxSteps} です。`,
    "前回までの文脈を踏まえ、ポートフォリオ向けの小さな改善を1つだけ実行してください。",
    "すでに十分整っている場合は、何をしたか／なぜ止めてよいかを短く報告してください。",
  ].join("\n");

export async function runLoop(
  config: AppConfig,
  options: LoopOptions,
  signal: AbortSignal,
): Promise<WorkerResult[]> {
  const startedAt = Date.now();
  const maxMs = options.maxMinutes * 60_000;
  const results: WorkerResult[] = [];

  const previous = await loadState(config.statePath);
  let agent =
    options.resume && previous.agentId
      ? await resumeLocalAgent(config, previous.agentId)
      : await createLocalAgent(config, "loop-worker");

  let step = options.resume ? previous.step : 0;

  console.log(
    `[loop] agent=${agent.agentId} resume=${Boolean(options.resume && previous.agentId)} maxSteps=${options.maxSteps} maxMinutes=${options.maxMinutes}`,
  );

  try {
    await saveState(config.statePath, {
      agentId: agent.agentId,
      mode: "loop",
      lastPrompt: options.prompt,
      step,
    });

    while (step < options.maxSteps) {
      assertNotAborted(signal);
      if (Date.now() - startedAt >= maxMs) {
        console.log(`[loop] 時間上限 (${options.maxMinutes} 分) に達したので停止します。`);
        break;
      }

      step += 1;
      const prompt =
        step === 1
          ? options.prompt
          : `${FOLLOW_UP_TEMPLATE(step, options.maxSteps)}\n\n初期ゴール:\n${options.prompt}`;

      console.log(`\n[loop] === step ${step}/${options.maxSteps} ===`);
      const result = await runPrompt(agent, prompt, `loop-step-${step}`, signal);
      results.push(result);
      console.log(`[loop] ${formatWorkerResult(result)}`);

      await saveState(config.statePath, {
        agentId: agent.agentId,
        mode: "loop",
        lastPrompt: options.prompt,
        step,
        lastRunId: result.runId || null,
        lastStatus: result.status,
      });

      if (result.status === "startup_error" || result.status === "error") {
        console.error("[loop] エラーのためループを停止します。");
        break;
      }
      if (result.status === "cancelled") {
        console.log("[loop] キャンセルされたため停止します。");
        break;
      }
    }
  } finally {
    await disposeAgent(agent);
  }

  return results;
}
