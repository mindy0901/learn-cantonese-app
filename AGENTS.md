# Agent Guidelines — Learn Cantonese App

> Dành cho các AI agent khi làm việc với project này. Đọc kỹ trước khi thực hiện bất kỳ thay đổi nào.
>
> ⚠️ **QUAN TRỌNG:** Database PostgreSQL là nguồn dữ liệu duy nhất. Tuyệt đối không xóa, ghi đè, hay chạy seed/migration mà không có sự đồng ý rõ ràng của user. Phải hỏi user và chờ xác nhận trước khi thực hiện bất kỳ thao tác nào liên quan đến database.
> chỉ làm việc với database ở local, ko cần xử lý tất cả những gì liên quan tới database ở cloud (prisma và supabase), tôi sẽ yêu cầu update khi cần. chỉ update và xử lý việc làm với local.

### ✂️ Rule tiết kiệm chi phí — TRẢ LỜI NGẮN GỌN

- ❌ **Không trả lời quá dài.** Chỉ trả lời đúng trọng tâm câu hỏi/công việc.
- ✅ Trả lời ngắn gọn, súc tích, đi thẳng vào vấn đề.
- ✅ Khi xác nhận hoàn thành: chỉ báo ngắn gọn đã làm gì (1-3 dòng), không giải thích dài dòng.
- ✅ Khi hỏi thông tin: hỏi đúng câu cần thiết, không lan man, không kết luận bằng cách bịa ra những gì bạn suy đoán.

---

## 0. Agent Login (để tự động đăng nhập khi test)

1. Mở trang `http://localhost:5173`
2. Click "Sign in"
3. Nhập `admin` / `admin` → click "Sign in"
4. Hoặc gọi API trực tiếp: `POST /auth/login` với body `{ "email": "admin", "password": "admin" }`

---

## 1. Quy ước đặt tên

| Domain                        | Dùng                                                                               | Không dùng       |
| ----------------------------- | ---------------------------------------------------------------------------------- | ---------------- |
| Từ vựng (variable, prop, key) | `vocabulary` / `vocabularies`                                                      | `word` / `words` |
| Ngữ pháp                      | `grammar` / `grammars`                                                             |                  |
| Bài học                       | `lesson` / `lessons`                                                               |                  |
| Hán tự                        | `hanziCharacter` / `hanziCharacters` (Prisma) — frontend store vẫn `hanCharacters` |                  |
| Flashcard                     | `flashcard` / `flashcards`                                                         |                  |

- ❌ **Không** dùng `word` / `words` cho bất kỳ variable, prop, key, hoặc object field nào liên quan đến từ vựng.
- ✅ Luôn dùng `vocabulary` (số ít) hoặc `vocabularies` (số nhiều).
- Áp dụng cho: tên biến, tên hàm, object keys, API endpoints, props, state.

### 0.1 Quy tắc fallback dữ liệu

- ✅ **Nghĩa (viet/eng) hiển thị ƯU TIÊN từ `word.meanings`** (bảng/JSON child) — dùng `collectMeaningsField(word.meanings, "vietMeanings")` / `"engMeanings"` (helper `lib/wordNormalize.js`). Chỉ fallback `word.vietMeanings`/`engMeanings` (column phẳng) khi child rỗng.
- ✅ **Thứ tự hiển thị nghĩa:** `collectMeaningsField(word.meanings, field) || word[field] || "-"`.
- ❌ **Không bao giờ** fallback sai ngữ cảnh. Ví dụ:
    - `vietMeanings || sinoVietnamese` → **SAI**: Hán-Việt không phải nghĩa tiếng Việt.
    - `engMeanings || sinoVietnamese` → **SAI**: Hán-Việt không phải nghĩa tiếng Anh.
- ✅ Khi cần hiển thị Hán-Việt: dùng `sinoVietnamese`.
- ✅ Nếu field không có dữ liệu: hiển thị "đang cập nhật" hoặc "không có dữ liệu" / "-", **không** fallback sang field khác loại.
- ❌ **KHÔNG fallback chéo form hán tự:** Cột **Mandarin** CHỈ hiển thị `hanSimplified` (rỗng → `-`), **KHÔNG** fallback sang `hanTraditional`/`hanHongKong`. Cột **Cantonese** CHỈ hiển thị `hanHongKong` (rỗng → `-`), **KHÔNG** fallback sang `hanSimplified`. (2026-08-13 — từng bị lỗi `mandarinHan = simplified || traditional`)
- nếu fallback mà ko có dữ liệu thì để trống hoặc dùng "-" chứ ko được trả về value gốc. ví dụ translate "動詞" nhưng ko ra kết quả thì fallback về "--" chứ ko phải "動詞"

### 0.2 Quy tắc đặt tên UI bằng tiếng Việt — BẮT BUỘC

UI hiển thị cho người dùng **phải bằng tiếng Việt**. Bảng tra cứu thuật ngữ (EN → VI) dùng thống nhất mọi nơi:

| Thuật ngữ (EN)     | Tiếng Việt (UI)     |
| ------------------ | ------------------- |
| vocabulary         | từ vựng             |
| vocabulary bank    | kho từ vựng         |
| grammar            | ngữ pháp            |
| grammar bank       | kho ngữ pháp        |
| lesson             | bài học             |
| han character      | hán tự              |
| flashcard          | flashcard           |
| deck               | bộ thẻ              |
| pinyin             | phiên âm (Pinyin)   |
| jyutping           | phiên âm (Jyutping) |
| sino-vietnamese    | Hán-Việt            |
| vietnamese meaning | nghĩa tiếng Việt    |
| english meaning    | nghĩa tiếng Anh     |
| meaning            | nghĩa               |
| example            | ví dụ               |
| hanzi              | hán tự              |
| han traditional    | phồn thể            |
| han simplified     | giản thể            |
| pronunciation      | cách đọc / phiên âm |
| reading            | cách đọc            |
| hsk level          | cấp độ HSK          |
| level              | cấp độ              |
| search             | tìm kiếm            |
| important          | quan trọng          |
| mastered           | đã thuộc            |
| progress           | tiến độ             |
| home               | trang chủ           |
| sign in / login    | đăng nhập           |
| sign out / logout  | đăng xuất           |
| username           | tên đăng nhập       |
| password           | mật khẩu            |
| save               | lưu                 |
| cancel             | hủy                 |
| delete             | xóa                 |
| edit               | sửa                 |
| add                | thêm                |
| close              | đóng                |
| back               | quay lại            |
| import             | nhập                |
| export             | xuất                |
| details            | chi tiết            |
| note               | ghi chú             |
| structure          | cấu trúc            |

**Quy tắc:**

- ✅ Giữ nguyên thuật ngữ chuyên môn không dịch: Pinyin, Jyutping, Hán-Việt (giữ dạng "Hán-Việt"), HSK, OpenCC, Hanzii.
- ✅ Khi dịch data field: `vietMeanings` → "Nghĩa tiếng Việt", `engMeanings` → "Nghĩa tiếng Anh", `sinoVietnamese` → "Hán-Việt", `pinyin` → "Pinyin", `jyutping` → "Jyutping".

### 1.1 ⚠️ QUY TẮC BẢO VỆ DATABASE — BẮT BUỘC

| Quy tắc                                       | Chi tiết                                                                      |
| --------------------------------------------- | ----------------------------------------------------------------------------- |
| ❌ **Không được xóa** dữ liệu trong database  | Không chạy `deleteMany`, `DELETE`, hay bất kỳ lệnh xóa nào                    |
| ❌ **Không được ghi đè** dữ liệu hiện tại     | Không chạy `updateMany` không có điều kiện, không chạy seed/migration tự ý    |
| ❌ **Không được chạy seed** mà không hỏi      | Seed script có thể thay đổi dữ liệu — phải hỏi user trước                     |
| ❌ **Không được chạy migration** mà không hỏi | Migration có thể thay đổi schema — phải hỏi user trước                        |
| ✅ **Phải hỏi user trước**                    | Trước khi thực hiện BẤT KỲ thao tác nào ghi/đổi/xóa dữ liệu trong DB          |
| ✅ **Chỉ được đọc** (SELECT)                  | Các thao tác đọc dữ liệu (query, count, search) được phép tự do thực hiện     |
| ✅ **Tạo mới được phép** (sau khi hỏi)        | `INSERT` / `create` — nhưng phải hỏi user xác nhận trước                      |
| ✅ **Cập nhật được phép** (sau khi hỏi)       | `UPDATE` / `update` trên 1 record cụ thể — nhưng phải hỏi user xác nhận trước |

