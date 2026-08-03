# Session Log — Tích hợp nguồn dữ liệu Hán-Việt & Nghĩa Tiếng Việt

> Ngày: 2026-08-03 · Project: learn-cantonese-app

## Mục tiêu (phiên này — Lexicon metadata từ xue-hanzi)

1. Thêm 7 key từ `xue-hanzi-dictionary.json` vào vocab detail: **pt, mwr, bwr, etym, tw, b, sp**.
2. Schema mới: `boost REAL`, `search_pinyin VARCHAR` (migration thủ công `20260803130000_add_boost_search_pinyin`).
3. Sync DB: 11,556/11,753 rows (script `sync-xuehanzi-metadata.mjs`, đã chạy thật).
4. Backend: `rowToVocabulary` expose thêm pos/frequency/radical/classifiers/pinyinNumeric/movieWordRank/bookWordRank/etymology/relatedWords/boost/searchPinyin.
5. Frontend: `LexiconInfo` component trong `WordDetailContent.jsx` (Etymology, Related words, Lexicon data) + i18n keys.
6. **Sync `engMeanings` theo index**: `sync-meanings-eng.mjs` — CVDICT vi ↔ CC-CEDICT en, chỉ khi khớp index (23,416/29,599 rows; 2,559 vocab lệch bỏ qua, không ghi sai).
7. **Fix wrap phiên âm**: grid `1fr_auto_1fr` + `max-w-xs` → `auto_auto_auto` + `w-max` để box giãn theo text.
8. **DROPPED etymology (user không cần)**: xóa sạch DB (JSON null + object → NULL), script sync bỏ ghi `etym`, frontend bỏ section Etymology + i18n key.
9. **Import từ vựng xue-hanzi HSK 1-6 phổ biến**: `import-xuehanzi-common.mjs` — lọc HSK 1-6 + common (mwr≤5000/bwr≤5000/boost≥20) + thuần Hán, bỏ trùng. Import 5,858 từ (DB → 17,611), dùng OpenCC chuẩn hóa trad (không lấy variant hiếm). Sau đó xóa 216 từ có nghĩa "biến thể cũ" (nguồn không có nghĩa thật) → **final 17,395 từ**. Không có jyutping (user bổ sung sau).
10. **Fix pinyin dính (zero-width space)**: xue-hanzi `p` dùng U+200B giữa âm tiết; import đầu xóa nhầm → 4,393 từ bị dính (`yīxià`). Sửa `cleanPinyin` (U+200B→space) + `cleanPinyinNumeric` (chèn space sau tone digit) + script `fix-import-pinyin.mjs` chạy fix DB + recompute hanCharacters breakdown. Đã xác minh `ān quán xìng` / `yi1 xia4` đúng.
11. **Fill jyutping 5,642 từ mới**: `sync-jyutping.mjs` — ưu tiên CC-Canto full-word (1,398 từ, chính xác ngữ cảnh) → fallback pycantonese (4,244 từ). 100% có jyutping + recompute breakdown. ⚠️ pycantonese sai chữ đa âm (VD 行不通→hong6, đúng phải hang4) — user chấp nhận, sẽ sửa qua UI sau.
12. **Fix pinyin camelcase**: 安/安定/安寧 bị seed gốc viết hoa `Ān` → sửa `ān` (AGENTS 1.3 lowercase). Xóa 3 dòng import thiếu dấu trùng reading (`An`/`An dìng`/`An níng`).
13. **Seed REMOVED + rewrite rules**: xóa `vocabularies.json`, `seed.ts`, `seed-han-characters.ts`, bỏ script `seed` trong package.json + `seed:` trong prisma.config.ts. AGENTS.md viết lại: DB là nguồn DUY NHẤT, dữ liệu thêm qua UI hoặc script sync (--dry) — không khôi phục file/seed.

---

---

# Session Log — Tích hợp nguồn dữ liệu Hán-Việt & Nghĩa Tiếng Việt (phiên trước)

## Mục tiêu

1. Thay `phienam.txt` bằng **Unihan kVietnamese** làm nguồn Hán-Việt chuẩn.
2. Thêm **CVDICT** để bổ sung nghĩa tiếng Việt (mỗi từ nhiều nghĩa riêng biệt).

---

## 1. Dữ liệu đã thêm vào `backend/data/`

| File              | Nguồn                             | Nội dung                                               | Kích thước |
| ----------------- | --------------------------------- | ------------------------------------------------------ | ---------- |
| `kvietnamese.txt` | Unihan `kVietnamese`              | 8,306 chữ → Hán-Việt (uppercase, chuẩn app convention) | 88 KB      |
| `cvdict.json`     | CVDICT (dịch CC-CEDICT sang Việt) | 122,596 entry `{s, t, p, vi}`                          | 13.8 MB    |
| `CVDICT.u8`       | raw (giữ lại)                     | nguồn gốc chưa parse                                   | 10.8 MB    |
| `phienam.txt`     | cũ (giữ lại)                      | fallback                                               | 124 KB     |

