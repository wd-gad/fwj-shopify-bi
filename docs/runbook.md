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

## 10. Development Seed

### テーブル別 seed 方針

| テーブル | 方針 | 実行タイミング |
|---------|------|-------------|
| `contest_schedules` | `data/contest-schedules.json` から自動 upsert | **server.js 起動時に自動** |
| `product_classifications` | `reclassify-products.js` で自動生成 | **server.js 起動時に自動** |
| `shopify_products` / `shopify_customers` / `shopify_orders` | `prisma/seed.js` の ダミーデータ | **手動（開発時のみ）** |
| `member_profiles` / `event_entries` / `membership_purchases` | `rebuild-analytics.js` から派生 | **手動（seed 後に実行）** |

### development DB へのセット手順

```bash
# 1. dev ダミーデータを投入（.env に開発DBの DATABASE_URL が設定されていること）
npm run db:seed:dev

# 2. ダミーデータから分析テーブルを構築
npm run shopify:rebuild

# 3. BI ダッシュボードで動作確認
npm run dev
# → http://127.0.0.1:3007
```

### seed データの内容

| 種別 | 内容 | 件数 |
|------|------|------|
| 商品 | 年間会員 × 1、イベントエントリー × 2 | 3 |
| 顧客 | seed-alice / seed-bob / seed-carol（@example.com） | 3 |
| 注文 | Alice（会員+イベント）、Bob（イベント×2）、Carol（イベント） | 3 |

### seed の安全ガード

`prisma/seed.js` は起動時に `DATABASE_URL` の接続先ホストをチェックし、
production ホスト（`gondola.proxy.rlwy.net`）が含まれている場合は **即座に abort** します。

```
[seed] ERROR: DATABASE_URL points to production DB. Aborting.
```

### 禁止事項

| 操作 | 理由 |
|------|------|
| production DB に対して `npm run db:seed:dev` を実行 | seed.js の安全ガードで阻止されるが、そもそも試みない |
| `prisma db seed` を production デプロイの自動処理に含める | `preDeployCommand` には含めない |
| seed データをそのまま本番に反映 | `@example.com` メールやダミー ID は本番には不要 |

---

## 11. バックアップと復元

### バックアップ方法の種類

| 方法 | 頻度 | 保持期間 | 操作場所 |
|------|------|---------|---------|
| Railway 自動バックアップ | 毎日 | 7日間 | Railway ダッシュボード |
| 手動 pg_dump | 任意 | 手元で管理 | `scripts/backup-db.sh` |

### Railway 自動バックアップの確認と復元