**Luôn hỏi user và chờ xác nhận trước khi thực hiện bất kỳ thao tác nào ngoài SELECT.**

### 1.2 Database là nguồn duy nhất

- có 2 database backup là prisma và supabase. Hiện tại khi dev chỉ dùng local database trong docker.

### 1.3 Quy tắc chuẩn hóa phiên âm (Pinyin & Jyutping)

Khi so sánh, tìm kiếm, hoặc tạo ID cố định, luôn chuẩn hóa:

| Thao tác           | Công thức                  | Ví dụ                          |
| ------------------ | -------------------------- | ------------------------------ |
| Chuẩn hóa pinyin   | Bỏ khoảng trắng, lowercase | `"qǔ xiāo"` → `"qǔxiāo"`       |
| Chuẩn hóa jyutping | Bỏ khoảng trắng, lowercase | `"ceoi2 siu1"` → `"ceoi2siu1"` |

**Quy tắc quan trọng nhất:** `"qǔ xiāo"` và `"qǔxiāo"` là **cùng một pronunciation**. Đây là 2 cách viết khác nhau của cùng một phiên âm (có dấu cách vs không dấu cách). **Không được tạo 2 entry riêng cho chúng.**

**Quy tắc case-insensitive (BẮT BUỘC):** Pinyin & jyutping luôn lưu **lowercase**. `"Gāo"` và `"gāo"` là **cùng một reading** — không được coi là 2 reading riêng.

- ✅ `splitPinyinParts` / `splitJyutpingParts` (`backend/lib/hanCharacterBreakdown.js`) → `.toLowerCase()`
- ✅ `mergeReadings` + `mergeArrCaseInsensitive` → dedupe case-insensitive
- ✅ Preview `missing()` cho py/jp → `caseInsensitive=true`
- ❌ **KHÔNG** lowercase `sinoVietnamese` — Hán-Việt viết hoa theo convention (TỊNH, CAO...)
- ✅ Dữ liệu `vocabularies` và `han_characters` đã chuẩn hóa lowercase (2026-08-02)

**Quy tắc case cho vietMeanings / engMeanings / pinyin / jyutping / sinoVietnamese (BẮT BUỘC):**

| Field            | Quy tắc                                                                               | Ví dụ                                                              |
| ---------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `vietMeanings`   | **Luôn viết hoa chữ cái đầu mỗi câu** (hàm `capitalizeSentences`, `wordNormalize.js`) | `"lấy"` → `"Lấy"`; `"to take; to cancel"` → `"To take; To cancel"` |
| `engMeanings`    | Giống `vietMeanings` — viết hoa đầu câu                                               | `"to cancel"` → `"To cancel"`                                      |
| `pinyin`         | **Luôn lowercase** khi lưu (`normalizeVocabularyFields` + `vocabularyToRow`)          | `"Qǔ xiāo"` → `"qǔ xiāo"`                                          |
| `jyutping`       | **Luôn lowercase** khi lưu                                                            | `"Ceoi2 siu1"` → `"ceoi2 siu1"`                                    |
| `sinoVietnamese` | **Luôn uppercase** (viết hoa đầu mỗi reading — `normalizeSinoVietnameseValue`)        | `"tịnh"` → `"TỊNH"`; `"a di"` → `"A DI"`                           |

- ❌ **KHÔNG** title-case từng từ cho `vietMeanings`/`engMeanings` (không `"To Take"`, chỉ `"To take"`).
- ✅ Áp dụng ở cả lúc **lưu** (frontend `normalizeVocabularyFields`, backend `vocabularyToRow`/`upsertMeaningsAndExamples`) và có script fix dữ liệu cũ: `backend/normalize-vocab-case.mjs` (hỗ trợ `--dry`).
- ⚠️ **2026-08-16:** các cột flat này ĐÃ DROP — dữ liệu giờ nằm trong bảng quan hệ: `vocabulary_meanings.vi`/`en` (meaning), `vocabulary_readings.romanization` (pinyin/jyutping lowercase), `vocabulary_readings.sino_vietnamese` (uppercase). Quy tắc case vẫn áp dụng cho các field này.

### 1.4 ID cố định (stable UUID)

> ⚠️ **2026-08-16:** `vocabulary` + `vocabulary_readings/meanings/examples` giờ dùng **random UUID** (id content-deterministic cũ TRÙNG giữa các vocab nên đã remap) — xem §2.4. `han_characters.id` vẫn có thể sinh deterministic khi cần (`hanziCharacterId`).

Công thức MD5 cũ (chỉ còn mang tính tham chiếu):

```
stableUUID = MD5( hanziTraditional | hanziSimplified | normPinyin | normJyutping )
```

Trong đó `normPinyin` và `normJyutping` đã được chuẩn hóa (bỏ khoảng trắng, lowercase).

### 1.5 Quy tắc Hán tự: Traditional là mặc định

Khi một hán tự chỉ có 1 phiên bản (giản thể và phồn thể giống nhau, hoặc chỉ có 1 form), **mặc định là traditional (phồn thể)**.

| Trường hợp                             | hanTraditional                             | hanSimplified                                |
| -------------------------------------- | ------------------------------------------ | -------------------------------------------- |
| Chữ chỉ có 1 form (VD: 人, 大, 山)     | Giữ nguyên                                 | **NULL / trống** (không có simplified riêng) |
| Chữ có giản/phồn khác nhau (VD: 学/學) | **Phồn thể** (學)                          | **Giản thể** (学)                            |
| Chữ có nhiều variant traditional       | Dùng variant phổ biến nhất (VD: 臺 cho 台) | Dùng giản thể chuẩn                          |

**Quy tắc bắt buộc:**

- ✅ `hanTraditional` luôn là phồn thể
- ✅ `hanSimplified` luôn là giản thể
- ❌ Không được đảo ngược (traditional ≠ simplified)
- ✅ Khi unsure, tra cứu OpenCC hoặc Hanzii để xác định đúng form
- ✅ Màu hiển thị hán tự — **TÔ THEO TỪNG KÝ TỰ (per-character)**, không tô cả cột:
    - 🔴 **Đỏ = traditional** (`text-han-trad` — semantic token `--han-trad-color`)
    - 🔵 **Xanh = simplified** (`text-han-simp` — semantic token `--han-simp-color`)
    - ⚠️ **Quy tắc quan trọng:** Ký tự **giống hệt** ở cả 2 form (vd 安, 眠 trong 安眠藥/安眠药) vẫn là **traditional → ĐỎ**, kể cả khi nằm trong cột Simplified. Chỉ ký tự **thật sự khác** (vd 药 = giản thể của 藥) mới **XANH**.
    - ✅ Cột **Traditional**: toàn bộ ký tự đỏ (render bằng `renderHanText`).
    - ✅ Cột **Simplified**: dùng `renderHanWithDiff` — ký tự `same` (giống trad) → đỏ, ký tự `diff` (giản thật) → xanh. Đây là logic giống `WordRow` (bảng vocabularies).
    - ⚠️ **ĐỒNG NHẤT CẤU TRÚC DOM:** mọi hiển thị hán tự phải bọc **mỗi ký tự vào `<span>` riêng** (cả `renderHanText` lẫn `renderHanWithDiff`, cả `WordRow` `HanVariantCell` nhánh `!hasDiff`). Nếu 1 cột là text node thuần, cột kia span riêng → trình duyệt rasterize khác → **độ dày nét nhìn lệch dù computed font-weight giống nhau**. (2026-08-11)
    - ⚠️ **FONT HÁN PHẢI CỐ ĐỊNH (2026-08-11):** `Geist Variable` **KHÔNG có glyph Hán** → browser fallback sang font Hán hệ thống **KHÁC NHAU** cho run giản (`财`) vs phồn (`財`) → cùng glyph (`力`) render bằng 2 font → **độ dày nét lệch thật** (đo width 54.30 vs 53.23px). **Fix:** ép font Hán cụ thể vào `.wd-han` trong `globals.css`: `font-family: "Geist Variable", "Microsoft JhengHei", "PingFang HK", "Noto Sans CJK SC", sans-serif` → cả trad & simp fallback về cùng 1 font Hán.
    - ✅ **Màu phiên âm & nghĩa (CHUẨN MỚI 2026-08-20):** pinyin (`--pinyin-color`), jyutping (`--jyutping-color`), viet (`--viet-color`) → **TRẮNG** (`#ffffff`) — hiện trên nền tối/chip. (Cũ: jyutping đỏ / pinyin xanh / viet xanh lá — đã bỏ.)
    - ✅ **Token semantic** định nghĩa tại `frontend/src/globals.css` (`:root` + `.dark` — cơ chế theme dùng `.dark` class, xem §8.5): `--han-trad-color` (đỏ), `--han-simp-color` (xanh), `--han-mtrad-color` (tím purple-400), `--pinyin-color`/`--jyutping-color`/`--viet-color` (trắng), `--purple-color` (tím). Dùng class `text-han-trad` / `text-han-simp` / `text-han-mtrad` / `text-pinyin` / `text-jyutping` / `text-viet` / `text-purple` — **KHÔNG** dùng raw `text-red-600`/`text-blue-600` cho hán tự.
    - Áp dụng toàn app: `WordDetailContent.jsx`, `WordRow.jsx`, `HanCharacterRow.jsx`, `HanCharacterDetailPage.jsx`, `WordEditFields.jsx`, `AddHanCharacterModal.jsx`, `HanVariantsInline.jsx`, `FlashcardDeckManager.jsx`, `FlashcardSessionSummary.jsx`, `OcrScanSection.jsx`, `HanziiHanCellLink.jsx` (primary = traditional → đỏ, secondary = simplified → xanh)
    - ❌ Không dùng `text-han` (màu trung tính) cho hiển thị hán tự khi phân biệt được trad/simp — trừ danh sách skipped/không phân biệt

