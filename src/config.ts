import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppConfig } from "./types.js";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

loadDotenv({ path: path.join(projectRoot, ".env"), quiet: true });

function resolveCwd(raw: string | undefined): string {
  const value = raw?.trim() || process.cwd();
  return path.resolve(value);
}

export function loadConfig(): AppConfig {
  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      [
        "CURSOR_API_KEY が設定されていません。",
        "1. https://cursor.com/dashboard/integrations で API キーを取得",
        "2. .env.example を .env にコピーして CURSOR_API_KEY=... を記入",
      ].join("\n"),
    );
  }

  return {
    apiKey,
    modelId: process.env.CURSOR_MODEL?.trim() || "composer-2.5",
    cwd: resolveCwd(process.env.AGENT_CWD),
    statePath: path.join(projectRoot, "data", "state.json"),
  };
}

export function getProjectRoot(): string {
  return projectRoot;
}
