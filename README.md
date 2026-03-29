# ShopifyApp

Shopify の顧客・注文・商品データをローカルに同期し、会員加入とイベント申込を分析するための作業用プロジェクトです。

## 現在の構成

- `prisma/schema.prisma`: ローカル分析DBのスキーマ
- `scripts/shopify-preflight.js`: DB と Shopify 接続確認
- `scripts/shopify-sync.js`: Shopify から顧客・商品・注文を同期
- `scripts/shopify-config-cli.js`: manifest ベースで商品・価格・顧客資格を dry-run / apply
- `scripts/rebuild-analytics.js`: 会員分析用テーブルを再構築
- `src/lib/`: Shopify API、分類、分析ロジック
- `docs/shopify-member-bi-mvp.md`: MVP 設計メモ
- `docs/shopify-app-handoff-log.md`: ここまでの会話・判断・実装状況の引き継ぎログ

## 次にやること

1. `npm install`
2. `.env` に Shopify の `myshopify.com` ドメインと認証情報を入れる
3. `DATABASE_URL` を有効な PostgreSQL に向ける
4. `npm run db:push`
5. `npm run shopify:preflight`
6. `npm run shopify:sync`
7. `npm run shopify:rebuild`

## CLI 運用

GUI での個別更新を減らしたい場合は、manifest ベースの CLI を使います。

1. [config/shopify-config.sample.json](/Users/takashiwada/Documents/CodeX/ShopifyApp/config/shopify-config.sample.json) を複製して編集
2. `npm run shopify:config -- validate --manifest ./config/your-file.json`
3. `npm run shopify:config -- plan --manifest ./config/your-file.json --report ./docs/your-plan.json`
4. 差分を確認してから `npm run shopify:config -- apply --manifest ./config/your-file.json --report ./docs/your-apply.json`

詳細は [docs/shopify-cli-ops-workflow.md](/Users/takashiwada/Documents/CodeX/ShopifyApp/docs/shopify-cli-ops-workflow.md) を参照してください。

## UI の確認

1. `npm run dev`
2. ブラウザで `http://127.0.0.1:3007` または `http://shopify-bi.localhost:3007` を開く

表示できるもの:

- Summary: 会員数 / active 会員数 / イベント申込数 / 会員購入数
- Timeline: 月別加入数 / 月別イベント申込数
- Events: イベント別申込件数
- Members: メンバー一覧と詳細

## 補足

- もともとの `/Users/takashiwada/Documents/CodeX/DocumentPrint` から、Shopify BI 関連ファイルのみを分離して作成したディレクトリです
- チャット履歴そのものはファイルとして移せないため、この README に現在位置を要約しています
- Shopify 系スクリプトは `npm run shopify:*` で `.env` を自動読込するようにしてあります
- ローカル検証では `127.0.0.1:54322` の PostgreSQL を利用したため、必要に応じて `.env` の `DATABASE_URL` を調整してください
# dev/prod separation confirmed 2026年 3月30日 月曜日 08時55分08秒 JST