---

## 2. Schema Prisma — QUAN TRỌNG

### 2.1 KHÔNG có unique constraint trên Vocabulary

```prisma
model Vocabulary {
    id                 String  @id @default(uuid()) @db.Uuid
    hanziSimplified    String? @default("") @map("hanzi_simplified") @db.VarChar
    hanziTraditional   String? @default("") @map("hanzi_traditional") @db.VarChar
    hanziSimplifiedHk  String? @default("") @map("hanzi_simplified_hk") @db.VarChar
    hanziTraditionalHk String? @default("") @map("hanzi_traditional_hk") @db.VarChar
    hskLevel           String? @default("") @map("hsk_level") @db.VarChar
    frequency          Float?  @map("frequency")
    popularity         Float?  @db.Real
    hanCharacters      Json?   @map("han_characters") @db.JsonB
    createdAt          DateTime @default(now()) @map("created_at")
    updatedAt          DateTime @updatedAt @map("updated_at")
    // relations: readings VocabularyRomanization[], vocabularyCharacters, ...
    @@index([hskLevel])
    @@map("vocabularies")
    // ⚠️ KHÔNG có @@unique([hanziSimplified, hanziTraditional])
}
```

**Lý do:** Cùng một chữ Hán có thể có nhiều phiên âm khác nhau → nhiều dòng DB.

> ⚠️ **2026-08-16 — schema quan hệ:** bỏ `romanization_json` (JSONB), bỏ `pure_cantonese`/`search_key`/`movie_word_rank`/`book_word_rank`. Phiên âm + nghĩa + ví dụ lưu trong bảng con `vocabulary_readings` (Prisma = `VocabularyRomanization`) / `vocabulary_meanings` / `vocabulary_examples`. `han_hongkong` → `hanzi_traditional_hk`; `boost` → `popularity`; `frequency` Int → Float. `hanzi_simplified_hk` để trống (chưa dùng). (xem §2.3)

### 2.2 `createVocabulary` và `replacePartialData` dùng `create`, KHÔNG dùng `upsert`

- `backend/lib/prismaService.js`: Đã sửa `upsert` → `create` để không ghi đè từ đã tồn tại.

### 2.3 Model vocab — `{ id, mandarin, cantonese, metadata }` (API object) — BẮT BUỘC

> ⚠️ **2026-08-16 — lưu bằng BẢNG QUAN HỆ** (hết `romanization_json` JSONB). API vẫn trả `{id, mandarin, cantonese, metadata}`; `rowToVocabulary` (`prismaService.js`) tái tạo blocks từ `readings` relation (`vocabModel.js` `blocksFromRow`).

**Shape API (blocks) = shape `_zhang_proposed.json`:** `blocksFromRow` build `{mandarin, cantonese}` từ `vocab.readings` (bảng `vocabulary_readings/meanings/examples`):

```json
{
    "id": "uuid",
    "mandarin": {
        "hanzi_simplified": "长",
        "hanzi_traditional": "長",
        "system": "pinyin",
        "readings": [
            {
                "id": "uuid",
                "romanization": "cháng",
                "sino_vietnamese": "TRƯỜNG",
                "meanings": [
                    {
                        "id": "uuid",
                        "position": 0,
                        "category": "Danh tu",
                        "zh": "",
                        "vi": "Dài",
                        "en": "Long",
                        "examples": [
                            {
                                "id": "uuid",
                                "position": 0,
                                "zh": "長裙",
                                "romanization": "coeng4 kwan4",
                                "vi": "",
                                "en": "a long dress"
                            }
                        ]
                    }
                ]
            }
        ]
    },
    "cantonese": {
        "hanzi_simplified": "长",
        "hanzi_traditional": "長",
        "system": "jyutping",
        "readings": [{ "id": "uuid", "romanization": "coeng4", "sino_vietnamese": "TRƯỜNG", "meanings": [] }]
    },
    "metadata": {
        "hsk_level": "HSK 3",
        "popularity": 64.9,
        "frequency": 2276,
        "created_at": "...",
        "updated_at": "..."
    }
}
```

**Quy tắc (key order chuẩn):**

- **block**: `hanzi_simplified, hanzi_traditional, system, readings` — mandarin.system="pinyin", cantonese.system="jyutping".
    - `cantonese.hanzi_traditional` = `han_hongkong` cũ; `mandarin.hanzi_traditional` = `han_traditional` cũ; `hanzi_simplified` = `han_simplified`.
- **reading**: `id, romanization, sino_vietnamese, meanings` — `romanization` = pinyin (mandarin) | jyutping (cantonese).
- **meaning**: `id, position, category, zh|yue, vi, en, examples` — **mandarin dùng `zh`, cantonese dùng `yue`** (dict gloss → `zh|yue`; manual tiếng Việt → `vi`).
- **example**: `id, position, zh|yue, romanization, vi, en`.
- **metadata**: `hsk_level, popularity, frequency, created_at, updated_at`.
- ✅ Backend: `backend/lib/vocabModel.js` — `blocksFromRow` (đọc `vocab.readings` relation → blocks `{mandarin,cantonese}`), `blockFromLegacy`, `meaningFromLegacy`, `normalizeBlock`, `buildRomanizationJsonNew`; `backend/lib/romanizationId.js` — `romanizationId(py,jp)` MD5 UUID.
- ✅ Backend `prismaService.js`: `rowToVocabulary` → `{id, mandarin, cantonese, metadata}`; `vocabularyToRow` + `writeVocabularyReadings(id, blocks)` ghi readings/meanings/examples vào bảng con (delete + recreate); `updateVocabulary` nhận `body.mandarin/cantonese` (new) hoặc legacy array/single-entry.
- ✅ Frontend: store giữ shape cũ qua adapter `vocabNewToLegacy` (`frontend/src/lib/dataTransforms.js`); khi lưu gửi payload mới qua `vocabularyDraftPayload` (`WordEditFields.jsx`).
- ❌ **KHÔNG** dùng `romanization_json`/`meanings_json`/cột flat — đã drop.
- ⚠️ Script CLI cũ tham chiếu `romanization_json`/cột đã drop (`backfill-*`, `_audit-*`, `backup-supabase.mjs`, `backup-prisma-cloud.mjs`, `fill-*`, `fix-*`, `merge-romanization.mjs`, `split-*`, `import-*`, `filter-vocab.mjs`, `migrate-new-model.mjs`) — **sẽ lỗi nếu chạy lại**, cần cập nhật khi dùng.
- 📄 Migration: `backend/migrate-new-schema.mjs` (JSONB → bảng quan hệ, 2026-08-16) + `backend/migrate-hanzi-schema.mjs` (hanzi rename, 2026-08-16).

### 2.4 Object lồng nhau PHẢI có `id` (UUID) — BẮT BUỘC (2026-08-11)

> ⚠️ Áp dụng cho **mọi object lồng nhau** (reading/meaning/example) — kể cả khi lưu trong bảng quan hệ. Không dùng `position`/index mảng để định danh.

**Quy tắc:**