## 2. Library / module đã tạo (`backend/lib/`)

- **`sinoVietnamesesMap.js`** — build merged Han→Hán-Việt map. **Ưu tiên Unihan**, phienam fallback. Trả `{map, stats}`.
    - Kết quả map: **16,308 chữ** = unihan 8,306 + phienam-fallback 8,002 (overlap 3,409, unihan thắng).

- **`cvdictLoader.js`** — load `cvdict.json`, index theo simp + trad. Hàm `lookupCVDictVocab(simp, trad)`.

## 3. Script sync (ghi DB) — `backend/`

| Script                         | Chức năng                                                                                | chạy?                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------- |
| `sync-sv-merged.mjs`           | Sync Hán-Việt vào han_chars + vocabularies (chỉ dòng trống, log chi tiết unihan/phienam) | Đã chạy — DB đã đủ (0 dòng thiếu)        |
| `sync-viet-meanings.mjs`       | Điền `vietMeanings` trống từ CVDCT (single-field)                                        | Đã chạy — DB đã đủ                       |
| `sync-viet-meanings-merge.mjs` | (tạm) mình MOVE Merge (gộp chuỗi) — có `--dry`                                           | **Không dùng cuối** (bỏ vì cấu trúc sai) |
| `sync-vocab-meanings-rows.mjs` | **Tạo từng dòng nghĩa RIÊNG BIỆT** trong `vocabulary_meanings` từ CVDACT, làm sạch noise | **Đã chạy thật — 29,599 dòng**           |
| `compare-viet-meanings.mjs`    | So sánh DB vs CVD (read-only)                                                            | Đã chạy                                  |

## 5. Kết quả database (sau khi chạy)

`vocabularies` table hiện tại (11,753 dòng):

- `sino_vietnamese`: 11,753 / 11,753 (đầy đủ)
- `viet_meanings`: 11,753 / 11,753 (đầy đủ)
- `eng_meanings`: 11,753 / 11,753 (đầy đủ)

`vocabulary_meanings` table (cấu trúc nhiều nghĩa — 1 dòng = 1 nghĩa):

- **29,599 dòng** · 11,725 vocab đã có meaning · 28 vocab không có CVD
- Mỗi dòng: `category`, `vietMeanings`, `position`.
- Example `香` → 8 dòng (thơm / ngửi thơm / hương thơm / ngon hoặc hấp dẫn / (ăn) ngon lành / (ngủ) ngon / nước hoa hoặc gia vị / que hương hoặc cây nhang).
- Example `窩` → 9 dòng (tổ / chỗ lõm / ngổ / hang / nơi / chứa chấp / kiềm chế / uốn / con...).

## 6. Phân tích so sánh HSK (bổ sung, trước đó)

- Số từ HSK trong `vocabularies.json`: HSK1:396, HSK2:333, HSK3:578, HSK4:1110, HSK5:1715, HSK6:1951, HSK7:5687 → total 11,770.
- App gộp HSK 7+8+9 → "HSK 7". SoHSK chinese-lexicon (dictionary tham khảo) khác với app do hệ HSK cũ (1-6 +7). Lệch thật trong 1-6: 2,397 từ; lệch giả do gộp 7-9: 4,985 từ.

## 7. Ghi chú / quyết định

- **DB là nguồn duy nhất** — script chỉ điên entry trống, **không ghi đè** nghĩa/SV user đã sử a (theo AGENTS).
- `kvietnamese.txt` lưu Hán-Việt **uppercase** đúng convention app (AGENTS 1.3), không lowercase giống phienam cũ.
- CVDACT cung cấp cả noise (mã pinyin `[ge4]`, `LT:`, `|` bridge, classifier Hán) → đã làm sạch trong `sync-vocab-meanings-rows.mjs` trước khi ghi.
- Còn 28 vocab không có nghĩa từ CVD (ham riêng hoặc không có entry) — chưa xử lý, có thể tự nhâ bằng UI.

## 8. Các file tạm đã xóa

- `dict-sample.json` (33MB tải về), `extract-dict.mjs`, `Unihan.zip`, thư mục `unihan_tmp`, script temp trong `Temp/opencode`.

## 9. Việc có thể làm tiếp (nếu cần)

- Pre-fill `eng_meanings` từ CC-CEDICT (dictionary của ự họ bạn đã tải) cho phần trống — hiện DB đã đủ eng rồi.
- Xử lý 28 vocab còn thiếu nghĩa.
- Thêm `category` (từ loại) vào `vocabulary_meanings` nếu muốn phản âm theo loại từ.
