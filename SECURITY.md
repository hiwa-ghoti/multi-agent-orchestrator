# Security Policy

## 秘密情報の扱い

このプロジェクトは Cursor API キーでエージェントを起動します。

| 置き場所 | 内容 | Git |
|---|---|---|
| `.env` | **本物の** `CURSOR_API_KEY` | **コミット禁止**（`.gitignore` 済み） |
| `.env.example` | プレースホルダのみ（例: `cursor_...`） | コミット可 |

守ること:

- 本物のキーは **`.env` にだけ** 書く
- `.env.example`・README・Issue・PR・チャットに本物のキーを貼らない
- スクリーンショットにキー全体を写さない

## キーが漏れたとき

1. [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations) で該当キーを削除／無効化する
2. 新しいキーを発行する
3. `.env` だけを新しいキーに更新する
4. 必要なら Git 履歴に残っていないか確認する（`.env.example` に誤って入れた場合など）

## 実行時の注意

- `loop` は課金・利用枠を消費しやすいので、必ず `--max-steps` / `--max-minutes` を付ける
- 本番相当の秘密情報をエージェントの作業ディレクトリに置かない
- 共有 PC では作業後に `.env` の扱いに注意する

## 脆弱性の報告

このリポジトリにセキュリティ上の問題を見つけた場合は、Issue に秘密情報を書かず、リポジトリオーナーへ個別に連絡してください。
