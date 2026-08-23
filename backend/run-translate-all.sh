#!/bin/sh
# run-translate-all.sh — Dịch en→vi theo từng level HSK, tuần tự, live output.
# Chạy từ PowerShell (thư mục project):
#   docker compose -f docker-compose.dev.yml exec -T backend sh /app/run-translate-all.sh
#
# Mỗi level: ghi theo chunk, log % + text/s + ETA, tự bỏ qua meaning đã có vi.
# --concurrency=2 để tránh rate-limit Google (429).
# Muốn chạy 1 level riêng: node /app/translate-meanings-en-to-vi.mjs --hsk="HSK 3" --concurrency=2

set -e

for LV in "HSK 1" "HSK 2" "HSK 3" "HSK 4" "HSK 5" "HSK 6" "custom"; do
  echo ""
  echo "==================== LEVEL: $LV ===================="
  node /app/translate-meanings-en-to-vi.mjs --hsk="$LV" --concurrency=2
done

echo ""
echo "✔ HOÀN TẤT TẤT CẢ CÁC LEVEL"
