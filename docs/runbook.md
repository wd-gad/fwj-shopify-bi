# fwj-shopify-bi 運用ガイド（Runbook）

**作成日**: 2026-03-30
**対象**: 開発・本番デプロイ・DB 運用

---

## 1. 環境構成

### Railway プロジェクト

| 項目 | production | development |
|------|-----------|-------------|
| Railway プロジェクト | `imaginative-trust` | `imaginative-trust` |
| Railway 環境 | `production` | `development` |
| 対応 GitHub ブランチ | `main` | `dev` |
| 本番 URL | `https://bi.teamfwj.org` | Railway 発行の Preview URL |
| DB ホスト | `gondola.proxy.rlwy.net:38773` | `lovely-celebration` プロジェクトの Postgres |
| DB 名 | `railway` | `railway` |

### ブランチ → 環境の対応

```
main  ──→  production  (bi.teamfwj.org)
dev   ──→  development (Railway Preview URL)
```

**GitHub push → 自動デプロイ（Railway Webhook 連携済み）**

---

## 2. 開発フロー

### 通常の開発手順

```bash
# 1. dev ブランチで作業
git checkout dev

# 2. コードを変更
# ...

# 3. ローカル動作確認
npm run dev
# → http://127.0.0.1:3007

# 4. dev にコミット・プッシュ → development 環境へ自動デプロイ
git push origin dev

# 5. Railway development 環境で動作確認
# → Railway ダッシュボードのデプロイログを確認

# 6. 問題なければ main へマージ → production 自動デプロイ
git checkout main
git merge dev
git push origin main
```

---

## 3. デプロイフロー

### 自動デプロイの仕組み

1. `dev` ブランチへ push → Railway **development** 環境にデプロイ
2. `main` ブランチへ push → Railway **production** 環境にデプロイ
3. デプロイ前に `preDeployCommand` が自動実行される

### preDeployCommand（railway.toml）

```toml
[deploy]
preDeployCommand = "npx prisma migrate deploy"
```

デプロイのたびに `prisma migrate deploy` が実行される。
migration が適用済みなら "No pending migrations to apply." で即終了（副作用なし）。

### デプロイログ確認

```bash
railway logs --deployment
```

確認すべきログ:
- `prisma migrate deploy` が実行されているか
- migration エラーが出ていないか
- `Shopify analytics dashboard running at http://0.0.0.0:8080` が出ているか

---

## 4. Prisma Migration 運用

### 基本ルール

| 操作 | 環境 | コマンド |
|------|------|---------|
| スキーマ変更・migration 作成 | ローカル（.env.development を向けた状態） | `npm run db:migrate` |
| migration の適用状況確認 | ローカル | `npm run db:migrate:status` |
| 本番への migration 適用 | 自動（デプロイ時） | `preDeployCommand` が実行 |

### migration の作り方

```bash
# 1. dev ブランチで schema.prisma を編集
# prisma/schema.prisma を変更

# 2. migration ファイルを生成
npm run db:migrate
# → migration 名を入力するプロンプトが出る（例: add_event_entries_index）
# → prisma/migrations/YYYYMMDDHHMMSS_<name>/migration.sql が生成される

# 3. 生成された migration.sql を確認してから commit
git add prisma/migrations/
git commit -m "db: add migration <説明>"

# 4. dev にプッシュ → development DB に自動適用
git push origin dev

# 5. 動作確認後、main にマージ → production DB に自動適用
git checkout main
git merge dev
git push origin main
```

### migration status の確認

```bash
npm run db:migrate:status
```

出力例:
```
1 migration found in prisma/migrations

No pending migrations to apply.
```

---

## 5. 禁止事項

以下の操作は **いかなる状況でも本番 DB では実施しない**:

| 禁止コマンド | 理由 |
|------------|------|
| `prisma db push` | migration 履歴を作らず DB を直接書き換える。差分管理が崩れる |
| `prisma migrate reset` | DB を全消去してゼロから再構築する。本番データが消える |
| `prisma migrate dev` | development 専用コマンド。本番で実行すると reset の提案をされる場合がある |
| `prisma db seed` | 意図しないデータ投入 |

**本番 DB の変更は必ず migration ファイル経由で行う。**

---

## 6. 環境変数の管理

| 変数 | 管理場所 | 備考 |
|------|---------|------|
| `DATABASE_URL` | Railway ダッシュボード（環境ごと） | production / development で別の DB |
| `SHOPIFY_*` | Railway ダッシュボード | 共通または環境ごとに設定 |
| ローカル開発用変数 | `.env`（gitignore 対象） | リポジトリにコミットしない |

`.env` は `.gitignore` で除外済み。**コミットしないこと。**

---

## 7. 障害時の確認ポイント

### アプリが起動しない

```bash
# デプロイログを確認
railway logs --deployment

# チェックポイント
# - "prisma migrate deploy" でエラーが出ていないか
# - "Shopify analytics dashboard running" が出ているか
# - DB 接続エラー（"Can't reach database server"）が出ていないか
```

### /api/health が 500 を返す

```bash
curl https://bi.teamfwj.org/api/health
# → {"ok": true} なら正常

# 異常なら Railway ダッシュボードでログを確認
```

### migration が適用されていない

```bash
# ローカルで状態を確認
npm run db:migrate:status

# pending の migration がある場合は Railway で手動再デプロイ
# → Railway ダッシュボード > Deployments > Deploy ボタン
```

### デプロイ後にデータが消えた

- `prisma migrate deploy` はデータを削除しない
- `migration.sql` の内容を確認（DROP TABLE が含まれていないか）
- Railway のデプロイログで migration 内容を確認

---

## 8. Railway CLI よく使うコマンド

```bash
# ログを見る（直近のデプロイ）
railway logs --deployment

# 環境を切り替える（development ↔ production）
railway environment

# 環境変数を確認
railway variables

# サービスのステータス確認
railway status
```

---

## 9. プロジェクト構成メモ

```
fwj-shopify-bi/
├── prisma/
│   ├── schema.prisma          # DB スキーマ（ここを編集して migration 作成）
│   └── migrations/
│       └── 0001_init/         # ベースライン migration（既存テーブルの初期スナップショット）
│           └── migration.sql
├── scripts/                   # Shopify 同期・分析スクリプト
├── src/                       # BI ダッシュボードのソース
├── server.js                  # エントリーポイント
├── railway.toml               # Railway デプロイ設定（preDeployCommand を含む）
└── package.json               # npm スクリプト
```

---

## 10. 今後の migration 追加時のチェックリスト

- [ ] `prisma/schema.prisma` の変更内容を確認
- [ ] `npm run db:migrate` で migration ファイルを生成
- [ ] 生成された `migration.sql` の内容を確認（DROP / TRUNCATE がないか）
- [ ] `dev` ブランチにコミット・プッシュ → development DB に適用されるか確認
- [ ] Railway development のデプロイログで "migration applied" を確認
- [ ] `main` にマージ → production DB に適用されるか確認
- [ ] `/api/health` で疎通確認