- ✅ **Mỗi object lồng nhau PHẢI có `id` (UUID)** — KHÔNG dựa vào `position`/index mảng để định danh.
- ❌ **KHÔNG dùng index/position** làm key định danh khi edit/delete/merge — dễ lỗi.
- ✅ Bảng quan hệ cần **id duy nhất TOÀN CỤC** (khác JSONB): id deterministic theo content/romanization có thể TRÙNG giữa các vocab → `writeVocabularyReadings` (`prismaService.js`) tự sinh UUID khi id thiếu/trùng.
- ✅ Khi edit 1 phần tử: tìm bằng `id`, **giữ nguyên `id` cũ** — `writeVocabularyReadings` delete + recreate toàn bộ readings của vocab (giữ id từ payload).
- 📄 Migration: `backend/migrate-new-schema.mjs` đã remap mọi id sang UUID riêng.

---

### 3.1 Script sync dữ liệu hiện có (đều phải hỏi user trước khi chạy)

| Script              | Chức năng                                        |
| ------------------- | ------------------------------------------------ |
| `sync-jyutping.mjs` | Điền jyutping từ CC-Canto + to-jyutping fallback |

- ✅ Tất cả script đều hỗ trợ `--dry` để preview trước khi ghi.
- ✅ Nguồn dữ liệu nằm trong `backend/data/`: `CCCANTO.json`, `CVDICT.json`, `CEDICT.json`, `sino-vietnamese.json`...

---

## 4. Thao tác database — Quy tắc hỏi trước

### 4.1 Luôn hỏi user trước khi thực hiện

Bất kỳ thao tác nào ngoài SELECT đều phải hỏi user:

| Loại thao tác   | Ví dụ                                      | Cần hỏi? |
| --------------- | ------------------------------------------ | :------: |
| Đọc dữ liệu     | `findMany`, `findUnique`, `SELECT`, search |    ❌    |
| Tạo mới         | `create`, `INSERT`                         |    ✅    |
| Cập nhật        | `update`, `UPDATE`                         |    ✅    |
| Xóa             | `delete`, `DELETE`                         |    ✅    |
| Chạy seed       | `npx prisma db seed`                       |    ✅    |
| Chạy migration  | `npx prisma migrate`                       |    ✅    |
| Thay đổi schema | Sửa `schema.prisma`                        |    ✅    |

### 4.2 Quy trình hỏi

1. Mô tả rõ thao tác muốn thực hiện
2. Nêu lý do cần thao tác
3. Chờ user xác nhận ("có" / "không" / điều chỉnh)
4. Chỉ thực hiện sau khi có đồng ý rõ ràng

## 7. Kiểm tra nhanh

```bash
# Xem tổng số từ
docker compose -f docker-compose.dev.yml exec -T db psql -U cantonese -d cantonese -c "SELECT COUNT(*) FROM vocabularies;"

# Xem phân bố HSK level
docker compose -f docker-compose.dev.yml exec -T db psql -U cantonese -d cantonese -c "SELECT hsk_level, COUNT(*) FROM vocabularies WHERE hsk_level IS NOT NULL GROUP BY hsk_level ORDER BY COUNT(*) DESC LIMIT 10;"

# Xem custom entries
docker compose -f docker-compose.dev.yml exec -T db psql -U cantonese -d cantonese -c "SELECT COUNT(*) FROM vocabularies WHERE hsk_level IS NULL OR hsk_level = '';"
```

---

## 7.5. Đồng bộ Local State ↔ Database — QUAN TRỌNG

**Nguyên tắc:** Mọi thao tác edit / delete / add vocabulary phải đồng bộ **cả 2 phía**:

| Phía               | Vị trí                           | Cơ chế                                                                            |
| ------------------ | -------------------------------- | --------------------------------------------------------------------------------- |
| **Database**       | PostgreSQL                       | API call (`api.updateVocabulary`, `api.deleteVocabulary`, `api.createVocabulary`) |
| **Zustand store**  | `frontend/src/store/appStore.js` | `set()` cập nhật `vocabularies` array                                             |
| **UI local state** | `WordBankBrowseTable.items`      | `useEffect` sync từ `storeWords` (Zustand)                                        |

### 7.5.1 Vòng đời đồng bộ

```
User action → Optimistic update (store) → API call → Store sync ← UI sync (useEffect)
```

1. **Optimistic update:** Cập nhật Zustand store NGAY LẬP TỨC (trước API).
2. **API call:** Gửi request lên server.
3. **Store sync:** Khi API thành công, cập nhật store với dữ liệu từ server.
4. **UI sync:** `WordBankBrowseTable` dùng `useEffect` để đồng bộ `items` từ `storeWords`.

### 7.5.2 Quy tắc bắt buộc

- ❌ **Không được** chỉ xóa khỏi store mà quên gọi API.
- ❌ **Không được** giữ lại item đã xóa trong local `items` array. Khi `fromStore` là `undefined` → **phải loại bỏ** item đó.
- ❌ **Không được** dùng `items.map()` mà không filter. Dùng `for...of` + `continue` khi item không còn trong store.
- ❌ **Không được** tự ý thao tác database mà không hỏi user trước (xem Section 4).
- ✅ **Luôn** gọi `syncMutation()` để bọc API call — nếu API fail sẽ rollback store.
- ✅ **Luôn** kiểm tra `fromStore` có tồn tại trước khi merge dữ liệu.

### 7.5.3 Ví dụ: sync xóa từ đúng cách

### 7.6. Hán tự breakdown — tính ở FRONTEND (2026-08-14) + cột `hanCharacters` JSONB (write-side)

**Display (frontend):** breakdown tính lại từ readings ở trình duyệt — `frontend/src/lib/hanBreakdown.js` `computeHanCharacters(vocab)` (đọc `vocab.hanTraditional/hanSimplified/romanization`, căn chỉnh pinyin/jyutping/Hán-Việt theo vị trí). Dùng tại `WordDetailContent.jsx` (`HanCharactersBreakdown`). API KHÔNG trả `hanCharacters` nữa.

**Backend write-side:** cột `hanCharacters` (JSONB) vẫn được ghi khi create/update để sync kho HanCharacter — `backend/lib/hanCharacterBreakdown.js` `computeHanCharacters` (đọc sources từ `vocab.readings` relation — bảng `vocabulary_readings`, fallback legacy/flat).

Mỗi vocabulary có cột `hanCharacters` (JSONB) lưu breakdown từng hán tự theo vị trí:

```json
[
    { "sinoVietnamese": "AAI", "hanSimplified": "", "hanTraditional": "挨", "pinyin": "āi", "jyutping": "aai1" },
    { "sinoVietnamese": "GAA", "hanSimplified": "", "hanTraditional": "家", "pinyin": "jiā", "jyutping": "gaa1" },
    { "sinoVietnamese": "AAI", "hanSimplified": "", "hanTraditional": "挨", "pinyin": "āi", "jyutping": "aai1" },
    { "sinoVietnamese": "WU", "hanSimplified": "户", "hanTraditional": "戶", "pinyin": "hù", "jyutping": "wu6" }
]
```

**Quy tắc bắt buộc:**

- ✅ **Thứ tự key (BẮT BUỘC): `sinoVietnamese` → `hanSimplified` → `hanTraditional` → `pinyin` → `jyutping`** — áp dụng cho mọi nơi build/trả breakdown:
    - Backend `computeHanCharacters` (build lúc create/update/backfill).
    - Backend `normalizeHanCharItem` + `rowToVocabulary` (trả API) — **BẮT BUỘC** vì Postgres JSONB tự sort key khi lưu, nên phải rebuild thứ tự ở tầng API.
    - Script backfill: `backend/backfill-hanchar-key.mjs`.
- ✅ Breakdown tính tự động từ `hanTraditional` + `pinyin`/`jyutping` (căn chỉnh theo vị trí), qua `backend/lib/hanCharacterBreakdown.js` (`computeHanCharacters`).
- ✅ Khi create/update vocabulary (`prismaService.js`): tự ghi `hanCharacters` + sync lên kho HanCharacter (`syncVocabularyHanCharacters`) — find-or-create từng hán tự, **chỉ merge readings mới, không ghi đè**.
- ✅ Bảng `vocabulary_characters` (join) chỉ link **hán tự duy nhất** (không lặp) — do unique constraint `(vocabularyId, hanCharacterId)`; vị trí = vị trí xuất hiện đầu tiên.
- ❌ **KHÔNG dùng regex global `/g` + `.test()`** trong vòng lặp để lọc hán tự — `.test()` stateful (lastIndex) gây lọc sai ký tự. Dùng kiểm tra code point (xem `isHanChar`).
- ✅ Backfill dữ liệu cũ: `backend/backfill-han-characters.mjs`; rebuild readings: `backend/rebuild-han-character-readings.mjs` (ghi đè readings từ breakdown chính xác — phải hỏi user trước khi chạy).
- ✅ Frontend: `WordDetailContent.jsx` hiển thị `HanCharactersBreakdown` (mỗi chữ + pinyin/jyutping, link tới HanCharacter detail).

