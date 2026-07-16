#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { createAbortHandle } from "./agentRunner.js";
import {
  orchestrateLoop,
  orchestrateOnce,
  orchestrateParallel,
} from "./orchestrator.js";

function printHelp(): void {
  console.log(`
multi-agent-orchestrator — Cursor エージェントを複数／連続で動かす CLI

使い方:
  npm run agent -- once "<プロンプト>"
  npm run agent -- parallel <tasks.json>
  npm run agent -- loop [--max-steps N] [--max-minutes M] [--resume] "<プロンプト>"
  npm run agent -- help

例:
  npm run agent -- once "このリポジトリの README を初学者向けに整えて"
  npm run agent -- parallel examples/tasks.sample.json
  npm run agent -- loop --max-steps 3 --max-minutes 15 "小さな改善を続けて"

環境変数:
  CURSOR_API_KEY   必須。Cursor Dashboard → Integrations で取得
  CURSOR_MODEL     任意。既定: composer-2.5
  AGENT_CWD        任意。エージェントが作業するディレクトリ（既定: カレント）
`.trim());
}

function parseArgs(argv: string[]): {
  command: string;
  prompt?: string;
  tasksFile?: string;
  maxSteps: number;
  maxMinutes: number;
  resume: boolean;
} {
  const [command = "help", ...rest] = argv;
  let maxSteps = 5;
  let maxMinutes = 30;
  let resume = false;
  const positional: string[] = [];

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "--max-steps") {
      maxSteps = Number(rest[++i]);
      continue;
    }
    if (arg === "--max-minutes") {
      maxMinutes = Number(rest[++i]);
      continue;
    }
    if (arg === "--resume") {
      resume = true;
      continue;
    }
    positional.push(arg);
  }

  if (!Number.isFinite(maxSteps) || maxSteps < 1) {
    throw new Error("--max-steps は 1 以上の整数にしてください。");
  }
  if (!Number.isFinite(maxMinutes) || maxMinutes <= 0) {
    throw new Error("--max-minutes は正の数にしてください。");
  }

  return {
    command,
    prompt: positional.join(" ").trim() || undefined,
    tasksFile: positional[0],
    maxSteps,
    maxMinutes,
    resume,
  };
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.command === "help" || parsed.command === "--help" || parsed.command === "-h") {
    printHelp();
    return;
  }

  const abort = createAbortHandle();

  try {
    const config = loadConfig();
    let code = 0;

    if (parsed.command === "once") {
      if (!parsed.prompt) {
        throw new Error('使い方: npm run agent -- once "<プロンプト>"');
      }
      code = await orchestrateOnce(config, parsed.prompt, abort.signal);
    } else if (parsed.command === "parallel") {
      if (!parsed.tasksFile) {
        throw new Error("使い方: npm run agent -- parallel examples/tasks.sample.json");
      }
      code = await orchestrateParallel(config, parsed.tasksFile, abort.signal);
    } else if (parsed.command === "loop") {
      if (!parsed.prompt) {
        throw new Error(
          '使い方: npm run agent -- loop --max-steps 5 "<プロンプト>"',
        );
      }
      code = await orchestrateLoop(
        config,
        {
          prompt: parsed.prompt,
          maxSteps: parsed.maxSteps,
          maxMinutes: parsed.maxMinutes,
          resume: parsed.resume,
        },
        abort.signal,
      );
    } else {
      printHelp();
      throw new Error(`未知のコマンド: ${parsed.command}`);
    }

    process.exitCode = code;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\nエラー: ${message}`);
    process.exitCode = message.includes("中断") ? 130 : 1;
  } finally {
    abort.dispose();
  }
}

void main();
