# Shopify CLI Ops Workflow

## 目的

商品登録、価格変更、購入資格のタグ/メタフィールド更新を GUI の手作業から切り離し、次の流れに寄せます。

1. `manifest` に変更内容を書く
2. CLI で `validate`
3. CLI で `plan` して差分レポートを出す
4. 人間が差分を確認する
5. CLI で `apply`
6. 必要なら `shopify:audit` や実ストア画面で最終確認する

## できること

現在の CLI は次を扱います。

- 商品
  - `title`
  - `status`
  - `productType`
  - タグの追加/削除
  - メタフィールド更新
  - SKU 指定での `price` / `compareAtPrice` 更新
- 顧客
  - タグの追加/削除
  - メタフィールド更新

## ファイル構成

- サンプル manifest: [config/shopify-config.sample.json](/Users/takashiwada/Documents/CodeX/ShopifyApp/config/shopify-config.sample.json)
- CLI 本体: [scripts/shopify-config-cli.js](/Users/takashiwada/Documents/CodeX/ShopifyApp/scripts/shopify-config-cli.js)
- Shopify API helper: [src/lib/shopify-admin.js](/Users/takashiwada/Documents/CodeX/ShopifyApp/src/lib/shopify-admin.js)

## 基本コマンド

### 1. manifest を検証する

```bash
npm run shopify:config -- validate \
  --manifest ./config/shopify-config.sample.json
```

### 2. 差分だけを見る

```bash
npm run shopify:config -- plan \
  --manifest ./config/shopify-config.sample.json \
  --report ./docs/shopify-config-plan.json
```

### 3. 問題なければ適用する

```bash
npm run shopify:config -- apply \
  --manifest ./config/shopify-config.sample.json \
  --report ./docs/shopify-config-apply.json
```

## 推奨ワークフロー

### 商品の追加・更新

1. Shopify で商品を最低限作る
2. `handle` と `sku` を確認する
3. manifest に価格、タグ、メタフィールドを書く
4. `plan` で差分を確認する
5. 差分が意図通りなら `apply`
6. Shopify 管理画面で最終見た目だけ確認する

### 購入資格の整備

1. 購入資格ルールを `tag` か `metafield` で定義する
2. 商品側と顧客側の両方を manifest に書く
3. `plan` の JSON を確認する
4. 例外顧客がいないか業務側で確認する
5. `apply` 後に実顧客 1 名で画面確認する

## 運用ルール

- 本番に直接 `apply` する前に、必ず `plan` の JSON をレビューする
- 1 回の manifest は小さく保つ
- 商品価格変更と顧客資格変更を同じ manifest に詰め込みすぎない
- 大きな変更は `config/releases/YYYY-MM-DD-*.json` のように分ける
- `report` は `docs/` に保存して監査ログとして残す

## 今後の拡張候補

- 商品新規作成
- コレクション更新
- 割引コード作成
- Development Store 向けの検証 manifest
- CSV から manifest を生成する変換スクリプト