```js
// ✅ ĐÚNG — WordBankBrowseTable useEffect
useEffect(() => {
    setItems((current) => {
        const byId = new Map(storeWords.map((w) => [w.id, w]));
        const next = [];
        for (const item of current) {
            const fromStore = byId.get(item.id);
            if (!fromStore) continue; // ← XÓA khỏi local list
            // Merge dữ liệu mới từ store
            next.push({ ...item, ...fromStore });
        }
        return next;
    });
}, [storeWords]);
```

```js
// ❌ SAI — giữ lại item đã xóa
useEffect(() => {
    setItems((current) => {
        const next = current.map((item) => {
            const fromStore = byId.get(item.id);
            if (!fromStore) return item; // ← GIỮ LẠI item đã xóa!
            return { ...item, ...fromStore };
        });
        return next;
    });
}, [storeWords]);
```

---

### 7.7. Hệ thống dịch (Translate) — 2 cơ chế (2026-08-16)

> Có **2 cách dịch** trong app, dùng backend/provider khác nhau. Khi làm việc với dịch nghĩa, chọn đúng cơ chế:

| Cơ chế               | Endpoint                     | Script                                     | Provider                                                                                                   | Dùng cho                                     |
| -------------------- | ---------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **deep_translator**  | `POST /api/translate`        | `translate_pair.py` → `translate_utils.py` | `deep_translator` fallback chain: **Google → MyMemory → Pons → Linguee**                                   | "Đồng bộ nghĩa Việt - Anh" (`api.translate`) |
| **Google web (gtx)** | `POST /api/translate-google` | `translate_google.py`                      | Google `translate.googleapis.com/translate_a/single?client=gtx` — **gọi thẳng, không qua deep_translator** | "Dịch từ tiếng Anh" (`api.translateGoogle`)  |

**Khác biệt quan trọng:**

- **deep_translator**: validate mã ngôn ngữ (chỉ nhận danh sách — **CHẶN `yue`**); có fallback khi Google rate-limit (429) → đỡ chết; frontend `normalizeMeaningSync` → kết quả **lowercase** + chuẩn hoá dấu tách.
- **Google web (gtx)**: nhận **mọi mã ngôn ngữ (kể cả `yue`/Cantonese)**; KHÔNG có fallback (Google lỗi là fail); frontend `capitalizeSentences` → kết quả **viết hoa đầu câu**.
- Với cặp **en→vi**, cả 2 đều gọi Google Translate → **output trùng hệt**; chỉ khác về fallback/rate-limit. Khác biệt thực sự là **`yue`** (deep_translator không làm được → phải dùng gtx).
- Hiệu năng gần tương đương (cùng backend Google; gtx nhẹ hơn chút — không validate/parse thư viện).

**Vị trí code:**

- Backend: `backend/routes/translate.js` (`/translate` + `/translate-google`), `backend/scripts/translate_pair.py`, `backend/scripts/translate_google.py`, `backend/scripts/translate_utils.py`.
- Frontend: `frontend/src/lib/api.js` (`api.translate` / `api.translateGoogle`), `frontend/src/components/WordEditFields.jsx` (`MeaningCard` — nút "Đồng bộ nghĩa Việt - Anh" vs "Dịch từ tiếng Anh").
- ⚠️ `backend/scripts/translate_cantonese.py` + nhánh dispatch `yue` trong `/translate` là **legacy — frontend không còn dùng** (giữ lại, vô hại). Cần `docker compose ... restart backend` khi đổi route.

---

## 8. UI/UX Design System

> ⚠️ App đang theo **shadcn/ui (Base UI — style `base-nova`)**. Skills chuẩn nằm ở `.agents/skills/shadcn/` (bắt buộc đọc khi làm UI) và `.agents/skills/migrate-radix-to-base/`. Project config: `frontend/components.json` → style `base-nova`, base `base`, TS `false`, css `src/globals.css`.
>
> **Skills Prisma (2026-08-16, `.agents/skills/prisma-*`):** `prisma-cli`, `prisma-client-api`, `prisma-database-setup`, `prisma-postgres`, `prisma-postgres-setup`, `prisma-upgrade-v7` — dùng khi làm việc với Prisma CLI/Client/setup/cloud. Project dùng Prisma 7.8.0 (`prisma-client` generator → `backend/generated/prisma`, adapter `PrismaPg`, `prisma.config.ts`).

### 8.0 Quy tắc shadcn/ui & Base UI — BẮT BUỘC

- ✅✅ **ƯU TIÊN HÀNG ĐẦU: dùng component shadcn CÓ SẴN trước hết** (`frontend/src/components/shadcn/`) — đã cài: button, card, input, label, badge, separator, dialog, select, dropdown-menu, tabs, table, **skeleton**, tooltip, textarea, switch, checkbox, alert.
- ❌ **KHÔNG tự dựng component mới khi shadcn đã có sẵn** — vd loading phải dùng `Skeleton` (shadcn), KHÔNG tự viết skeleton custom; nếu cần component chưa cài → `npx shadcn add <tên>` thay vì viết tay.
- ✅ Trước khi tạo BẤT KỲ UI element nào: **kiểm tra `frontend/src/components/shadcn/` trước** — chỉ tự viết khi thật sự không có (layout đặc thù / chức năng riêng).
- ✅ **Semantic colors** — dùng `bg-primary`, `text-muted-foreground`, `bg-background`, `border-input`, `text-destructive`... ❌ Không dùng raw value (`bg-blue-500`) và **không viết manual `dark:` overrides** (semantic token tự theo theme).
- ❌ **`--primary` CHỈ dùng làm màu NỀN (background), KHÔNG bao giờ dùng làm màu chữ (2026-08-13):** không `text-primary`, không `hover:text-primary`/`hover:text-primary/80` cho text — `--primary` là màu nền của theme (nút/chip/icon trên nền), dùng làm chữ sẽ sai tương phản. Khi cần màu chữ: dùng `text-foreground`, `text-muted-foreground`, hoặc màu nội dung (`text-viet`, `text-pinyin`, `text-jyutping`, `text-han-trad`, `text-han-simp`, `text-purple`).
- ❌ **CẤM MÀU LEGACY (pre-shadcn) — đã xóa hẳn (2026-08-12):** không dùng `bg-surface`, `bg-bg`, `text-text`, `text-text-h`, `text-text-muted`, `border-text-muted`, `bg-accent-bg`, `border-accent-border`, `bg-accent-hover`, `shadow-theme`/`shadow-theme-sm`, `bg-success-bg`/`text-success-text`/`border-success-border`, `bg-error-bg`/`text-error-text`/`border-error-border`, `from-accent`/`from-surface`/`to-surface`. Thay bằng semantic: `bg-card`, `bg-background`, `text-foreground`, `text-muted-foreground`, `border-muted`, `bg-primary/10`, `border-primary/25`, `bg-destructive/10`, `text-destructive`, `border-destructive/30`, `shadow-sm`, `shadow-md`. (Chỉ giữ màu nội dung: `text-han-trad`, `text-han-simp`, `text-pinyin`, `text-jyutping`, `text-viet`, `text-purple`, `text-han-pop-*`.)
- ✅ **`text-purple` (màu TÍM — token riêng, 2026-08-14):** `--purple-color` (light `#7c3aed` / dark `#a78bfa`) → `--color-purple` trong `globals.css` (`@theme` + `:root` + `.dark`). Dùng làm màu nội dung phân biệt — hiện dùng cho **title meaning group** (số La Mã + tên từ điển trong `WordDetailContent`/`ReadingMeaningsBlock`). ❌ KHÔNG dùng `text-han-pop-4` cho mục đích này (đó là thang phổ biến hán tự, không phải token tím chung).
- ✅ **Dùng variant có sẵn trước** — `variant="outline"`, `size="sm"`... Không tự override style component.
- ✅ **`className` chỉ để layout** — không override màu/typography của component.
- ❌ **Không dùng `space-x-*` / `space-y-*`** — dùng `flex gap-*` / `flex flex-col gap-*`.
- ✅ **Base UI: dùng `render` prop thay `asChild`** — `<Button nativeButton={false} render={<Link to="/x" />}>`; Dialog/Select/etc. dùng `trigger` (Base UI) hoặc `render` — check `base` field từ `npx shadcn@latest info`.
- ✅ **Dropdown PHẢI dùng shadcn `Select`** (`components/shadcn/select.jsx`) — KHÔNG dùng native `<select>`, KHÔNG dùng `CustomSelect` cũ cho code mới.
- ✅ **Dialog/Sheet/Drawer luôn có `Title`** (dùng `sr-only` nếu ẩn) — a11y bắt buộc.
- ✅ **Icon trong Button dùng `data-icon="inline-start"`/`"inline-end"`** — không thêm `size-*` cho icon trong component.
- ✅ **Empty state dùng `Empty`, callout dùng `Alert`, loading dùng `Skeleton`, ngăn cách dùng `Separator`** — không tự dựng div custom.
- ✅ **`cn()` cho class điều kiện** — không viết template literal ternary thủ công.
- ❌ **Không manual `z-index` trên overlay** (Dialog, Sheet, Popover tự quản lý).
- 📖 Chi tiết Incorrect/Correct: `.agents/skills/shadcn/rules/*.md` (styling, forms, composition, icons, base-vs-radix, chat).

