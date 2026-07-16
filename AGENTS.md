# AGENTS.md

このリポジトリで作業する AI エージェント向けの短い地図です。人間向けの詳細は `README.md` を見てください。

## プロジェクト概要

- **名前:** multi-agent-orchestrator
- **目的:** Cursor SDK（`@cursor/sdk`）で、エージェントを単発 / 並列 / 自律ループ実行する CLI
- **言語:** TypeScript（Node.js 20+）
- **位置づけ:** GitHub ポートフォリオ用のひな形（Phase 1）

## よく使うコマンド

```bash
# Windows PowerShell で npm.ps1 が弾かれる場合は npm.cmd を使う
npm.cmd run agent -- once "<prompt>"
npm.cmd run agent -- parallel examples/tasks.sample.json
npm.cmd run agent -- loop --max-steps 3 --max-minutes 10 "<prompt>"
npm.cmd run ui                 # http://127.0.0.1:3847 のローカル GUI
npm.cmd run ui:open            # GUI 起動 + ブラウザ自動オープン
# Windows: start-ui.cmd をダブルクリックでも可
npm.cmd run typecheck
npm.cmd run build
```

## ディレクトリ

| パス | 役割 |
|---|---|
| `src/` | CLI・オーケストレータ本体 |
| `src/ui/` | ローカル GUI サーバー |
| `public/` | GUI の静的ファイル |
| `examples/` | 並列用サンプルタスク |
| `data/` | 実行時 state（コミットしない） |
| `.env` | 秘密情報（コミット禁止） |
| `.env.example` | 見本のみ（本物のキーを書かない） |

## 設計上の制約（守ること）

1. **並列は複数 `Agent.create`**。1エージェントに同時に複数 `send` しない（`agent_busy`）
2. **Local 実行が既定**。`local: { cwd }` を明示する
3. **エージェントは必ず dispose**（`finally` / `asyncDispose`）
4. **loop は上限必須**（`maxSteps` / `maxMinutes` / Ctrl+C）
5. **起動失敗と run 失敗を区別**（終了コード 1 と 2）

## やってはいけないこと

- `.env` や API キーをコミット・ログ・Issue・PR に出す
- 既存のユーザーリポジトリへ自動 PR する機能を勝手に追加する（計画 Phase 3 までは「新リポ量産」も未実装のまま）
- クラウド本格運用や外部公開 Web を勝手に広げない（GUI は localhost 専用）
- 空のゴミリポジトリを量産する設計

## 変更時のチェック

- `npm run typecheck` が通ること
- README / AGENTS / SECURITY の説明と実装が食い違わないこと
- 秘密情報は `.env` のみ、見本は `.env.example`
