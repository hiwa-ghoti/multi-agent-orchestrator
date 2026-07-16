# multi-agent-orchestrator

Cursor の AI エージェントを **複数同時** に動かす、または **1体を上限つきで自律的に動かし続ける** ための CLI オーケストレータです。

GitHub ポートフォリオ向けのひな形として、仕組みが説明しやすい最小構成にしています。

---

## できること（3モード）

| コマンド | 何をするか |
|---|---|
| `once` | 1体のエージェントに、1回だけタスクを渡す |
| `parallel` | 複数のエージェントを **同時** に起動して、別々のタスクを実行する |
| `loop` | 1体にタスクを繰り返し送り、回数／時間の上限で止める |

用語の意味:

- **オーケストレータ** … 「どの AI に何をさせるか」を管理する司令塔プログラム（このリポジトリ）
- **Worker** … 実際に作業する 1体の Cursor エージェント
- **自律ループ** … 同じエージェントへ「次の作業」を繰り返し送るモード
- **resume** … 前回の `agentId` を読んで、会話を続きから再開すること

---

## 全体の流れ

```text
あなた (CLI)
    │
    ▼
オーケストレータ (src/)
    ├── once      → Worker 1体
    ├── parallel  → Worker 複数 (同時)
    └── loop      → Worker 1体を繰り返し
              │
              ▼
         data/state.json  (再開用)
```

---

## 必要なもの

1. **Node.js 20 以上**
2. **Cursor API キー**  
   [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations) で取得
3. Cursor の利用枠（API 呼び出しには課金／枠があります）

---

## セットアップ

```bash
# 依存関係を入れる
npm install

# 環境変数ファイルを作る
copy .env.example .env
# （macOS / Linux） cp .env.example .env

# .env を開き、CURSOR_API_KEY=... を自分のキーに書き換える
```

任意の環境変数:

| 変数 | 意味 | 既定 |
|---|---|---|
| `CURSOR_API_KEY` | API キー（必須） | なし |
| `CURSOR_MODEL` | 使うモデル ID | `composer-2.5` |
| `AGENT_CWD` | エージェントが作業するフォルダ | カレントディレクトリ |

型チェック:

```bash
npm run typecheck
```

---

## 使い方

### 1. 単発 (`once`)

```bash
npm run agent -- once "このリポジトリの構成を短く説明して。ファイルは変えないで"
```

### 2. 並列 (`parallel`)

サンプルタスク:

```bash
npm run agent -- parallel examples/tasks.sample.json
```

タスクファイルの形:

```json
{
  "tasks": [
    { "id": "docs", "prompt": "..." },
    { "id": "structure", "prompt": "..." }
  ]
}
```

**重要:** 並列は「エージェントを複数作る」ことで実現しています。  
1体のエージェントに同時に2本の実行を投げると SDK が忙しい状態（`agent_busy`）になるためです。

### 3. 自律ループ (`loop`)

```bash
# 最大 3 回、最大 15 分
npm run agent -- loop --max-steps 3 --max-minutes 15 "小さな改善を続けて。危険な変更はしないで"

# 前回の agentId から続きを再開
npm run agent -- loop --resume --max-steps 2 "前回の続きをして"
```

停止条件（暴走防止）:

- `--max-steps` … 最大ステップ数（既定 5）
- `--max-minutes` … 最大分数（既定 30）
- **Ctrl+C** … 実行中の run をキャンセルして終了

状態は `data/state.json` に保存されます（`.gitignore` 済み）。

---

## ディレクトリ構成

```text
.
├── src/
│   ├── index.ts          # CLI 入口
│   ├── config.ts         # 環境変数
│   ├── orchestrator.ts   # once / parallel / loop の司令塔
│   ├── pool.ts           # 複数 Agent の同時実行
│   ├── loop.ts           # 自律ループ
│   ├── state.ts          # state.json の読み書き
│   ├── agentRunner.ts    # Agent 作成・送信・ストリーム・破棄
│   └── types.ts          # 型定義
├── examples/
│   └── tasks.sample.json # 並列用サンプル
├── data/                 # 実行時の状態（コミットしない）
├── .env.example
└── README.md
```

---

## 終了コード

| コード | 意味 |
|---|---|
| `0` | 成功 |
| `1` | 起動前エラー（キー未設定、設定ミス、`CursorAgentError` など） |
| `2` | 実行は始まったが run が失敗 |
| `130` | Ctrl+C などでキャンセル |

---

## これから（ロードマップ）

このリポジトリは **ひな形（Phase 1）** です。

1. **Phase 2** — README / デモをさらに整え、GitHub に公開してポートフォリオ作品にする
2. **Phase 3** — 「既存リポジトリを直す」ではなく、**新しい小さなプロジェクトを作って GitHub に公開**するモードを追加し、リポジトリ数を増やせるようにする

空のリポジトリを量産すると逆効果なので、Phase 3 では「小さな完成デモ付き」を原則にします。

---

## 注意

- API キーを Git にコミットしないでください（`.env` は ignore 済み）
- ループは必ず上限付きで使ってください（課金・枠に注意）
- 最初は `once` の読み取り専用プロンプトで動作確認するのが安全です

---

## ライセンス

MIT