### 8.1 Component tái sử dụng

Khi tạo UI, ưu tiên dùng các component có sẵn:

### 8.2 Quy tắc bắt buộc

- ✅ **Cặp phiên âm `pinyin | jyutping` PHẢI dùng `ReadingPair`** (`frontend/src/components/ReadingPair.jsx`) — grid `1fr_auto_1fr` để `|` luôn căn giữa 2 cột, bất kể độ dài 2 bên.
    - ✅ `left` = pinyin, `right` = jyutping; `leftClass`/`rightClass` để tô màu (`text-pinyin`/`text-jyutping`).
    - ✅ Áp dụng cho MỌI nơi hiển thị cặp: detail (`WordDetailContent.jsx`), related words, bảng (`WordRow.jsx`), other pronunciations (`WordDetailPage.jsx`), Han character breakdown...
    - ❌ KHÔNG viết grid/flex thủ công kiểu `1fr_auto_1fr` rải rác — phải dùng chung component để đồng bộ.
- ✅ **Thứ tự hiển thị Hán tự + phiên âm khi có cả giản/phồn:** **Giản thể + Pinyin LUÔN đứng trước** (trái), **Phồn thể + Jyutping đứng sau** (phải).
    - ✅ Ví dụ: `男篮 | 男籃` / `nán lán | naam4 laam4` (cột trái = giản thể + pinyin, cột phải = phồn thể + jyutping) — `WordRow.jsx`.
    - ✅ Áp dụng cho MỌI nơi hiển thị cặp giản/phồn kèm phiên âm: bảng (`WordRow.jsx`), detail (`WordDetailContent.jsx`), flashcard...
    - ❌ KHÔNG để phồn thể / jyutping đứng trước giản thể / pinyin.

### 8.3 Quy tắc Spacing — BẮT BUỘC

**Thang đo cố định (root font-size = 20px):**

| Token Tailwind          | Pixels   | Dùng khi                              |
| ----------------------- | -------- | ------------------------------------- |
| `gap-2` / `p-2` / `m-2` | **10px** | Khoảng cách nhỏ, inline elements      |
| `gap-4` / `p-4` / `m-4` | **20px** | Khoảng cách mặc định giữa các section |
| `gap-6` / `p-6` / `m-6` | **30px** | Khoảng cách lớn giữa nhóm section     |
| `gap-8` / `p-8` / `m-8` | **40px** | Page padding, section cách xa nhau    |

**⚠️ KHÔNG dùng các giá trị lẻ:** `gap-1` (5px), `gap-3` (15px), `gap-5` (25px), `gap-7` (35px) — trừ khi thật sự cần thiết cho inline elements nhỏ.

**Quy tắc theo vùng:**

| Vùng                    | Spacing                           | Giá trị                           |
| ----------------------- | --------------------------------- | --------------------------------- |
| **Page content**        | `px-4 py-8 pb-12`                 | 20px sides, 40px top, 60px bottom |
| **Section lớn**         | `gap-4` giữa các section          | 20px                              |
| **Card / Block**        | `p-4` padding, `gap-4` giữa cards | 20px                              |
| **Popup header**        | `px-6 py-4 mb-2` cách body        | 10px margin-bottom                |
| **Popup footer**        | `px-6 py-4 mt-2` cách body        | 10px margin-top                   |
| **Popup body**          | `px-4 py-6 sm:px-8`               | 20px/30px/40px                    |
| **Nội dung trong card** | `gap-4` giữa các phần tử          | 20px                              |
| **Inline elements**     | `gap-2` giữa các phần tử nhỏ      | 10px                              |
| **Buttons**             | `gap-2` giữa các nút              | 10px                              |
| **Form fields**         | `mb-2` giữa các field             | 10px                              |
| **Table cell**          | `py-2 px-3`                       | 10px/15px                         |

**Quy tắc bắt buộc:**

- ✅ **Luôn dùng `gap`** trong flex/grid — không bao giờ `gap-0`
- ✅ **Section liền kề** = `gap-4` (20px)
- ✅ **Card nội dung** = `p-4` (20px) padding
- ✅ **Popup header/footer** cách body = `mb-2`/`mt-2` (10px)
- ✅ **Inline elements** = `gap-2` (10px)
- ❌ **Không dùng** `gap-1`, `gap-3`, `gap-5` trừ inline elements nhỏ
- ❌ **Không bao giờ** để nội dung chạm viền (phải có padding ≥ `p-4`)
- ❌ **Không bao giờ** để 2 phần tử liền kề không có gap/margin

### 8.3.1 Quy tắc DEBOUNCE — BẮT BUỘC (2026-08-17)

- ✅ **Mọi debounce search/filter/dup-check khi gõ = `SEARCH_DEBOUNCE_MS = 300`** — import từ `frontend/src/lib/timing.js`, **KHÔNG hardcode** số khác.
- ✅ Áp dụng cho: search bảng từ vựng (`WordBankBrowseTable`), dup-check trùng từ (`WordDetailContent`), search Grammar/Han-characters (`useDebouncedValue(search, SEARCH_DEBOUNCE_MS)`).
- ✅ Khi debounce đang chạy (searchValue ≠ debouncedSearch) → hiện **loading skeleton trong table body** (`WordBankBrowseTable` `searching` + `SkeletonTable`) — không phải trong ô tìm kiếm.
- ✅ Lý do: lọc dữ liệu lớn (~14k từ) mỗi lần gõ → lag; debounce 300ms cân bằng giữa phản hồi & hiệu năng.

### 8.4 Bảng Pinyin & Bảng Jyutping (pronunciation charts)

**Trang Pinyin** (`/pinyin`, `PinyinTablePage.jsx`):

- Data: `frontend/src/data/pinyinTable.js` (407 âm tiết, 22 hàng × 37 cột — `PINYIN_ROWS`, `PINYIN_FINALS`, `PINYIN_FINAL_NAMES`), `frontend/src/data/pinyinTones.js` (`addTone`, audio helpers, `PINYIN_TONES=[1..5]`).
- Có ô tìm kiếm: gõ lọc bảng theo âm tiết/phiên âm (ẩn các âm không khớp, hiện `noResults` khi rỗng).
- Có bộ nút lọc theo phụ âm đầu (xếp bảng chữ cái, `Ø` đứng trước).
- Click ô → `PinyinSyllableDialog.jsx`: 5 nút thanh điệu 1-5, click mới phát âm, **KHÔNG auto-play**.
- ❌ `ei` đứng riêng **không tồn tại** (dữ liệu nhaihsk sai) — đã xóa khỏi hàng `Ø`; chỉ giữ cột `ei` cho bei/pei/mei/fei...

**Trang Jyutping** (`/jyutping`, `JyutpingChartPage.jsx`):

