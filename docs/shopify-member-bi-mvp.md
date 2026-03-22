# Shopify会員分析BIアプリ MVP設計メモ

## 位置づけ

このドキュメントは、Shopifyの商品購入データをもとに、

- 年間メンバーシップ加入
- イベント申込
- 会員属性分析

をローカル完結で扱うための、最初の実装方針をまとめたものです。

前提は以下です。

- イベント申込は Shopify 上の `MMDDなんとかイベント` のような商品購入で確定する
- 年間メンバーシップも Shopify 商品として販売している
- 会員属性の一部は Shopify 顧客情報や購入時入力情報から取得する
- まずはローカルPC上で完結する分析ツールとして作る

## 目標

最初のMVPでは、次の問いに答えられる状態を目指します。

- どの地域のユーザが多いか
- どの年代・性別のユーザが多いか
- いつメンバーシップに加入したか
- どのイベントに、いつ申し込んだか
- メンバー加入者のうち、どの属性のユーザがどのイベントへ参加しているか

## 全体構成

ローカル完結版は、次の5層で考えると実装しやすいです。

1. Shopify取得
   - Customers
   - Orders
   - Products
   - Variants

2. 生データ保存
   - Shopify APIの結果をほぼそのまま保存
   - 再同期やデバッグに使う

3. 整形・意味づけ
   - 注文商品を `membership` / `event_entry` / `normal_product` に分類
   - 商品名からイベント日やイベント名を抽出
   - 顧客の住所・年齢帯などを分析しやすい形へ正規化

4. 分析用モデル
   - 会員単位の属性
   - メンバー加入履歴
   - イベント申込履歴
   - 集計しやすい派生テーブル

5. ローカルBI画面
   - 絞り込み
   - 一覧
   - グラフ
   - CSV出力

## 推奨スタック

MVPとしては次の構成が現実的です。

- フロント: Next.js
- API/バッチ: Node.js
- DB: PostgreSQL
- ORM: Prisma
- グラフ: Recharts または ECharts

補足:

- データ量がまだ小さいなら SQLite でも始められます
- ただし会員分析を続けるなら PostgreSQL のほうが後で楽です
- 既存のローカルサーバー式運用とも相性が良いです

## データモデル

分析用に重要なのは「注文」ではなく「会員」です。
そのため、会員を中心にテーブルを組みます。

### 1. 生データテーブル

#### `shopify_customers`

- `shopify_customer_id`
- `email`
- `first_name`
- `last_name`
- `phone`
- `tags`
- `state`
- `default_address_json`
- `raw_json`
- `created_at`
- `updated_at`
- `synced_at`

#### `shopify_orders`

- `shopify_order_id`
- `shopify_customer_id`
- `order_number`
- `email`
- `financial_status`
- `fulfillment_status`
- `currency`
- `subtotal_price`
- `total_price`
- `ordered_at`
- `raw_json`
- `synced_at`

#### `shopify_order_items`

- `shopify_order_item_id`
- `shopify_order_id`
- `product_id`
- `variant_id`
- `sku`
- `title`
- `variant_title`
- `quantity`
- `price`
- `vendor`
- `product_type`
- `raw_json`

#### `shopify_products`

- `shopify_product_id`
- `title`
- `handle`
- `product_type`
- `tags`
- `status`
- `raw_json`
- `updated_at`
- `synced_at`

### 2. マスタ/変換テーブル

#### `product_classifications`

商品を分析上の意味に変換するためのテーブルです。

- `shopify_product_id`
- `classification`
  - `membership`
  - `event_entry`
  - `normal_product`
  - `ignore`
- `event_name`
- `event_date`
- `membership_plan_name`
- `is_active`
- `notes`

ポイント:

- Shopifyの商品タイトルだけで毎回判定しない
- 途中で命名規則が変わっても、このテーブルで吸収する
- 最初は自動判定 + 手修正のハイブリッド運用が安全

#### `member_profiles`

分析対象の主テーブルです。

- `member_id`
- `shopify_customer_id`
- `email`
- `full_name`
- `gender`
- `birth_date`
- `age_band`
- `prefecture`
- `region`
- `joined_at`
- `first_membership_order_id`
- `current_membership_status`
- `last_membership_expires_at`
- `created_at`
- `updated_at`

補足:

- `member_id` は独自採番にする
- `age_band` は保存してもよいが、再計算可能にしておく
- `joined_at` は「最初のメンバーシップ購入日」と定義するのが分かりやすい

#### `membership_purchases`

- `membership_purchase_id`
- `member_id`
- `shopify_order_id`
- `shopify_order_item_id`
- `membership_plan_name`
- `purchased_at`
- `starts_at`
- `expires_at`
- `status`

#### `event_entries`

- `event_entry_id`
- `member_id`
- `shopify_order_id`
- `shopify_order_item_id`
- `event_name`
- `event_date`
- `applied_at`
- `quantity`
- `status`

### 3. 任意の補助テーブル

#### `member_attribute_overrides`

Shopifyだけで足りない属性を補うための手修正テーブルです。

- `member_id`
- `gender_override`
- `birth_date_override`
- `prefecture_override`
- `notes`
- `updated_at`

このテーブルがあると、現場運用で不足データを少しずつ補正できます。

## 商品分類ルール

MVPでは、厳密なAI判定よりも「手で追える単純ルール」が向いています。

### 基本ルール

1. 商品タグに `membership` があれば `membership`
2. 商品タグに `event` があれば `event_entry`
3. タイトルに `メンバー` `会員` `membership` が含まれれば `membership`
4. タイトルが `^[0-1][0-9][0-3][0-9]` で始まる場合は `event_entry`
5. それ以外は `normal_product`

### イベント商品の推奨命名

できれば Shopify 側の商品名は次のように揃えると扱いやすいです。