1. [Railway ダッシュボード](https://railway.com) → `imaginative-trust` プロジェクト
2. `production` 環境 → Postgres サービスを選択
3. **Backups** タブ → 一覧から日付を選択
4. **Restore** ボタン → 確認してクリック

> ⚠️ Railway からの復元は既存のDBを上書きします。アプリを一時停止するか、停止状態で行うこと。

### 手動バックアップ（pg_dump）

#### 前提: pg_dump のインストール

```bash
# macOS
brew install libpq
brew link --force libpq
# → /usr/local/bin/pg_dump が使えるようになる
```

#### バックアップ取得

```bash
# DATABASE_URL に production の PUBLIC URL を設定して実行
DATABASE_URL="postgresql://postgres:PASS@gondola.proxy.rlwy.net:38773/railway" \
  bash scripts/backup-db.sh

# → backups/YYYY-MM-DD_HHMMSS_railway.dump が作成される
```

production の `DATABASE_PUBLIC_URL` は Railway ダッシュボード → production 環境 → Variables で確認する。

#### バックアップファイルの保管

```
backups/          # .gitignore 対象（リポジトリにコミットしない）
  2026-03-30_120000_railway.dump
  2026-03-29_120000_railway.dump
```

> バックアップファイルには本番データが含まれます。安全な場所（ローカル暗号化ストレージなど）に保管し、外部に公開しないこと。

---

## 12. 復元手順

### ケース別の判断

| 状況 | 対処法 |
|------|-------|
| migration を誤って適用した | migration ロールバック（次セクション）または DB 復元 |
| データを誤って削除・変更した | DB 復元（Railway 自動バックアップまたは pg_dump） |
| アプリが壊れた（DBは正常） | Railway デプロイを前のバージョンに巻き戻す |
| スキーマと DB が不整合になった | DB 復元 → migration 再適用 |

### pg_dump バックアップからの復元

```bash
# 復元先 DB URL（production または空の staging DB）
TARGET_URL="postgresql://postgres:PASS@gondola.proxy.rlwy.net:38773/railway"

# 復元実行
pg_restore \
  --clean \
  --no-acl \
  --no-owner \
  --verbose \
  -d "$TARGET_URL" \
  backups/YYYY-MM-DD_HHMMSS_railway.dump
```

> `--clean` は既存テーブルを DROP してから復元します。実行前にアプリを停止または Railway デプロイを一時停止すること。

### migration との関係

- pg_dump には `_prisma_migrations` テーブルも含まれるため、復元後は migration 履歴も復元される
- 復元後に `prisma migrate status` を実行して整合性を確認する
- 差分 migration がある場合は `prisma migrate deploy` で再適用する

---

## 13. ロールバック戦略

### 判断フロー

```
問題発生
  │
  ├─ DBデータが壊れた/消えた？
  │    → DB 復元（Railway Backups または pg_dump）
  │
  ├─ Migration が間違って適用された？
  │    ├─ データ破壊なし → migration SQL を手動で逆順 DDL 実行
  │    └─ データ破壊あり → DB 復元
  │
  └─ アプリコードのバグ（DBは正常）？
       → Railway ダッシュボード → Deployments → 前のデプロイを Rollback
```

### Migration ロールバックの考え方

Prisma は `migrate down` をサポートしていないため、migration の取り消しは以下のいずれかで行う:

1. **新しい migration で打ち消す**（推奨）
   - 例: `ADD COLUMN` した場合 → `DROP COLUMN` する migration を作成して適用
   - データが残っている場合にも安全

2. **DB 復元**
   - migration 適用前の pg_dump から復元
   - データも migration 適用前の状態に戻る

> ⚠️ `prisma migrate reset` は **本番では絶対に使わない**。全データが消える。

---

## 14. 緊急時フロー（障害対応）

### 本番アプリが応答しない

1. `/api/health` を確認: `curl https://bi.teamfwj.org/api/health`
2. Railway ダッシュボード → production → デプロイログを確認
3. DB 接続エラーが出ている場合 → Postgres サービスのステータスを確認
4. アプリのクラッシュ（コードバグ）の場合 → 前のデプロイに Rollback
5. 解消しない場合 → Railway サポートに問い合わせ

### Migration 適用後に問題が発生した

1. `railway logs --deployment` でエラーを確認
2. 直前の pg_dump バックアップがあるか確認
3. バックアップあり → `pg_restore` で復元 → `prisma migrate status` で確認
4. バックアップなし → Railway 自動バックアップ（前日）から復元
5. 復元後 → `prisma migrate status` → pending があれば `prisma migrate deploy`
6. `/api/health` で疎通確認

### データが誤って変更された

1. 影響範囲を特定（テーブル名・ID・変更内容）
2. Railway Backups から直近のバックアップを確認（最大24h前）
3. 対象テーブルのみ手動で修正できる場合 → 直接 SQL で修正
4. 影響範囲が広い場合 → DB 全体を復元

### アプリコードのロールバック

```bash
# Railway ダッシュボード → production → Deployments
# → 正常だったバージョンの "Rollback" ボタンをクリック
# または GitHub で以前のコミットを cherry-pick して push

git revert <bad-commit-hash>
git push origin main
```

---

## 15. バックアップ運用の注意事項

| 項目 | 注意 |
|------|------|
| バックアップファイルの管理 | `backups/` は `.gitignore` 対象。リポジトリにコミットしない |
| 本番データの扱い | バックアップファイルには全顧客・注文データが含まれる。取扱注意 |
| Railway 自動バックアップ | Hobby プランは **7日間** のみ保持。古い障害は対応不可 |
| 定期手動バックアップ | schema 変更前・大量データ変更前には必ず手動バックアップを取得する |
| 復元テスト | 定期的に development DB で復元テストを行い、バックアップが有効か確認する |

---

## 16. 今後の migration 追加時のチェックリスト

- [ ] `prisma/schema.prisma` の変更内容を確認
- [ ] `npm run db:migrate` で migration ファイルを生成
- [ ] 生成された `migration.sql` の内容を確認（DROP / TRUNCATE がないか）
- [ ] `dev` ブランチにコミット・プッシュ → development DB に適用されるか確認
- [ ] Railway development のデプロイログで "migration applied" を確認
- [ ] `main` にマージ → production DB に適用されるか確認
- [ ] `/api/health` で疎通確認