- Gồm 4 section, title hiện số đếm: **Thanh điệu (6)**, **Phụ âm đầu (19)**, **Vần (54)**, **Bảng âm tiết (620)**.
- Data: `frontend/src/data/jyutpingTable.js` — 19 phụ âm đầu (`JYUTPING_INITIALS`, grid 5×5 `JYUTPING_INITIAL_GRID`), vần (`JYUTPING_FINAL_COLS` = 9 + m/ng, 8 hàng coda `JYUTPING_FINALS`), 6 thanh điệu (`JYUTPING_TONES`), audio helpers `jyutpingInitialAudioUrl`/`jyutpingFinalAudioUrl`/`jyutpingToneAudioUrl` (mặc định local, có `*CdnUrl`).
- Bảng âm tiết: `frontend/src/data/jyutpingSyllableTable.js` — **file GENERATED** (`JYUTPING_SYL_ROWS`, `JYUTPING_SYL_TOTAL=620`, `JYUTPING_SYL_INITIAL_COUNT=19`, `JYUTPING_SYL_FINAL_COUNT=54`, `JYUTPING_SYL_TONE_COUNT=6`). ❌ **KHÔNG sửa tay** — chạy lại `frontend/scripts/build-jyutping-table.mjs`.
- Script build: `frontend/scripts/build-jyutping-table.mjs` đọc `frontend/scripts/db_jyutping.txt` (export cột `jyutping` từ DB `vocabularies`), strip tone, chỉ giữ âm tiết có vần ∈ 54 vần chuẩn + m/ng. Lệnh export (chạy trong `E:\Code`):
  `docker compose -f docker-compose.dev.yml exec -T db psql -U cantonese -d cantonese -t -A -c "SELECT jyutping FROM vocabularies WHERE jyutping IS NOT NULL AND jyutping <> '';" | Out-File -FilePath frontend/scripts/db_jyutping.txt -Encoding utf8`
- Component: `frontend/src/components/JyutpingSyllableGrid.jsx` (click ô → phát âm vần/final — không có MP3 riêng cho từng tổ hợp), `ToneDiagram.jsx` (SVG thanh điệu 1-6).
- UI labels: dùng **"Phụ âm đầu"** (KHÔNG dùng "Thanh mẫu"), **"Vần"** (KHÔNG dùng "Vận mẫu") — trong `vi.js`/`en.js` (block `jyutping`: `initialsTitle`, `finalsTitle`, `syllableGrid*`).

**Audio local** (`frontend/public/audio/` — đã gitignore):

- `frontend/scripts/download-audio.mjs`: tải MP3 pinyin (Yabla) + jyutping (Open Cantonese), hỗ trợ `--only=pinyin|jyutping`, concurrency 8, tự bỏ qua file có sẵn.
- Luồng phát: **local MP3 → CDN → TTS fallback** (`lib/speech.js`).

### 8.5 Mô hình hiển thị Hán tự + màu/font — đã thống nhất (2026-08-13)

**Mô hình 2 cột (chỉ dùng cặp simp + hk, tạm ẩn hanTraditional):**

- Cột trái **Mandarin** = `hanSimplified` (**xanh** `text-han-simp`) + **pinyin** (**trắng** `text-pinyin`). (2026-08-20 — trước "toàn xanh", pinyin giờ trắng)
- Cột phải **Cantonese** = `hanHongKong` (**đỏ** `text-han-trad`) + **jyutping** (**trắng** `text-jyutping`). (2026-08-20 — trước "toàn đỏ", jyutping giờ trắng)
- ❌ **CẤM fallback chéo cột:** Mandarin CHỈ hiển thị `hanSimplified` (rỗng → `-`); Cantonese CHỈ hiển thị `hanHongKong` (rỗng → `-`). KHÔNG fallback simp→trad/hk hay ngược lại. (2026-08-13 — từng bị lỗi `mandarinHan = simplified || traditional`)
- Chữ nào khác bản kia (trong cột Mandarin) → **chấm vàng nhỏ trên đỉnh** (`bg-yellow-500`, `size-1.5`, absolute `-top-2`); KHÔNG đổi màu chữ, KHÔNG nền, KHÔNG gạch chân.
- Trước đó đã bỏ cơ chế tô per-char đỏ/xanh (`renderHanWithDiff`), thay bằng chấm vàng — file: `WordDetailContent.jsx` (`renderHanWithDiffMark`), `WordRow.jsx` (`HanVariantCell`).

**Màu text:**

- **Sino (Hán-Việt) → trắng** `text-foreground` (cả toggle bar `WordDetailPage` lẫn detail `WordDetailContent`).
- **Nhãn cột** (`Mandarin`/`Cantonese`) + **số La Mã** (roman badge) → `text-viet` (**trắng** — chuẩn mới 2026-08-20); **title nhóm meaning** → `text-foreground`.
- Title nhóm theo dict: hiển thị **`粵典–words.hk`** / **`CC-Canto`** (map hiển thị trong `WordDetailContent`; `category` trong DB giữ nguyên `words.hk`).

**YSK badge — ĐÃ XÓA (2026-08-16):** bỏ hoàn toàn `pureCantonese` (cột DB, toggle edit "Tiếng Quảng thuần", YSK badge, i18n).

**Nút link từ điển (toolbar detail):**

- Nút pill `h-9 px-3 rounded-full` với **icon brand**: Hanzii (gấu trúc), Google (G đa màu `GoogleIcon`), JyutDict (icon đỏ). Ảnh: `frontend/public/brand/` (hanzii-logo.webp, jyutdict-icon.svg); component `BrandIcons.jsx`.

**Chip phiên âm (toggle bar):**

- ⚠️ **Model mới (2026-08-14):** đọc từ blocks `vocabulary.mandarin`/`vocabulary.cantonese` — mỗi reading là `{ id, romanization, sino_vietnamese, meanings[] }`; `mandarin.system="pinyin"`, `cantonese.system="jyutping"`. (Cũ: typed array `{type:"pinyin"|"jyutping"}` — frontend adapter `vocabNewToLegacy` giữ shape cũ cho store.)
- **Chip tách 2 hàng toggle riêng** (`WordDetailPage.jsx`):
    - Hàng 1 = **sino-pinyin** (chip `NHẤT | yī`).
    - Hàng 2 = **sino-jyutping** (chip `NHẤT | jat1`).
- **Meaning follow reading được chọn:** detail hiện 2 section (Mandarin + Cantonese) qua `ReadingMeaningsBlock` (`WordDetailContent.jsx`); edit có 2 `MeaningsEditor` (mỗi reading 1 cái) + `PronunciationEditor` 2 section.
- Chip **luôn hiện** kể cả khi **chỉ 1 phiên âm**, và hiện **cả ở edit mode** (toggle chip + `PronunciationEditor` cùng lúc).

---

## 9. Ghi chú kỹ thuật đã xác minh (2026-08-02)

### 9.1 Sync Han Characters (nút duy nhất trên HanCharactersPage)

- **Luồng**: Click "Sync Han Characters" → chọn **mode** → gọi `/api/data/sync-han-characters/preview` (tính trước, KHÔNG ghi DB) → hiện modal liệt kê hán tự mới + hán tự cần update → "Confirm Sync" → tạo job (`POST /data/sync-han-characters` trả `jobId`) → frontend poll `/data/sync-han-characters/progress/:jobId` mỗi 1.5s → hiện tiến trình % + chi tiết (processed/total, created, updated, linked, merged).
- **2 mode sync** (body API gửi `{mode}`):
    - **`fast`** (mặc định): chỉ xử lý vocab có `hanCharacters = DbNull` (skip từ đã sync), **không xóa gì**.
    - **`full`**: xóa hết `vocabulary_characters` + `han_characters` rồi sync lại toàn bộ. Preview báo **New = Total, Update = 0, Same = 0** (vì store bị xóa trước).
