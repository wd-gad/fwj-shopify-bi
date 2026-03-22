# ShopifyApp Handoff Log

## 目的

Shopify から顧客・注文・商品データを取得し、ローカル完結で会員分析 BI を作る。

主な分析対象:

- どの地域のユーザか
- どの年代・性別のユーザか
- いつメンバーシップに加入したか
- どのイベントにいつ申し込んだか

## 前提として確定したこと

- イベント申込は Shopify 上の `MMDDなんとかイベント` のような商品購入で確定するとみなす
- 年間メンバーシップも Shopify 商品として販売している
- つまり Shopify の注文商品から
  - `membership`
  - `event_entry`
  を意味づけできる

## 設計方針

- Shopify 連携アプリではなく、`会員分析用の小さなDWH + BI` として考える
- まずはローカル完結
- 会員中心で分析する
- Shopify 商品は分類ルールで意味づけする

## 実装したもの

### 1. 設計メモ

- `docs/shopify-member-bi-mvp.md`

内容:

- MVP の全体像
- 推奨スタック
- DB 設計
- 商品分類ルール
- 同期フロー
- 分析画面案

### 2. DB スキーマ

- `prisma/schema.prisma`

主なテーブル:

- `shopify_customers`
- `shopify_orders`
- `shopify_order_items`
- `shopify_products`
- `product_classifications`
- `member_profiles`
- `membership_purchases`
- `event_entries`
- `member_attribute_overrides`
- `sync_runs`

### 3. Shopify 連携コード

- `src/lib/shopify-admin.js`

対応している認証:

- `SHOPIFY_ADMIN_ACCESS_TOKEN`
- `SHOPIFY_API_CLIENT_ID` + `SHOPIFY_API_CLIENT_SECRET`
  - client credentials grant

取得対象:

- customers
- products
- orders
- shop info

### 4. 商品分類ロジック

- `src/lib/shopify-product-classification.js`

分類:

- `membership`
- `event_entry`
- `normal_product`

ルール:

- タグ優先
- タイトルに `メンバー`, `会員`, `membership`
- タイトルが `MMDD` で始まる商品はイベント扱い

### 5. 分析変換ロジック

- `src/lib/member-analytics.js`

できること:

- 年代帯の生成
- 地域推定
- member profile 生成
- membership purchase 生成
- event entry 生成

### 6. 同期スクリプト

- `scripts/shopify-sync.js`

用途:

- Shopify から customers / products / orders を取得して Prisma に保存

### 7. 接続前チェック

- `scripts/shopify-preflight.js`

確認内容:

- `DATABASE_URL` の有無
- Shopify 認証情報の有無
- DB 接続
- Shopify token 取得
- `shop` クエリ疎通

### 8. 分析再構築

- `scripts/rebuild-analytics.js`

用途:

- raw データから `member_profiles`
- `membership_purchases`
- `event_entries`
  を再生成

### 9. 分析 API

- `src/lib/analytics-api.js`

用意した API 用関数:

- `getDashboardSummary`
- `getEventBreakdown`
- `getMembers`
- `getMemberDetail`

## UI について

DocumentPrint 側では一時的に分析 UI も追加したが、ShopifyApp へは UI を移していない。

理由:

- DocumentPrint には既存の印刷アプリ UI があり、責務が混在していた
- ShopifyApp はまず分析基盤を分離する方が管理しやすい

つまり ShopifyApp 側に現在あるのは、主に

- DB
- Shopify 同期
- 分析ロジック
- 設計メモ

であり、ブラウザ UI はまだ独立していない

## Shopify 管理画面で確認したこと

### 既存アプリの状況

- Shopify Admin の `アプリ開発` に既存のレガシーカスタムアプリ `fire` がある
- `fire` はインストール済み
- `API資格情報` 画面では
  - `Admin API access token` は存在する
  - ただし再表示不可
- `APIキー` と `APIシークレットキー` は見える

### fire の scope

確認できた scope:

- `write_customers`
- `read_customers`
- `read_products`
- `read_orders`
- `read_order_edits`
- `read_returns`
- `read_purchase_options`
- `write_order_edits`
- `write_products`
- `write_publications`
- `read_publications`

不足または未確認:

- `read_all_orders`

### そこからの判断

- `fire` はこの BI に必要な基本 scope は満たしている
- しかし access token の実値が再表示できない
- `fire` を再インストールして token を取り直すと、既存システムへ影響するリスクがある
- そのため既存 token を見つけられない場合は、新しい app を作る方が安全

## 新しく作成した Dev Dashboard app

作成した app 名:

- `FWJ Member BI Local`

Dev Dashboard で設定した/しようとしていた内容:

- app 名: `FWJ Member BI Local`
- App URL: `https://shopify.dev/apps/default-app-home`
- 埋め込み: オフ推奨
- Webhook API バージョン: `2026-01`
- scope:
  - `read_all_orders`
  - `read_customers`
  - `read_orders`
  - `read_products`

その後:

- `Client ID`
- `Client secret`

が確認できる状態まで進んだ

## セキュリティ上の注意

- `Client secret` はチャットに貼らない
- `Admin API access token` もチャットに貼らない
- `.env` にローカルで設定する
- もし誤って公開場所に貼った場合は再生成する

## `.env` に入れる予定の値

```env
DATABASE_URL="postgresql://..."
SHOPIFY_STORE_DOMAIN="xxxx.myshopify.com"
SHOPIFY_API_CLIENT_ID="..."
SHOPIFY_API_CLIENT_SECRET="..."
SHOPIFY_API_VERSION="2025-10"
```

補足:

- `SHOPIFY_STORE_DOMAIN` は独自ドメインではなく `myshopify.com` 側
- 旧 app を使う場合は `SHOPIFY_ADMIN_ACCESS_TOKEN` 方式でも対応済み

## 実データ接続の実行順

```bash
npm run db:push
npm run shopify:preflight
npm run shopify:sync
npm run shopify:rebuild
```

## ShopifyApp ディレクトリへ移したもの

新しい作業ディレクトリ:

- `/Users/takashiwada/Documents/CodeX/ShopifyApp`

移行済みファイル:

- `.env`
- `.env.example`
- `.gitignore`
- `package.json`
- `package-lock.json`
- `README.md`
- `docs/shopify-member-bi-mvp.md`
- `prisma/schema.prisma`
- `scripts/shopify-preflight.js`
- `scripts/shopify-sync.js`
- `scripts/rebuild-analytics.js`
- `src/lib/analytics-api.js`
- `src/lib/member-analytics.js`
- `src/lib/prisma.js`
- `src/lib/shopify-admin.js`
- `src/lib/shopify-product-classification.js`

## ShopifyApp 側でまだ未着手のもの

- 独立した UI サーバー or Web UI
- イベント詳細画面
- CSV エクスポート
- 属性補正 UI

## 直近の次アクション

1. `/Users/takashiwada/Documents/CodeX/ShopifyApp/.env` に実際の Shopify 情報を入れる
2. `DATABASE_URL` を有効な PostgreSQL に向ける
3. `npm run db:push`
4. `npm run shopify:preflight`
5. 問題なければ `npm run shopify:sync`
6. その後 `npm run shopify:rebuild`

## このログの目的

このファイルは、元チャットで合意した設計・実装・判断・未完了事項を、移行先ディレクトリで前提共有できるようにするための handoff 用ログである。
