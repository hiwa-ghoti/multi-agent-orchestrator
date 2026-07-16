import fs from "node:fs/promises";
import path from "node:path";
import type { CliCommand, OrchestratorState } from "./types.js";

const emptyState = (): OrchestratorState => ({
  agentId: null,
  mode: null,
  lastPrompt: null,
  step: 0,
  updatedAt: new Date().toISOString(),
  lastRunId: null,
  lastStatus: null,
});

export async function loadState(statePath: string): Promise<OrchestratorState> {
  try {
    const raw = await fs.readFile(statePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<OrchestratorState>;
    return {
      ...emptyState(),
      ...parsed,
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return emptyState();
    throw err;
  }
}

export async function saveState(
  statePath: string,
  patch: Partial<OrchestratorState> & { mode?: CliCommand | null },
): Promise<OrchestratorState> {
  const current = await loadState(statePath);
  const next: OrchestratorState = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export async function clearAgentId(statePath: string): Promise<void> {
  await saveState(statePath, { agentId: null, step: 0, lastRunId: null });
}
