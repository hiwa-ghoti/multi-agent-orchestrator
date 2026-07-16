export type CliCommand = "once" | "parallel" | "loop" | "help";

export interface AppConfig {
  apiKey: string;
  modelId: string;
  cwd: string;
  statePath: string;
}

export interface TaskItem {
  id?: string;
  prompt: string;
}

export interface ParallelTasksFile {
  tasks: TaskItem[];
}

export interface OrchestratorState {
  agentId: string | null;
  mode: CliCommand | null;
  lastPrompt: string | null;
  step: number;
  updatedAt: string;
  lastRunId: string | null;
  lastStatus: string | null;
}

export interface WorkerResult {
  workerId: string;
  agentId: string;
  runId: string;
  status: string;
  result?: string;
  error?: string;
  durationMs?: number;
}

export interface LoopOptions {
  prompt: string;
  maxSteps: number;
  maxMinutes: number;
  resume: boolean;
}

export interface AbortHandle {
  signal: AbortSignal;
  abort: () => void;
}