- `0315 Spring Cup 東京`
- `0420 関西タイムトライアル`

このルールなら以下を抽出しやすくなります。

- `event_date`
- `event_name`
- 地域名をイベント名から補助抽出

### 重要な運用方針

- 商品名パース結果を正としない
- 正式な分析値は `product_classifications` に保存した値を使う
- Shopifyの商品運用を変えても、分析側を壊さない

## 会員定義

MVPでは次のように定義するとシンプルです。

- 会員 = Shopify customer に紐づく人物
- 入会日 = 初回のメンバーシップ商品購入日
- イベント申込日 = イベント商品を含む注文の注文日

### 追加で決めておくべきルール

- 年間会員の有効期限をどう計算するか
  - 購入日から365日
  - あるいはシーズン終端日固定
- 返金注文をどう扱うか
  - `financial_status` で除外
- 同じイベントを複数回買った場合の扱い
  - 再申込
  - 重複
  - 数量反映

## 同期処理の流れ

最初はバッチ処理で十分です。

### 初回同期

1. Customers 全件取得
2. Orders 全件取得
3. Products 全件取得
4. order_items 展開
5. 商品分類ルール適用
6. `member_profiles` 更新
7. `membership_purchases` 生成
8. `event_entries` 生成

### 日次同期

1. 前回同期時刻以降に更新された Customers / Orders / Products を取得
2. 対象データのみ upsert
3. 対象会員の分析用テーブルを再計算
4. 同期ログを保存

### 推奨補助テーブル

#### `sync_runs`

- `sync_run_id`
- `started_at`
- `finished_at`
- `status`
- `target`
- `records_fetched`
- `error_message`

## 主要な分析画面

MVPでは画面を増やしすぎず、4画面くらいに絞るのが良いです。

### 1. ダッシュボード

- 総会員数
- 有効会員数
- 月別新規加入数
- 月別イベント申込数
- 直近イベントの申込人数

### 2. 会員一覧

絞り込み:

- 地域
- 都道府県
- 年代
- 性別
- 入会期間
- 会員ステータス

表示:

- 氏名
- メール
- 地域
- 年代
- 性別
- 入会日
- 累計イベント申込数
- 最終申込日

### 3. イベント分析

- イベント別申込人数
- イベント別の地域構成
- イベント別の年代構成
- イベント別の性別構成
- イベント別の会員/非会員比率

### 4. 会員コホート分析

- 入会月別の人数
- 入会後30日以内のイベント申込率
- 入会後90日以内のイベント申込率
- 継続更新率

## MVPで最初に作るSQL/集計イメージ

最初は凝った機械学習ではなく、単純で強い集計から始めるのが良いです。

### 地域 x 年代 x 性別の会員数

- `member_profiles` を軸に集計

### イベント別申込人数

- `event_entries` を `event_name`, `event_date` で group by

### 入会後初回イベント申込までの日数

- `joined_at` と `min(applied_at)` の差分

### 会員別イベント参加回数

- `member_id` ごとの `event_entries` 件数

## APIの切り方

ローカル完結でも、画面と同期処理は分けておくと保守しやすいです。

### 管理系

- `POST /api/shopify/sync/customers`
- `POST /api/shopify/sync/orders`
- `POST /api/shopify/sync/products`
- `POST /api/shopify/rebuild-analytics`

### 閲覧系

- `GET /api/dashboard/summary`
- `GET /api/members`
- `GET /api/members/:id`
- `GET /api/events`
- `GET /api/events/:id`

## Shopify APIで最低限取る項目

実装前に、以下の取得可否は確認しておくと安全です。

- 顧客ID
- 氏名
- メール
- 電話番号
- デフォルト住所
- 注文日
- 注文内の商品一覧
- 商品ID
- 商品タイトル
- 商品タグ
- financial status
- refund 情報

不足がある場合は、注文メタフィールドや Shopify Flow をあとから足せます。

## リスクと対策

### 1. 性別・生年月日が不足する

対策:

- まずは空欄許容で始める
- `不明` を正式カテゴリとして扱う
- 手修正テーブルで補う

### 2. 住所表記ゆれで地域集計が崩れる

対策:

- `prefecture` を正規化する関数を作る
- `region` は都道府県から再計算する

### 3. 商品名ルールが崩れる

対策:

- 商品タイトルの自動判定だけに依存しない
- `product_classifications` で明示管理する

### 4. 会員有効期限の定義が曖昧

対策:

- 仕様として先に決める
- 途中で変えられるよう再計算可能にしておく

## 実装フェーズ

### Phase 1

- Shopify から Customers / Orders / Products を取得
- PostgreSQL に保存
- 商品分類テーブルを作成
- 顧客別の会員一覧を表示

### Phase 2

- `membership_purchases` と `event_entries` を生成
- ダッシュボードとイベント分析画面を作る
- 年代/地域/性別フィルタを実装

### Phase 3

- 日次同期
- CSV出力
- 属性補正画面
- 継続率やコホート分析

## 直近の着手順

実際に作り始めるなら、次はこの順番がおすすめです。

1. Shopify商品を `membership` と `event_entry` に分類する命名・タグ運用を確定する
2. PostgreSQL + Prisma のスキーマを作る
3. Shopify同期スクリプトを1本作る
4. `member_profiles` を生成する整形処理を作る
5. 会員一覧画面とイベント分析画面を作る

## 最小要件の結論

このプロジェクトのMVPは、次の一文で定義できます。

「Shopifyの顧客・注文・商品データから、メンバー加入とイベント申込を意味づけして、地域・年代・性別・入会時期・イベント別に分析できるローカルBIアプリを作る」

この定義で進めれば、最初から作りすぎず、しかし後で拡張しやすい土台になります。
