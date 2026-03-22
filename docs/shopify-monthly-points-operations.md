# Shopify Monthly Points Operations

## 目的

この手順書は、毎月月末にコンテスト申込者へポイントを一括付与するための運用手順です。

## 使うファイル

- 対応表: [shopify-member-rank-map.json](/Users/takashiwada/Documents/CodeX/ShopifyApp/docs/shopify-member-rank-map.json)
- 候補一覧 JSON: [shopify-monthly-points.json](/Users/takashiwada/Documents/CodeX/ShopifyApp/docs/shopify-monthly-points.json)
- 候補一覧 CSV: [shopify-monthly-points.csv](/Users/takashiwada/Documents/CodeX/ShopifyApp/docs/shopify-monthly-points.csv)
- 初心者向け全体説明: [shopify-reward-beginner-guide.md](/Users/takashiwada/Documents/CodeX/ShopifyApp/docs/shopify-reward-beginner-guide.md)

## 月末の流れ

1. 3月分のように対象期間を決める
2. `shopify-member-rank-map.json` に Gタグと会員ランクの対応を入力する
3. 月末ポイント候補を再生成する
4. `shopify-monthly-points.csv` を確認する
5. 問題なければ実際のポイント付与を行う

## 会員ランク対応表の入力方法

`shopify-member-rank-map.json` の `rate` に数値を入れます。

- `Novice = 0`
- `Iron = 20`
- `Steel = 25`
- `Titan = 30`

例:

```json
{
  "byGroupTag": {
    "G5": {
      "rankName": "Steel",
      "rate": 25
    },
    "G11": {
      "rankName": "Titan",
      "rate": 30
    }
  },
  "byEmail": {}
}
```

## 再生成コマンド

当月分を作るとき:

```bash
npm run shopify:monthly-points
```

期間を指定したいとき:

```bash
npm run shopify:monthly-points -- --start=2026-04-01T00:00:00Z --end=2026-05-01T00:00:00Z
```

## CSV の見方

- `baseline_n_without_rank`
  - 競技数と早期条件だけで決まる還元率
- `manual_member_rank`
  - 対応表から補った会員ランク
- `manual_member_rate`
  - 会員ランク由来の還元率
- `final_n`
  - 最終的に採用する還元率
- `final_rate`
  - Shopify 用の整数ポイント率
- `final_point_amount`
  - 月末に付与したいポイント
- `blocked_reason`
  - 空欄でなければ要確認

## 注意点

- `unresolvedOrders` が 0 でない間は、会員ランク未確定の注文が残っています
- 早期条件は現在「注文日がイベント日の1か月前以前か」で計算しています
- 実運用前に、返金・キャンセル注文を除外するか必ず確認してください
