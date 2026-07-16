import type { ParallelTasksFile, TaskItem } from "./types.js";

/**
 * Accept either JSON (`{ "tasks": [...] }` / `[...]`) or plain text
 * (one task per line). Bullet markers like `-`, `*`, `・` are stripped.
 */
export function parseTasksInput(raw: string): TaskItem[] {
  const text = raw.trim();
  if (!text) {
    throw new Error("タスクが空です。1行に1つ書くか、JSON を貼ってください。");
  }

  if (text.startsWith("{") || text.startsWith("[")) {
    return parseTasksJson(text);
  }

  return parseTasksPlainText(text);
}

function parseTasksJson(text: string): TaskItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`JSON の解析に失敗しました: ${message}`);
  }

  if (Array.isArray(parsed)) {
    return normalizeTaskList(parsed);
  }

  if (parsed && typeof parsed === "object" && Array.isArray((parsed as ParallelTasksFile).tasks)) {
    return normalizeTaskList((parsed as ParallelTasksFile).tasks);
  }

  throw new Error(
    'JSON 形式が不正です。{ "tasks": [ { "id": "...", "prompt": "..." } ] } または配列を想定しています。',
  );
}

function parseTasksPlainText(text: string): TaskItem[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) =>
      line
        .replace(/^[-*・•]\s+/, "")
        .replace(/^\d+[.)、]\s*/, "")
        .trim(),
    )
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error("有効なタスク行がありません。");
  }

  return lines.map((prompt, index) => ({
    id: `task-${index + 1}`,
    prompt,
  }));
}

function normalizeTaskList(items: unknown[]): TaskItem[] {
  const tasks: TaskItem[] = [];
  for (const [index, item] of items.entries()) {
    if (typeof item === "string") {
      const prompt = item.trim();
      if (!prompt) continue;
      tasks.push({ id: `task-${index + 1}`, prompt });
      continue;
    }
    if (item && typeof item === "object" && "prompt" in item) {
      const prompt = String((item as TaskItem).prompt ?? "").trim();
      if (!prompt) continue;
      const id = String((item as TaskItem).id ?? "").trim() || `task-${index + 1}`;
      tasks.push({ id, prompt });
      continue;
    }
    throw new Error(
      `tasks[${index}] が不正です。文字列か { "id"?, "prompt" } にしてください。`,
    );
  }
  if (tasks.length === 0) {
    throw new Error("tasks 配列が空です。");
  }
  return tasks;
}

export function tasksToPlainText(tasks: TaskItem[]): string {
  return tasks.map((task) => `- ${task.prompt}`).join("\n");
}
