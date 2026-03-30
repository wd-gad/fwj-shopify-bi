#!/usr/bin/env bash
#
# backup-db.sh — production DB の手動バックアップ
#
# 使い方:
#   DATABASE_URL="postgresql://..." bash scripts/backup-db.sh
#   または .env を用意した上で:
#   bash scripts/backup-db.sh
#
# 前提:
#   - pg_dump がインストール済みであること
#     macOS: brew install libpq && brew link --force libpq
#   - DATABASE_URL が設定されていること（production の DATABASE_PUBLIC_URL を使う）
#
# 出力:
#   backups/YYYY-MM-DD_HHMMSS_railway.dump

set -euo pipefail

# ── 安全確認 ──────────────────────────────────────────────────────────────────

if ! command -v pg_dump &>/dev/null; then
  echo "ERROR: pg_dump が見つかりません。以下でインストールしてください:"
  echo "  brew install libpq && brew link --force libpq"
  exit 1
fi

DB_URL="${DATABASE_URL:-}"
if [ -z "$DB_URL" ]; then
  echo "ERROR: DATABASE_URL が設定されていません。"
  echo "  export DATABASE_URL='postgresql://...'"
  exit 1
fi

# production ホストを指していることを確認（意図的な実行のみ許可）
DB_HOST=$(python3 -c "from urllib.parse import urlparse; print(urlparse('$DB_URL').hostname)")
echo "接続先ホスト: $DB_HOST"
echo ""
echo "本当に このDBのバックアップを取りますか？ [y/N]"
read -r CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "中止しました。"
  exit 0
fi

# ── バックアップ ──────────────────────────────────────────────────────────────

BACKUP_DIR="backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
OUTPUT_FILE="${BACKUP_DIR}/${TIMESTAMP}_railway.dump"

echo "バックアップ開始: $OUTPUT_FILE"

pg_dump \
  --format=custom \
  --no-acl \
  --no-owner \
  --verbose \
  "$DB_URL" \
  --file="$OUTPUT_FILE"

echo ""
echo "完了: $OUTPUT_FILE"
echo "サイズ: $(du -h "$OUTPUT_FILE" | cut -f1)"
echo ""
echo "復元時は以下を使用:"
echo "  pg_restore --clean --no-acl --no-owner -d \"\$TARGET_URL\" $OUTPUT_FILE"