- **Backend**: `backend/lib/hanCharacterBreakdown.js` (`computeHanCharacters` căn chỉnh cả pinyin/jyutping/**sinoVietnamese** theo vị trí; `resolveHanCharacter` dedupe hán tự trùng — merge readings vào keeper, re-link, xóa dupes; `syncVocabularyHanCharacters`; `backfillVocabularyHanCharacters(where, onProgress, mode)`; `previewVocabularyHanCharacters(mode)`). Job manager: `backend/lib/hanCharSyncJob.js` (`runSyncJob(jobId, mode)`, job có `job.mode`, `job.reset`).
- **Sino-Vietnamese "A | B" = 1 reading**: `"TỊNH | TÍNH"` là **một** reading (đọc TỊNH _hoặc_ TÍNH), KHÔNG phải 2 reading. `splitSinoVietnameseParts` giữ nguyên nhóm `|`; `mergeSinoReadings` gộp (và xóa các alternative standalone cũ như `"TỊNH"`, `"TÍNH"` bị tách sai từ trước).
- **Preview modal**: mode selector đặt NGOÀI nhánh loading (luôn hiển thị), nút mode `disabled` khi đang load, hiện spinner + "Analyzing vocabularies…". Detail list hiện readings kèm label Pinyin/Jyutping/Sino (không ẩn trong tooltip).
- **Không có nút riêng để dedupe** — việc dedupe tự xảy ra trong lúc sync (qua `resolveHanCharacter`).
- **Đã xóa**: `MissingHanCharsSync.jsx`, `hanCharExtract.js` (thay bằng sync backend).

---

## 10. Cloud Backup — Database local → Supabase & Prisma cloud (BẮT BUỘC hỏi trước)

> Database local là nguồn duy nhất. 2 đám mây backup đều mirror local (ghi đè/upsert). **Mọi thao tác ghi lên cloud đều phải hỏi user trước.**

### 10.1 Connection strings (không commit)

| Đám mây      | File                                 | Nội dung                                                                                     |
| ------------ | ------------------------------------ | -------------------------------------------------------------------------------------------- |
| Supabase     | `backend/.env.supabase` (gitignored) | `SUPABASE_URL=https://tifgjbsfcajmxbzflcbm.supabase.co`, `SUPABASE_SECRET_KEY=sb_secret_...` |
| Prisma cloud | `backend/.env.cloud` (gitignored)    | `DATABASE_URL='postgres://<user>:<key>@db.prisma.io:5432/postgres?sslmode=require'`          |

### 10.2 Script backup

| Script                            | Đích         | Cơ chế                                                                                                        | Chạy                                                  |
| --------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `backend/backup-supabase.mjs`     | Supabase     | Prisma đọc local → upsert theo `id` (idempotent) BATCH=400                                                    | `node /app/backup-supabase.mjs --dry` / `--apply`     |
| `backend/backup-prisma-cloud.mjs` | Prisma cloud | BEGIN → ALTER frequency → DELETE hết (reverse FK) → INSERT 500/batch `ON CONFLICT ("id") DO NOTHING` → COMMIT | `node /app/backup-prisma-cloud.mjs --dry` / `--apply` |
| `backend/verify-prisma-cloud.mjs` | Prisma cloud | Đếm từng bảng để đối chiếu local/cloud                                                                        | `node /app/verify-prisma-cloud.mjs`                   |

- Chạy trong container: `docker compose -f docker-compose.dev.yml exec -T backend node /app/<script> --apply`
- Cả 2 script đều có `--dry` để preview trước khi ghi.

### 10.3 Lưu ý kỹ thuật (đã xác minh 2026-08-07)

- **Prisma cloud reset-toàn-bộ:** script xóa hết cloud rồi copy lại — nếu lỗi giữa chừng sẽ `ROLLBACK` an toàn, không để cloud ở trạng thái nửa chừng.
- **JSONB/JSON columns** (hanCharacters breakdown, details, notes...): node-pg parse thành JS object → phải `JSON.stringify` lại trước khi insert.
- **ARRAY columns** (`han_characters.sino_vietnamese/pinyin/jyutping` là `text[]`): node-pg trả JS array → phải convert sang PG array literal `{…}` qua `pgArrayLiteral()` (nếu insert `["LINH"]` sẽ lỗi `malformed array literal`). Không đăng ký parser toàn cục cho TEXT oid (quá rộng) — normalize theo `information_schema.columns.data_type`.
- **`han_characters.frequency`:** cloud có thể thiếu cột (schema cũ hơn local) → script tự `ALTER TABLE "han_characters" ADD COLUMN IF NOT EXISTS frequency INTEGER` sau BEGIN.
- **Thứ tự FK (Prisma cloud, 15 bảng 2026-08-16):** users → radicals → han*characters → vocabularies → vocabulary_readings → vocabulary_meanings → vocabulary_examples → vocabulary_characters → user_vocabularies → grammars → grammar_examples → flashcard_decks → flashcard_deck_vocabularies → vocabulary_sets → vocabulary_set_vocabularies. DELETE theo thứ tự ngược. *(⚠️ 2026-08-16: `sentence_patterns` đã drop; schema quan hệ thay `romanization_json`. `hanzi_simplified_hk` rỗng, `movie_word_rank`/`book_word_rank` drop.)\_
- **Supabase upsert:** bảng chưa tồn tại → tạo bằng `backend/supabase-schema.sql` hoặc `supabase/migrations/20260807000000_create_tables.sql`. Sau khi tạo/xóa bảng cần `NOTIFY pgrst, 'reload schema'`; sau khi reset schema cần `GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role` + `ALTER DEFAULT PRIVILEGES`.
- **Verify Supabase:** `npx supabase db query --linked "SELECT count(*) FROM vocabularies;"` (dùng Management API, không cần password).

### 10.4 Baseline đã verify (2026-08-16)

| Bảng                  | Local / Cloud |
| --------------------- | ------------- |
| users                 | 3             |
| radicals              | 214           |
| han_characters        | 2,937         |
| vocabularies          | 14,483        |
| vocabulary_readings   | 30,314        |
| vocabulary_meanings   | 51,545        |
| vocabulary_examples   | 27,918        |
| vocabulary_characters | 18,962        |
| user_vocabularies     | 43,172        |

→ Sau mỗi lần backup: chạy `sync-cloud-schema.mjs` TRƯỚC (đồng bộ schema cloud = local, hanzi rename) rồi `backup-prisma-cloud.mjs --apply`, rồi `verify-prisma-cloud.mjs` đối chiếu 3 phía khớp.

---

## 11. Tooling — pnpm 11 (2026-08-18)

- **pnpm 11.22.0** toàn bộ: global + `packageManager` (root/backend/frontend) + Dockerfile `corepack prepare pnpm@11.22.0`.
- **Upgrade global = `pnpm self-update`** — ❌ KHÔNG `pnpm add -g pnpm` (standalone install báo lỗi "global bin dir not in PATH").
- **Global config pnpm 11 đọc `AppData\Local\pnpm\config\config.yaml`** — ❌ KHÔNG đọc file `rc` (file cũ của pnpm 9). Set store về C: `pnpm config set store-dir "C:\Users\milul\AppData\Local\pnpm\store"`.
- **`allowBuilds`:** pnpm 11 bỏ `onlyBuiltDependencies` → dùng map `allowBuilds: {<tên>: true}` trong `pnpm-workspace.yaml`. ⚠️ File phải nằm trong **từng package** (root + `frontend/` + `backend/`) vì Docker build context = thư mục package; Dockerfile deps stage phải `COPY pnpm-workspace.yaml`. Kèm `confirmModulesPurge: false` khi đổi pnpm version (non-TTY).
- **Lockfile:** pnpm 9 (lockfileVersion 9.0) tương thích pnpm 11 — `pnpm install --frozen-lockfile` pass, không cần regen lockfile.
- **Áp dụng đổi pnpm version lên container:** `docker compose -f docker-compose.dev.yml down` → `docker volume rm <proj>_frontend_node_modules <proj>_backend_node_modules` (volume cũ chứa node_modules version cũ — phải xóa để nạp lại từ image mới) → `up -d --build`.
- ⚠️ **Store "cùng ổ" (dễ hiểu nhầm):** pnpm tự đặt store ở `<mountroot>/.pnpm-store/v11` (cùng ổ với project) khi **không hardlink xuyên ổ đĩa** được (vd C:↔E:). Lệnh `pnpm store path` hiển thị store fallback này chứ KHÔNG phản ánh config `store-dir` → đừng tưởng config sai. Store này nhỏ, vô hại, xóa được.
- ⚠️ **Workflow cài dependency — BẮT BUỘC (2026-08-23):** ❌ **KHÔNG chạy `pnpm install`/`pnpm add` BÊN TRONG container** (`docker compose exec ... pnpm install`) — tạo `.pnpm-store` (~20k file) trong project bind-mount → Vite walk chậm → F5 lag 16-23s. ✅ Cài trên **HOST terminal** (vd `cd frontend; pnpm add <pkg>`), rồi **rebuild docker**: `docker compose -f docker-compose.dev.yml up -d --build frontend`. Nếu lỡ tạo `.pnpm-store`: xóa `Remove-Item -Recurse -Force frontend\.pnpm-store` + restart frontend.
- 🧹 Node_modules host (root/frontend ~1GB, backend stub) **không được container dùng** — Docker map named volume `*_node_modules` đè lên `/app/node_modules` (dep từ image build). Chỉ phục vụ tool host (lint/vercel deploy).
