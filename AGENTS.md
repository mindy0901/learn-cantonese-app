# Agent Guidelines — Learn Cantonese App

> Dành cho các AI agent khi làm việc với project này. Đọc kỹ trước khi thực hiện bất kỳ thay đổi nào.
>
> ⚠️ **QUAN TRỌNG:** Database PostgreSQL là nguồn dữ liệu duy nhất. Tuyệt đối không xóa, ghi đè, hay chạy seed/migration mà không có sự đồng ý rõ ràng của user. Phải hỏi user và chờ xác nhận trước khi thực hiện bất kỳ thao tác nào liên quan đến database.
>
> 🚨 **2026-09-19 — DB CỦA APP ĐÃ CHUYỂN SANG SUPABASE:** `DATABASE_URL` trong `.env.dev` (và `.env.prod`) trỏ tới **Supabase session pooler** ⇒ mọi thao tác qua app/API/Prisma **ghi trực tiếp lên CLOUD**. DB local trong Docker chỉ còn là **snapshot cuối 2026-09-19** (service `db` nằm trong profile `local-db`, không tự start). Vì vậy quy tắc "hỏi trước khi ghi/xóa DB" giờ áp dụng cho **cloud** — cẩn trọng gấp đôi.

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

| Domain                        | Dùng                                                                           | Không dùng       |
| ----------------------------- | ------------------------------------------------------------------------------ | ---------------- |
| Từ vựng (variable, prop, key) | `vocabulary` / `vocabularies`                                                  | `word` / `words` |
| Ngữ pháp                      | `grammar` / `grammars`                                                         |                  |
| Bài học                       | `lesson` / `lessons`                                                           |                  |
| Hán tự                        | `hanziCharacters` (JSONB trên bảng vocab) — frontend store vẫn `hanCharacters` |                  |
| Flashcard                     | `flashcard` / `flashcards`                                                     |                  |

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

- ⚠️ **2026-09-19 — DB đang dùng = SUPABASE project SINGAPORE** (`DATABASE_URL` trong `.env.dev`/`.env.prod` = session pooler `aws-0-ap-southeast-1`, ref `fvelhqjrpyyrqjkaxyku`).
- ⛔ **Service `studio` (Prisma Studio `:5555`) ĐÃ XÓA khỏi `docker-compose.dev.yml` (2026-09-19).** Cần xem/sửa data trực tiếp thì chạy tạm: `docker compose -f docker-compose.dev.yml run --rm -p 5555:5555 backend npx prisma studio --port 5555 --browser none` hoặc dùng Dashboard Supabase.
- **Vì sao Singapore:** đo RTT từ máy user (Hong Kong): Singapore **42ms** < Tokyo 55-64ms < Mumbai 132-141ms. Region **Hong Kong (`ap-east-1`) là private region — KHÔNG tạo được** (API trả "ap-east-1 is a private region"). Project cũ Mumbai `tifgjbsfcajmxbzflcbm` **vẫn giữ** để rollback (đổi DATABASE_URL về pooler Mumbai `aws-1-ap-south-1`).
- ⛔ **DB local (Docker) ĐÃ XÓA HẲN (2026-09-19):** service `db` + volume `pgdata` đã bị gỡ khỏi `docker-compose.dev.yml` (theo yêu cầu user). Snapshot cuối 2026-09-19 đã dump ra **`backend/_local-snapshot-2026-09-19.dump`** (pg*dump -Fc, ~18MB, gitignored). Muốn test local: chạy container postgres tạm rồi `pg_restore` (lệnh mẫu ghi ở đầu `docker-compose.dev.yml`). `.env.dev` còn `DATABASE_URL_LOCAL*\*` chỉ để tham chiếu.
- **Prisma cloud** (`db.prisma.io`) chỉ còn là bản mirror lịch sử — app KHÔNG dùng.
- Trước khi đổi dữ liệu lớn: nên thử trên project Supabase tạm/restore từ dump rồi mới áp lên project chính (cloud = dữ liệu thật).

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
- ✅ Dữ liệu `mandarin_vocabulary_romanizations` / `cantonese_vocabulary_romanizations` đã chuẩn hóa lowercase (2026-08-02)

**Quy tắc case cho vietMeanings / engMeanings / pinyin / jyutping / sinoVietnamese (BẮT BUỘC):**

| Field            | Quy tắc                                                                               | Ví dụ                                                              |
| ---------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `vietMeanings`   | **Luôn viết hoa chữ cái đầu mỗi câu** (hàm `capitalizeSentences`, `wordNormalize.js`) | `"lấy"` → `"Lấy"`; `"to take; to cancel"` → `"To take; To cancel"` |
| `engMeanings`    | Giống `vietMeanings` — viết hoa đầu câu                                               | `"to cancel"` → `"To cancel"`                                      |
| `pinyin`         | **Luôn lowercase** khi lưu (`normalizeVocabularyFields` + `vocabularyToRow`)          | `"Qǔ xiāo"` → `"qǔ xiāo"`                                          |
| `jyutping`       | **Luôn lowercase** khi lưu                                                            | `"Ceoi2 siu1"` → `"ceoi2 siu1"`                                    |
| `sinoVietnamese` | **Luôn uppercase** (viết hoa đầu mỗi reading — `normalizeSinoVietnameseValue`)        | `"tịnh"` → `"TỊNH"`; `"a di"` → `"A DI"`                           |

- ❌ **KHÔNG** title-case từng từ cho `vietMeanings`/`engMeanings` (không `"To Take"`, chỉ `"To take"`).
- ✅ Áp dụng ở cả lúc **lưu** (frontend `normalizeVocabularyFields`, backend `prismaServiceSplit.js` `vocabularyToRow`/`normalizeReadings`/`writeVocabularyReadings`) — script fix dữ liệu cũ `normalize-vocab-case.mjs` **đã xoá 2026-09-27** (tham chiếu model đã drop).
- ⚠️ **2026-08-16 → split (08-17):** các cột flat ĐÃ DROP — dữ liệu nằm trong bảng tách theo ngôn ngữ: `mandarin/cantonese_vocabulary_meanings.vi`/`en` (meaning), `mandarin/cantonese_vocabulary_romanizations.pinyin|jyutping` (lowercase), `..._sino_vietnamese` (uppercase). Quy tắc case vẫn áp dụng cho các field này.

### 1.4 ID cố định (stable UUID)

> ⚠️ **2026-08-16:** mọi bảng vocab + bảng con giờ dùng **random UUID** (id content-deterministic cũ TRÙNG giữa các vocab nên đã remap) — xem §2.3. Bảng `han_characters` đã drop (08-31) nên không còn id deterministic nữa.

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
- ✅ **Màu hiển thị hán tự theo MÔ HÌNH 2 CỘT (xem §8.5) — KHÔNG tô per-char đỏ/xanh (bỏ 2026-08-13):**
    - Cột **Mandarin** = `hanSimplified` (**xanh** `text-han-simp`) + pinyin (**trắng** `text-pinyin`); cột **Cantonese** = `hanHongKong` (**đỏ** `text-han-trad`) + jyutping (**trắng** `text-jyutping`).
    - Chữ nào khác bản kia (cột Mandarin) → **chấm vàng nhỏ trên đỉnh** (không đổi màu chữ).
    - ⚠️ **ĐỒNG NHẤT CẤU TRÚC DOM:** mọi hiển thị hán tự phải bọc **mỗi ký tự vào `<span>` riêng** (cả `renderHanText` lẫn `renderHanWithDiffMark` / `HanVariantCell`). Nếu 1 cột là text node thuần, cột kia span riêng → trình duyệt rasterize khác → **độ dày nét nhìn lệch dù computed font-weight giống nhau**. (2026-08-11)
    - ⚠️ **FONT HÁN PHẢI CỐ ĐỊNH (2026-08-11):** `Geist Variable` **KHÔNG có glyph Hán** → browser fallback sang font Hán hệ thống **KHÁC NHAU** cho run giản (`财`) vs phồn (`財`) → cùng glyph (`力`) render bằng 2 font → **độ dày nét lệch thật** (đo width 54.30 vs 53.23px). **Fix:** ép font Hán cụ thể vào `.wd-han` trong `globals.css`: `font-family: "Geist Variable", "Microsoft JhengHei", "PingFang HK", "Noto Sans CJK SC", sans-serif` → cả trad & simp fallback về cùng 1 font Hán.
    - ✅ **Màu phiên âm & nghĩa (CHUẨN MỚI 2026-08-20):** pinyin (`--pinyin-color`), jyutping (`--jyutping-color`), viet (`--viet-color`) → **TRẮNG** (`#ffffff`) — hiện trên nền tối/chip. (Cũ: jyutping đỏ / pinyin xanh / viet xanh lá — đã bỏ.)
    - ✅ **Token semantic** định nghĩa tại `frontend/src/globals.css` (`:root` + `.dark` — cơ chế theme dùng `.dark` class, xem §8.5): `--han-trad-color` (đỏ), `--han-simp-color` (xanh), `--han-mtrad-color` (tím purple-400), `--pinyin-color`/`--jyutping-color`/`--viet-color` (trắng), `--purple-color` (tím), **`--favorite-color` (đỏ — icon ❤️ yêu thích, 2026-09-27)**. Dùng class `text-han-trad` / `text-han-simp` / `text-han-mtrad` / `text-pinyin` / `text-jyutping` / `text-viet` / `text-purple` / **`text-favorite`** — **KHÔNG** dùng raw `text-red-600`/`text-blue-600` cho hán tự.
    - ✅ **Icon ❤️ yêu thích LUÔN dùng `text-favorite` (đỏ)** — áp dụng ở: header trang chi tiết (`VocabularyDetailContent`), thẻ flashcard (`FlashcardDeck`), cột bảng từ (`VocabularyRowColumns.FavoriteCell`), trang `/profile` (`ProfilePage`), form add/edit (`VocabularyEditFields`). ❌ KHÔNG dùng `text-amber-500` (màu cũ) hay `text-primary` cho ❤️. 🚫 “không muốn học” vẫn dùng `text-destructive`.
    - Áp dụng toàn app: `VocabularyDetailContent.jsx`, `VocabularyEditFields.jsx`, `VocabularyRowColumns.jsx`, `FlashcardDeckManager.jsx`, `FlashcardSessionSummary.jsx`, `OcrScanSection.jsx`, `HanziiHanCellLink.jsx` (primary = traditional → đỏ, secondary = simplified → xanh). ⚠️ `HanCharacterRow.jsx`/`HanCharacterDetailPage.jsx`/`AddHanCharacterModal.jsx`/`HanCharactersPage.jsx` **ĐÃ XÓA** (bỏ trang hán tự 2026-08-31).
    - ❌ Không dùng `text-han` (màu trung tính) cho hiển thị hán tự khi phân biệt được trad/simp — trừ danh sách skipped/không phân biệt

---

## 2. Schema Prisma — QUAN TRỌNG (SPLIT MANDARIN/CANTONESE — 2026-08-17)

> ⚠️ **Schema tách riêng 2 ngôn ngữ** (migrate 08-17, script 1 lần `migrate-split-lang.mjs` đã xoá 09-27): mỗi ngôn ngữ là 1 kho từ ĐỘC LẬP, KHÔNG còn bảng `vocabularies`/`vocabulary_*` gộp chung. Backend chính = `backend/lib/prismaServiceSplit.js` (generic theo `lang`); `backend/lib/prismaService.js` là **dead code** (chỉ auth/checkin dùng — KHÔNG sửa thêm).

**Bảng:**

| Ngôn ngữ       | Tables (Prisma model)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mandarin**   | `mandarin_vocabularies` (`MandarinVocabulary`) → `mandarin_vocabulary_romanizations` (`MandarinVocabularyRomanization`, field `pinyin`) → `mandarin_vocabulary_meanings` (`MandarinVocabularyMeaning`: `zh`/`vi`/`en`) → `mandarin_vocabulary_examples` (`MandarinVocabularyExample`: `zh`/`romanization`/`vi`/`en`)                                                                                                                                                                                                                                                                                                                                    |
| **Cantonese**  | `cantonese_vocabularies` (`CantoneseVocabulary`) → `cantonese_vocabulary_romanizations` (`CantoneseVocabularyRomanization`, field `jyutping`) → `cantonese_vocabulary_meanings` (`CantoneseVocabularyMeaning`: **chỉ `vi`/`en`**) → `cantonese_vocabulary_examples` (`CantoneseVocabularyExample`: `yue`(chữ Hán ví dụ CC101)/`romanization`/`vi`/`en`/`hanziAudio`/`englishAudio`)                                                                                                                                                                                                                                                                     |
| **Dùng chung** | `users`, `user_checkins` (check-in calendar 08-24), `user_favorite_vocabularies` (❤️ yêu thích) + `user_disliked_vocabularies` (🚫 không muốn học — loại trừ nhau, **rename từ `user_important_vocabularies` 2026-09-20**; 🚫 bị loại khỏi flashcard random + liệt kê ở trang `/profile`), `user_vocabulary_mastery` (tiến độ mastered 09-02), **`tags` + `vocabulary_tags` (tag dùng chung, CHỈ admin tạo/xóa + gắn cho từ — 2026-09-27)**, `grammars`/`grammar_examples`, `flashcard_decks` + `flashcard_deck_{mandarin,cantonese}_vocabularies`, `vocabulary_sets` + `vocabulary_set_{mandarin,cantonese}_vocabularies`, `radicals` (`HanziRadical`) |

- ✅ `hanziCharacters` (JSONB, map `hanzi_characters`) nằm **TRÊN 2 bảng vocab** — breakdown hán tự per-vocab (xem §7.6). **Bảng `han_characters` + bảng join `*_vocabulary_characters` ĐÃ DROP (2026-08-31)** — chỉ giữ `radicals`.
- ❌ **ĐÃ BỎ:** `user_vocabularies` (progress/important/mastered — 08-17), `sentence_patterns` (08-16), `romanization_json`/`meanings_json`/cột flat, `category`/`position` ở meaning (08-30), `yue` ở **meaning** cantonese (08-22), `hanzi_simplified` ở cantonese (08-22), `movie_word_rank`/`book_word_rank` (08-16).
- ✅ `pureCantonese` (Boolean) CHỈ có trên `cantonese_vocabularies` — flag từ `detect-pure-cantonese-split.mjs`; kho Cantonese ban đầu = chỉ từ pure Cantonese (381 từ, sau TypeDuck import → 9.409).
- ⚠️ **KHÔNG có unique constraint** trên hanzi — cùng chữ Hán có thể nhiều phiên âm → nhiều dòng DB.

### 2.1 Quy tắc Prisma trên project này — BẮT BUỘC

- ❌ **CẤM `npx prisma migrate dev`** — DB thật KHÔNG đồng bộ migration history (drift) → lệnh đòi RESET = **mất toàn bộ dữ liệu**.
- ✅ Thay đổi schema = tạo file SQL thủ công `backend/prisma/migrations/manual_*.sql` rồi áp bằng psql (stdin) + `npx prisma generate` (trong container `cd /app && npx prisma generate`). Ví dụ có sẵn: `manual_vocabulary_sets.sql`, `manual_add_radicals.sql`, `manual_remove_meaning_category.sql`, `manual_remove_yue_simp.sql`, `manual_add_cantonese_example_yue.sql`, `manual_add_cantonese_audio.sql`...
- ✅ `createVocabulary` dùng `create` (KHÔNG `upsert`) để không ghi đè từ đã tồn tại.
- ✅ Sau đổi backend code: `docker compose -f docker-compose.dev.yml restart backend` (tsx --watch KHÔNG reload qua bind mount); restart = logout mọi user → login lại `admin`/`admin`.
- ✅ Nguồn dữ liệu: `backend/data/` (`CCCANTO.json`, `CVDICT.json`, `CEDICT.json`, `sino-vietnamese.json`, `typeduck-import-10k.json`...).

### 2.2 API object per language — BẮT BUỘC

**Mandarin:** `{ id, hanziSimplified, hanziTraditional, hanziCharacters, hskLevel, popularity, readings:[{ id, pinyin, sinoVietnamese, meanings:[{ id, zh, vi, en, examples:[{ id, zh, romanization, vi, en }] }] }], createdAt, updatedAt }`

**Cantonese:** `{ id, hanziTraditionalHk, hanziCharacters, pureCantonese, popularity, readings:[{ id, jyutping, sinoVietnamese, meanings:[{ id, vi, en, examples:[{ id, yue, romanization, vi, en, hanziAudio, englishAudio }] }] }], createdAt, updatedAt }`

**Quy tắc:**

- ✅ **Meaning PHẲNG** — không `category`, không `position`, không group I/II/III; chỉ `vi`/`en` (+ `zh` mandarin). (08-30)
- ✅ **Example**: mandarin dùng `zh`; cantonese dùng `yue` (chữ Hán câu ví dụ CC101 — thêm lại 08-22) + `romanization` + `vi`/`en` (+ audio CC101 cho cantonese).
- ✅ `rowToVocabulary(row, lang)` (`prismaServiceSplit.js`) build từ relation `romanizations → meanings → examples`; `vocabListSummary` trả flat (flashcard/set/browse).
- ✅ Mọi reading/meaning/example có `id` (UUID random) — **KHÔNG dùng index/position định danh** (xem §2.3). `writeVocabularyReadings(lang, vocabId, readings)` delete + recreate toàn bộ (giữ `id` cũ từ payload, tự sinh UUID khi thiếu/trùng).
- ✅ Frontend adapter `vocabLangToLegacy(raw, lang)` + payload `vocabularyLangPayload(draft, lang)` (`frontend/src/lib/dataTransforms.js`) giữ shape legacy cho store; khi lưu gửi payload per-language.
- ✅ Endpoints: `/api/{lang}-vocabularies` (browse/by-ids/find-by-han/CRUD), `/api/data` trả `{ mandarinVocabularies, cantoneseVocabularies, grammars }`. Mọi mutation phải hỏi user trước (§4).
- ❌ KHÔNG dùng `prismaService.js`/`vocabModel.js`/`romanizationId.js` (dead code) cho vocab mới.

### 2.3 Object lồng nhau PHẢI có `id` (UUID) — BẮT BUỘC (2026-08-11)

> ⚠️ Áp dụng cho **mọi object lồng nhau** (reading/meaning/example). Không dùng `position`/index mảng để định danh.

**Quy tắc:**

- ✅ **Mỗi object lồng nhau PHẢI có `id` (UUID)** — KHÔNG dựa vào `position`/index mảng để định danh.
- ❌ **KHÔNG dùng index/position** làm key định danh khi edit/delete/merge — dễ lỗi.
- ✅ Bảng quan hệ cần **id duy nhất TOÀN CỤC**: id deterministic theo content/romanization có thể TRÙNG giữa các vocab → `writeVocabularyReadings` (`prismaServiceSplit.js`) tự sinh UUID khi id thiếu/trùng.
- ✅ Khi edit 1 phần tử: tìm bằng `id`, **giữ nguyên `id` cũ** — `writeVocabularyReadings` delete + recreate toàn bộ readings của vocab (giữ id từ payload).

---

### 3.1 Script sync/import dữ liệu (đều phải hỏi user trước khi chạy — có `--dry` để preview)

> ⚠️ **2026-09-27: MỌI SCRIPT CLI ĐÃ CHUYỂN VÀO `backend/scripts/`** — lệnh trong container = `docker compose -f docker-compose.dev.yml exec -T backend node /app/scripts/<script>.mjs`. `backend/` root giờ chỉ còn code + config + schema.

| Script (trong `backend/scripts/`)                       | Chức năng                                                                                                                                             |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `full-sync-mandarin.mjs`                                | Scrape Hanzii → Hán-Việt + nghĩa(vi) + ví dụ + pinyin ví dụ + dịch vi↔en                                                                              |
| `full-sync-cantonese.mjs`                               | Như trên cho Cantonese (sino CHỈ từ Hanzii, không fallback map)                                                                                       |
| `import-typeduck-cantonese.mjs`                         | Import kho TypeDuck (jyutping + nghĩa en + tần suất) → cantonese bank                                                                                 |
| `import-cc101-cantonese.mjs`                            | Import CC101 + audio                                                                                                                                  |
| `detect-`/`filter-pure-cantonese-split.mjs`             | Gắn cờ / lọc `pureCantonese` cho kho Cantonese                                                                                                        |
| `upload-cc101-audio-r2.mjs` / `restore-cc101-audio.mjs` | Upload/khôi phục audio CC101 lên R2                                                                                                                   |
| `create-admin.mjs` / `set-password.mjs`                 | Tạo user admin / đổi mật khẩu user (khôi phục login)                                                                                                  |
| §10.2                                                   | `backup-supabase.mjs`, `verify-supabase.mjs`, `backup-prisma-cloud.mjs`, `verify-prisma-cloud.mjs`, `sync-cloud-schema.mjs`, `check-cloud-schema.mjs` |

- ✅ Tất cả script đều hỗ trợ `--dry` để preview trước khi ghi; chạy trong container `docker compose -f docker-compose.dev.yml exec -T backend node /app/scripts/<script>.mjs --dry|--apply`.
- ✅ Nguồn dữ liệu nằm trong `backend/data/`: `CCCANTO.json`, `CVDICT.json`, `CEDICT.json`, `sino-vietnamese.json`, `typeduck-import-10k.json`...
- ⚠️ Script CLI đọc tài nguyên bằng đường dẫn TƯƠNG ĐỐI (`../lib/…`, `../data/…`, `../.env.cloud`, root `../../.env.dev`) — **thêm/đổi vị trí script phải sửa lại các path này**.
- ⚠️ **Đã XOÁ 2026-09-27:** `sync-jyutping.mjs`, `normalize-vocab-case.mjs`, `migrate-split-lang.mjs` (tham chiếu model/bảng ĐÃ DROP) + script cũ/1 lần: `backfill-*`, `analyze-*`, `fix-*`, `add-columns*`, `list-tables.cjs`, `dedupe-examples.mjs`, `restore-from-cloud.mjs`, `run-translate-all.sh`… (danh sách đầy đủ ở §12.1) — cần lại thì `git checkout <file>` rồi cập nhật theo schema hiện tại.

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

> 🔴 **Từ 2026-09-19 các thao tác ghi áp dụng cho DB SUPABASE (cloud)** — không còn "local nên thử thoải mái". DB local Docker đã bị xóa; nếu cần test trước, restore từ `backend/_local-snapshot-2026-09-19.dump` (xem §1.2).

### 4.2 Quy trình hỏi

1. Mô tả rõ thao tác muốn thực hiện
2. Nêu lý do cần thao tác
3. Chờ user xác nhận ("có" / "không" / điều chỉnh)
4. Chỉ thực hiện sau khi có đồng ý rõ ràng

## 7. Kiểm tra nhanh

> ⚠️ 2026-09-19: DB của app = **Supabase** (project Singapore). DB local Docker **đã xóa** — không còn lệnh `psql` local nào chạy được;
> restore tạm từ `backend/_local-snapshot-2026-09-19.dump` nếu thật sự cần (xem §1.2).
> Muốn xem số liệu trên **cloud**: `npx supabase db query --linked "SELECT count(*) FROM cantonese_vocabularies;"`
> hoặc `docker compose -f docker-compose.dev.yml exec -T backend node /app/scripts/verify-supabase.mjs`.

```bash
# Xem tổng số từ (2 kho riêng)
docker compose -f docker-compose.dev.yml exec -T db psql -U cantonese -d cantonese -c "SELECT (SELECT COUNT(*) FROM mandarin_vocabularies) AS mandarin, (SELECT COUNT(*) FROM cantonese_vocabularies) AS cantonese;"

# Xem phân bố HSK level (chỉ Mandarin có hsk_level)
docker compose -f docker-compose.dev.yml exec -T db psql -U cantonese -d cantonese -c "SELECT hsk_level, COUNT(*) FROM mandarin_vocabularies WHERE hsk_level IS NOT NULL GROUP BY hsk_level ORDER BY COUNT(*) DESC LIMIT 10;"

# Xem từ pure Cantonese (cờ pure_cantonese)
docker compose -f docker-compose.dev.yml exec -T db psql -U cantonese -d cantonese -c "SELECT COUNT(*) FROM cantonese_vocabularies WHERE pure_cantonese = true;"
```

---

## 7.5. Đồng bộ Local State ↔ Database — QUAN TRỌNG

**Nguyên tắc:** Mọi thao tác edit / delete / add vocabulary phải đồng bộ **cả 2 phía**:

| Phía               | Vị trí                            | Cơ chế                                                                                                      |
| ------------------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Database**       | PostgreSQL                        | API call (`api.updateVocabulary`, `api.deleteVocabulary`, `api.createVocabulary`, `api.editVocabularyLang`) |
| **Zustand store**  | `frontend/src/store/appStore.js`  | `set()` cập nhật `vocabularies` (bank active) + `mandarinVocabularies`/`cantoneseVocabularies` (bank index) |
| **UI local state** | `VocabularyBankBrowseTable.items` | `useEffect` sync từ `storeWords` (Zustand)                                                                  |

### 7.5.1 Vòng đời đồng bộ

```
User action → Optimistic update (store) → API call → Store sync ← UI sync (useEffect)
```

1. **Optimistic update:** Cập nhật Zustand store NGAY LẬP TỨC (trước API).
2. **API call:** Gửi request lên server.
3. **Store sync:** Khi API thành công, cập nhật store với dữ liệu từ server.
4. **UI sync:** `VocabularyBankBrowseTable` dùng `useEffect` để đồng bộ `items` từ `storeWords`.

### 7.5.2 Quy tắc bắt buộc

- ❌ **Không được** chỉ xóa khỏi store mà quên gọi API.
- ❌ **Không được** giữ lại item đã xóa trong local `items` array. Khi `fromStore` là `undefined` → **phải loại bỏ** item đó.
- ❌ **Không được** dùng `items.map()` mà không filter. Dùng `for...of` + `continue` khi item không còn trong store.
- ❌ **Không được** tự ý thao tác database mà không hỏi user trước (xem Section 4).
- ✅ **Luôn** gọi `syncMutation()` để bọc API call — nếu API fail sẽ rollback store.
- ✅ **Luôn** kiểm tra `fromStore` có tồn tại trước khi merge dữ liệu.
- ✅ Mọi mutation vocab phải đồng bộ CẢ `vocabularies` (bank active) LẪN bank index `mandarinVocabularies`/`cantoneseVocabularies` — bank index được tái dùng khi `setLanguage`/`setActiveLanguage` (không re-fetch) và cho cột Mandarin gợi ý (2026-08-23 — từng bị lỗi từ xóa hiện lại khi đổi ngôn ngữ).

### 7.5.3 Ví dụ: sync xóa từ đúng cách

### 7.6. Hán tự breakdown — tính ở FRONTEND (display) + cột `hanziCharacters` JSONB (write-side)

**Display (frontend):** breakdown tính lại từ readings ở trình duyệt — `frontend/src/lib/hanBreakdown.js` `computeHanCharacters(vocab)` (đọc `vocab.hanTraditional/hanSimplified/hanHongKong` + romanization, căn chỉnh pinyin/jyutping/Hán-Việt theo vị trí). Dùng tại `VocabularyDetailContent.jsx` (`HanCharactersBreakdown`). API KHÔNG trả `hanCharacters` nữa.

**Backend write-side:** cột `hanziCharacters` (JSONB) được ghi khi create/update — `backend/lib/hanCharacterBreakdown.js` `computeHanCharacters(vocab, lang)` (đọc sources từ `vocab.romanizations` relation — bảng `mandarin/cantonese_vocabulary_romanizations`, fallback legacy/flat). **KHÔNG còn sync lên bảng `han_characters`** (đã drop 2026-08-31).

Mỗi vocabulary có cột `hanziCharacters` (JSONB) lưu breakdown từng hán tự theo vị trí:

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
    - Script backfill: `backend/backfill-hanchar-key.mjs` (**đã xoá 2026-09-27** — tham chiếu bảng `han_characters` đã drop; cần lại thì `git checkout`).
- ✅ Breakdown tính tự động từ `hanTraditional`/`hanHongKong` + `pinyin`/`jyutping` (căn chỉnh theo vị trí), qua `backend/lib/hanCharacterBreakdown.js` (`computeHanCharacters`).
- ❌ **KHÔNG dùng regex global `/g` + `.test()`** trong vòng lặp để lọc hán tự — `.test()` stateful (lastIndex) gây lọc sai ký tự. Dùng kiểm tra code point (xem `isHanChar`).
- ✅ Frontend: `VocabularyDetailContent.jsx` hiển thị `HanCharactersBreakdown` (mỗi chữ + pinyin/jyutping). ⚠️ Không còn link tới trang HanCharacter (đã xóa).
- ⚠️ **Leftover dead code (không gây lỗi, chưa dọn):** `hanCharacterBreakdown.js` còn hàm `resolveHanCharacter`/`syncVocabularyHanCharacters`/`backfillVocabularyHanCharacters`/`previewVocabularyHanCharacters` (tham chiếu `prisma.hanziCharacter` đã drop) — **KHÔNG được gọi** ở đâu, an toàn. `prismaService.js` (legacy, không import) cũng tham chiếu — dead.

**Ví dụ §7.5.3 — sync xóa từ đúng cách (code):**

```js
// ✅ ĐÚNG — VocabularyBankBrowseTable useEffect
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

### 7.7. Hệ thống dịch (Translate) — deep_translator (Google) → LibreTranslate fallback (2026-08-24)

> Chỉ còn **1 endpoint `/api/translate`** (đã xóa `/translate-google` + `api.translateGoogle` 2026-08-24 — Google gtx bị chặn ở tầng IP nên vô dụng). Dịch nghĩa (vi↔en) + gloss zh mandarin đều đi qua pipeline này.

**Pipeline `POST /api/translate`:**

- **deep_translator (Google)** — `backend/scripts/translate_pair.py` → `translate_utils.py`. Nếu Google lỗi (429 / bị chặn) → **fallback LibreTranslate** (`backend/lib/libretranslate.js`, Argos engine, self-hosted `:5000`, không rate-limit).
- Response: `{ translated, source: "google"|"libretranslate", reason, googleCode }` — `source` hiển thị trong Full Sync (" — Google" / " — LibreTranslate (Google 429)").
- ⚠️ Google bị chặn **ở tầng IP** (403/429/200-rỗng) — KHÔNG phải quota API, không fix bằng đổi thư viện; `googletrans` đã gỡ.
- Không hỗ trợ `yue` (cả deep_translator lẫn LibreTranslate) — cantonese giờ chỉ vi/en nên không cần.
- Fail-fast: `libretranslate.js` timeout 6s + circuit breaker (lỗi 1 lần → skip 30s). Worker crash → `docker compose ... restart libretranslate`.

**Frontend:**

- `api.translate` (KHÔNG còn `api.translateGoogle`); nút "Đồng bộ nghĩa Việt - Anh" (`VocabularyEditFields.jsx`) → `normalizeMeaningSync` (lowercase); gloss zh mandarin gọi `api.translate(..., "zh-CN")` qua cùng pipeline (LibreTranslate tự map zh-CN → zh-Hans).
- `VocabularyDetailContent.jsx` `fmtTranslateSource()` đọc `api.lastTranslateSource`/`api.lastGoogleCode` cho nhãn Full Sync.

**Vị trí code:**

- Backend: `backend/routes/translate.js` (`/translate`), `backend/scripts/translate_pair.py`, `backend/scripts/translate_utils.py`, `backend/lib/libretranslate.js`. Đã xóa: `translate_google.py`, `translate_cantonese.py`, `cantoToMandarin.js`, route `/translate-google`.
- Frontend: `frontend/src/lib/api.js` (`api.translate`), `frontend/src/components/VocabularyEditFields.jsx`.
- ⚠️ Đổi route → `docker compose ... restart backend` (tsx --watch không reload qua bind mount).

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
- ✅ **`text-purple` (màu TÍM — token riêng, 2026-08-14):** `--purple-color` (light `#7c3aed` / dark `#a78bfa`) → `--color-purple` trong `globals.css` (`@theme` + `:root` + `.dark`). Dùng làm màu nội dung phân biệt. ❌ KHÔNG dùng `text-han-pop-4` cho mục đích này (đó là thang phổ biến hán tự, không phải token tím chung). ⚠️ Riêng Phồn thể Mandarin trong hero dùng `text-han-mtrad` (`--han-mtrad-color` = purple-400 `#a78bfa`, 2026-08-20).
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
    - ✅ Áp dụng cho MỌI nơi hiển thị cặp: detail (`VocabularyDetailContent.jsx`), related words, bảng (`VocabularyRowColumns.jsx`), other pronunciations (`VocabularyDetailPage.jsx`), Han character breakdown...
    - ❌ KHÔNG viết grid/flex thủ công kiểu `1fr_auto_1fr` rải rác — phải dùng chung component để đồng bộ.
- ✅ **Thứ tự hiển thị Hán tự + phiên âm khi có cả giản/phồn:** **Giản thể + Pinyin LUÔN đứng trước** (trái), **Phồn thể + Jyutping đứng sau** (phải).
    - ✅ Ví dụ: `男篮 | 男籃` / `nán lán | naam4 laam4` (cột trái = giản thể + pinyin, cột phải = phồn thể + jyutping) — `VocabularyRowColumns.jsx`.
    - ✅ Áp dụng cho MỌI nơi hiển thị cặp giản/phồn kèm phiên âm: bảng (`VocabularyRowColumns.jsx`), detail (`VocabularyDetailContent.jsx`), flashcard...
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
- ✅ Áp dụng cho: search bảng từ vựng (`VocabularyBankBrowseTable`), dup-check trùng từ (`VocabularyDetailContent`), search Grammar (`useDebouncedValue(search, SEARCH_DEBOUNCE_MS)`).
- ✅ Khi debounce đang chạy (searchValue ≠ debouncedSearch) → hiện **loading skeleton trong table body** (`VocabularyBankBrowseTable` `searching` + `SkeletonTable`) — không phải trong ô tìm kiếm.
- ✅ Lý do: lọc dữ liệu lớn (~14k từ) mỗi lần gõ → lag; debounce 300ms cân bằng giữa phản hồi & hiệu năng.

### 8.4 Bảng Pinyin & Bảng Jyutping (pronunciation charts)

**Trang Pinyin** (`/m/pinyin`, `MandarinPinyinTablePage.jsx`):

- Data: `frontend/src/data/pinyinTable.js` (407 âm tiết, 22 hàng × 37 cột — `PINYIN_ROWS`, `PINYIN_FINALS`, `PINYIN_FINAL_NAMES`), `frontend/src/data/pinyinTones.js` (`addTone`, audio helpers, `PINYIN_TONES=[1..5]`).
- Có ô tìm kiếm: gõ lọc bảng theo âm tiết/phiên âm (ẩn các âm không khớp, hiện `noResults` khi rỗng).
- Có bộ nút lọc theo phụ âm đầu (xếp bảng chữ cái, `Ø` đứng trước).
- Click ô → `PinyinSyllableDialog.jsx`: 5 nút thanh điệu 1-5, click mới phát âm, **KHÔNG auto-play**.
- ❌ `ei` đứng riêng **không tồn tại** (dữ liệu nhaihsk sai) — đã xóa khỏi hàng `Ø`; chỉ giữ cột `ei` cho bei/pei/mei/fei...

**Trang Jyutping** (`/c/jyutping`, `CantoneseJyutpingTablePage.jsx`):

- Gồm 4 section, title hiện số đếm: **Thanh điệu (6)**, **Phụ âm đầu (19)**, **Vần (54)**, **Bảng âm tiết (620)**.
- Data: `frontend/src/data/jyutpingTable.js` — 19 phụ âm đầu (`JYUTPING_INITIALS`, grid 5×5 `JYUTPING_INITIAL_GRID`), vần (`JYUTPING_FINAL_COLS` = 9 + m/ng, 8 hàng coda `JYUTPING_FINALS`), 6 thanh điệu (`JYUTPING_TONES`), audio helpers `jyutpingInitialAudioUrl`/`jyutpingFinalAudioUrl`/`jyutpingToneAudioUrl` (mặc định local, có `*CdnUrl`).
- Bảng âm tiết: `frontend/src/data/jyutpingSyllableTable.js` — **file GENERATED** (`JYUTPING_SYL_ROWS`, `JYUTPING_SYL_TOTAL=620`, `JYUTPING_SYL_INITIAL_COUNT=19`, `JYUTPING_SYL_FINAL_COUNT=54`, `JYUTPING_SYL_TONE_COUNT=6`). ❌ **KHÔNG sửa tay** — chạy lại `frontend/scripts/build-jyutping-table.mjs`.
- Script build: `frontend/scripts/build-jyutping-table.mjs` đọc `frontend/scripts/db_jyutping.txt` (export cột `jyutping` từ bảng `cantonese_vocabulary_romanizations`), strip tone, chỉ giữ âm tiết có vần ∈ 54 vần chuẩn + m/ng. Lệnh export (chạy trong `E:\Code`):
  `docker compose -f docker-compose.dev.yml exec -T db psql -U cantonese -d cantonese -t -A -c "SELECT jyutping FROM cantonese_vocabulary_romanizations WHERE jyutping IS NOT NULL AND jyutping <> '';" | Out-File -FilePath frontend/scripts/db_jyutping.txt -Encoding utf8`
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
- Trước đó đã bỏ cơ chế tô per-char đỏ/xanh (`renderHanWithDiff`), thay bằng chấm vàng — file: `VocabularyDetailContent.jsx` (`renderHanWithDiffMark`), `VocabularyRowColumns.jsx` (`HanVariantCell`).

**Màu text:**

- **Sino (Hán-Việt) → trắng** `text-foreground` (cả toggle bar `VocabularyDetailPage` lẫn detail `VocabularyDetailContent`).
- **Nhãn cột** (`Mandarin`/`Cantonese`) → `text-viet` (**trắng** — chuẩn mới 2026-08-20). ⚠️ Meaning giờ **PHẲNG** — KHÔNG còn số La Mã / title nhóm theo dict (`粵典–words.hk`/`CC-Canto`) — đã bỏ 2026-08-30.

**YSK badge / pureCantonese:** flag `pureCantonese` (Boolean) CHỈ có trên `cantonese_vocabularies` — kho Cantonese chỉ chứa từ pure Cantonese; bảng từ vựng hiện badge **YSK** ở cột Cấp độ (`VocabularyRowColumns.jsx` `HskCell` + `HSK_VALUES` thêm "YSK"). Toggle edit "Tiếng Quảng thuần" đã bỏ.

**Nút link từ điển (toolbar detail):**

- Nút pill `h-9 px-3 rounded-full` với **icon brand**: Hanzii (gấu trúc), Google (G đa màu `GoogleIcon`), JyutDict (icon đỏ). Ảnh: `frontend/public/brand/` (hanzii-logo.webp, jyutdict-icon.svg); component `BrandIcons.jsx`.

**Chip phiên âm (toggle bar):**

- ⚠️ **Model mới (2026-08-17 — split):** store giữ shape legacy qua adapter `vocabLangToLegacy(raw, lang)` (`frontend/src/lib/dataTransforms.js`) — mỗi reading là `{ id, type:"pinyin"|"jyutping", pinyin|jyutping, sinoVietnamese, meanings[] }`; vocab có `hanziSimplified`/`hanziTraditional`/`hanHongKong`/`pureCantonese`. Khi lưu gửi payload per-language qua `vocabularyLangPayload(draft, lang)`.
- **Chip tách 2 hàng toggle riêng** (`VocabularyDetailPage.jsx`):
    - Hàng 1 = **sino-pinyin** (chip `NHẤT | yī`).
    - Hàng 2 = **sino-jyutping** (chip `NHẤT | jat1`).
- **Meaning follow reading được chọn:** detail hiện 2 section (Mandarin + Cantonese) qua `ReadingMeaningsBlock` (`VocabularyDetailContent.jsx`); edit có 2 `MeaningsEditor` (mỗi reading 1 cái) + `PronunciationEditor` 2 section.
- Chip **luôn hiện** kể cả khi **chỉ 1 phiên âm**, và hiện **cả ở edit mode** (toggle chip + `PronunciationEditor` cùng lúc).

### 8.6 Dialog Header/Footer — BẮT BUỘC (2026-09-02)

> Cách dựng header/footer dialog để icon & nội dung bên trong KHÔNG bị lệch (đã verify qua `OcrScanPanel`).

- ✅ **Chiều cao CỐ ĐỊNH theo số chẵn, header = footer** — dùng `h-16` (= 64px) cho CẢ HAI để cân đối. ❌ KHÔNG dùng `py-4`/`py-3` (header/footer lệch chiều cao → icon lệch).
- ✅ **Căn giữa dọc nội dung/icon:**
    - Header (DialogHeader base `flex flex-col`) → thêm `justify-center` (căn giữa dọc; title vẫn canh trái).
    - Footer (base `sm:flex-row`) → thêm `items-center`.
- ✅ **Viền semantic:** header `border-b border-border`, footer `border-t border-border`. ❌ KHÔNG dùng `border-t-2`/`border-b-2 border-slate-400`/`bg-card` (non-semantic).
- ✅ **`DialogContent` PHẢI có `grid-rows-[auto_minmax(0,1fr)_auto]`** — header/footer giữ chiều cao auto (không bị kéo giãn), vùng giữa scroll đúng.
- ✅ **Footer có nút absolute căn giữa:** PHẢI thêm `sm:justify-between` + `relative` — base `DialogFooter` có sẵn `sm:justify-end` (nó GHI ĐÈ `justify-between` → nút dồn phải, chồng lên nút absolute giữa). (2026-09-02 — từng bị lỗi chồng nút.)
- ✅ **Icon trong Button:** dùng `data-icon="inline-start"`/`"inline-end"` — không thêm `size-*`/margin lẻ cho icon trong component; `gap-2` giữa các nút.
- ✅ Ví dụ đúng (`OcrScanPanel`):

```jsx
<DialogContent className="max-w-360 gap-0 overflow-hidden p-0 h-[min(75vh,75dvh)] grid-rows-[auto_minmax(0,1fr)_auto]">
    <DialogHeader className="h-16 justify-center border-b border-border px-6">
        <DialogTitle className="text-lg">{title}</DialogTitle>
    </DialogHeader>
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">…</div>
    <DialogFooter className="relative flex h-16 shrink-0 items-center justify-between gap-2 border-t border-border px-6 sm:justify-between">
        …
    </DialogFooter>
</DialogContent>
```

### 8.7 Tag của từ vựng — quy ước (2026-09-27)

> Tag = danh mục DÙNG CHUNG toàn app, **chỉ admin** tạo/đổi tên/xoá/gắn (bảng `tags` + `vocabulary_tags`). UI: `VocabularyTagPicker.jsx` (dropdown ở header trang chi tiết) + `VocabularyTagChips.jsx` (chip cạnh "Độ phổ biến").

- ✅ Icon header dùng lucide `Tag`, **chỉ admin**, đứng sau nút bookmark; chip tag hiển thị **cùng hàng với chip "Độ phổ biến", ở sau nó**, chỉ ở cột của **ngôn ngữ đang học**.
- ✅ Mỗi dòng tag có **ĐÚNG 1 chấm**: chấm = nút mở bảng màu **và** hiện trạng thái (đặc = đã gắn, rỗng = chưa). ❌ KHÔNG thêm checkbox vuông (từng bị user báo "dư 1 dot").
- ✅ Bấm vào dòng = gắn/gỡ tag, **`closeOnClick={false}`** (menu không đóng → gắn nhiều tag liền, bấm ra ngoài/Esc mới tắt) và **KHÔNG toast** khi thành công (chỉ toast khi lỗi) — user cần gắn nhanh.
- ✅ Bảng màu: 10 sắc gốc × 5 tông **500→900** (`frontend/src/lib/tagColors.js`) — ❌ không màu nhạt 100–400, ❌ không màu đen/xám đậm. Chỉ hiện ở **admin**; render **inline trong dropdown** (KHÔNG dùng popover rời — Base UI Menu tự đóng khi click ra ngoài portal).
- ✅ Thứ tự tag = **số từ đã gắn giảm dần** (cùng số → theo tên). Chip thì sắp theo tên để không nhảy vị trí.
- ✅ Mọi mutation tag đều **optimistic** (xem thêm memory `/memories/repo/tags-2026-09-27.md`).

---

## 9. Ghi chú kỹ thuật đã xác minh (2026-08-02)

### 9.1 Sync Han Characters — ĐÃ XÓA (2026-08-31)

- Bảng `han_characters` + `*_vocabulary_characters` + trang `/han-characters` + routes `/data/sync-han-characters*` **đã xóa** — chỉ giữ `radicals` + cột `hanziCharacters` JSONB (xem §7.6). Không còn nút "Sync Han Characters" hay job manager.
- Rule còn dùng: **Sino-Vietnamese "A | B" = 1 reading** — `"TỊNH | TÍNH"` là **một** reading (đọc TỊNH _hoặc_ TÍNH), KHÔNG phải 2 reading. `splitSinoVietnameseParts` giữ nguyên nhóm `|`; `mergeSinoReadings` gộp (và xóa các alternative standalone cũ như `"TỊNH"`, `"TÍNH"` bị tách sai từ trước).
- Đã xóa file: `hanCharSyncJob.js`, `hanCharStrokeJob.js`, `hanCharStrokeSync.js`, `MissingHanCharsSync.jsx`, `hanCharExtract.js`.

### 9.2 Tính năng khác ảnh hưởng khi làm việc

- **Chế độ ngôn ngữ tách (08-17):** store `language` + 2 bank `mandarinVocabularies`/`cantoneseVocabularies` (`appStore.js`); `setLanguage`/`setActiveLanguage` đổi bank active (`vocabularies`). Navbar `StudyLanguageToggle.jsx`; `HomePage` chọn ngôn ngữ học.
- **Check-in calendar (08-24):** bảng `user_checkins` (unique `user_id + checkin_date`, KHÔNG FK tới users — bảng users không có PK chuẩn); `POST/GET /api/checkins`; auto check-in khi login/register/session-restore (`authStore.maybeCheckIn`).
- **AI Agent chat (08-09):** `backend/routes/agent.js` `POST /api/agent/chat` — Vercel AI SDK v7 + OpenRouter (`google/gemma-4-26b-a4b-it:free`); agent loop tự quản (model trả JSON `{"agent_tool":..., "agent_args":...}` — KHÔNG dùng native tool-calling). Tools: `backend/lib/agentTools.js` (`search_vocabularies`, `get_vocabulary`, `list_flashcard_decks`, ...); `propose_*` KHÔNG ghi DB (UI hiện card, user xác nhận). Frontend: `components/agent/AgentChatDrawer.jsx`.
- **OCR (08-09):** `POST /api/ocr-vocabulary` (bodyLimit 15MB) — engine **OCR.space (ưu tiên) → RapidOCR fallback** (`backend/scripts/ocr_rapid.py`, Python); tesseract.js ĐÃ XÓA. `OcrScanSection.jsx` (trong `OcrScanPanel`). Chỉ đọc DB; tạo từ do frontend `createVocabularyAwait` (user confirm). ⚠️ **2026-09-27: chỉ trả CỤM** — response `groups = [{ cluster }]` (mỗi vùng/cụm OCR gom được = 1 cluster, **kể cả cụm 1 chữ**), **bỏ `members`**; KHÔNG lọc theo số lượng hán tự. ⚠️ **Nghĩa vi/en của scan** đi qua pipeline RIÊNG `backend/lib/hanziTranslate.js` (Google deep_translator → **LibreTranslate fallback**, nguồn `zh-Hans` vì self-hosted không có `zh-Hant`), gọi bởi `meaningPipeline.enrichMeaningsFromHanzi` (dịch HẾT cụm còn thiếu — mặc định KHÔNG giới hạn số lượng, concurrency 4 qua env `SCAN_TRANSLATE_CONCURRENCY`; có nhánh 2-hop `en→vi` khi dịch thẳng zh→vi thất bại). ⚠️ Google free endpoint bị **throttle theo IP** (429 + trang "Sorry...") → `hanziTranslate` có **circuit breaker**: gặp 429 tạm bỏ qua Google `HANZI_GOOGLE_DOWN_MS` (default 120s), không retry, đi thẳng LibreTranslate. ⚠️ **2026-09-27 — Hán-Việt của scan LẤY TỪ BANK trước map tĩnh:** từ **đã có trong bank** → dùng thẳng `romanizations[0].sino_vietnamese` (DB); từ **mới** → suy từng chữ theo thứ tự **từ điển per-char dựng từ các từ 1 CHỮ trong CHÍNH BANK (cùng ngôn ngữ → kho kia) → map tĩnh `backend/data/sino-vietnamese.json` → `-`** (`buildVocabIndex` trả `sinoByCharByLang`; `deriveSinoVietnamese(text, sinoMap, bankSino, otherBankSino)`). Trước đây chỉ dùng map tĩnh nên lệch app (vd `呢啲` "NI -" thay vì "NI ĐÍCH", `數字` "SỔ TỰ" thay vì "SỐ TỰ"); sau fix lệch còn ~6.8% (cantonese) / ~9.2% (mandarin) — phần còn lại do **chữ đa reading** (scan chỉ hiện reading đầu).

---

## 10. Cloud Backup — Database local → Supabase & Prisma cloud (BẮT BUỘC hỏi trước)

> Database local là nguồn duy nhất. 2 đám mây backup đều mirror local (ghi đè/upsert). **Mọi thao tác ghi lên cloud đều phải hỏi user trước.**

### 10.1 Connection strings (không commit)

| Đám mây      | File                                 | Nội dung                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------ | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase     | `backend/.env.supabase` (gitignored) | **Project SINGAPORE `fvelhqjrpyyrqjkaxyku`**: `SUPABASE_URL=https://fvelhqjrpyyrqjkaxyku.supabase.co`, `SUPABASE_POOLER_URL=postgresql://postgres.<ref>:<pw>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?uselibpqcompat=true&sslmode=require`. ⚠️ Key `secret` (`sb_secret_…`) do Management API trả về **bị CHE (mask `·`)** → dùng **legacy `service_role`** (JWT) cho supabase-js (hoặc copy key mới từ Dashboard). |
| Prisma cloud | `backend/.env.cloud` (gitignored)    | `DATABASE_URL='postgres://<user>:<key>@db.prisma.io:5432/postgres?sslmode=require'`                                                                                                                                                                                                                                                                                                                                               |

- ⚠️ **Supabase DB: dùng SESSION POOLER (IPv4), KHÔNG dùng direct** — `db.<ref>.supabase.co` chỉ có AAAA (IPv6) ⇒ máy local + container Docker không kết nối được (2026-09-19 verified). Pooler `aws-1-ap-south-1.pooler.supabase.com:5432` có IPv4.
- ⚠️ **BẮT BUỘC `?uselibpqcompat=true&sslmode=require`** trên chuỗi Supabase: pg-connection-string v2 coi `sslmode=require` = verify-full ⇒ `Error opening a TLS connection: self-signed certificate in certificate chain`. `uselibpqcompat=true` trả về hành vi libpq (không verify CA).
- ✅ Đã verify Prisma (`@prisma/adapter-pg`) đọc Supabase qua pooler OK (2026-09-19).

### 10.2 Script backup

| Script                                    | Đích         | Cơ chế                                                                                                                                   | Chạy                                                                  |
| ----------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `backend/scripts/backup-supabase.mjs`     | Supabase     | Prisma đọc local → upsert theo `id` (idempotent) BATCH=400; **`--reset`** = xóa 21 bảng cloud trước (mirror chính xác, dọn cả dòng thừa) | `node /app/backup-supabase.mjs --dry` / `--apply` / `--apply --reset` |
| `backend/scripts/verify-supabase.mjs`     | Supabase     | Đếm 21 bảng local↔Supabase (REST); **`--check`** = so CỘT từng bảng (phát hiện cột/bảng thiếu TRƯỚC khi ghi)                             | `node /app/verify-supabase.mjs` / `... --check`                       |
| `backend/scripts/backup-prisma-cloud.mjs` | Prisma cloud | BEGIN → ALTER frequency → DELETE hết (reverse FK) → INSERT 500/batch `ON CONFLICT ("id") DO NOTHING` → COMMIT                            | `node /app/backup-prisma-cloud.mjs --dry` / `--apply`                 |
| `backend/scripts/verify-prisma-cloud.mjs` | Prisma cloud | Đếm từng bảng để đối chiếu local/cloud                                                                                                   | `node /app/verify-prisma-cloud.mjs`                                   |

- Chạy trong container: `docker compose -f docker-compose.dev.yml exec -T backend node /app/<script> --apply`
- Cả 2 script đều có `--dry` để preview trước khi ghi.
- ⚠️ **2026-09-01 — ĐÃ CẬP NHẬT + ĐÃ CHẠY:** các script cloud (`backup-supabase`, `backup-prisma-cloud`, `sync/check-cloud-schema`, `verify-prisma-cloud`) đã sửa sang schema split hiện tại (bỏ `han_characters`/`*_vocabulary_characters`/`category`/`user_vocabularies`/`sentence_patterns`, thêm `user_checkins`); `supabase-schema.sql` viết lại theo 19 bảng split. Backup 09-01 đã chạy thành công (3 phía khớp). `sync-cloud-schema.mjs` còn tự dọn 11 bảng stale trên cloud.

    > ⚠️ 2026-09-20: bảng `user_important_vocabularies` ĐÃ **RENAME** → `user_favorite_vocabularies` + thêm bảng mới `user_disliked_vocabularies` (xem `/memories/repo/favorite-disliked-2026-09-20.md`). API `/api/favorite-vocabularies`, `/api/disliked-vocabularies`; bootstrap trả `favoriteVocabularyIds`/`dislikedVocabularyIds`; ETag `/api/bootstrap` = nội dung + digest data user (`computeBootstrapSignature`).

- ⚠️ **2026-09-27 — MIRROR 23 BẢNG:** thêm `tags` + `vocabulary_tags` (tag admin quản lý) ⇒ đã bổ sung vào `supabase-schema.sql` + 6 script cloud.

- ⚠️ **2026-09-19 — SUPABASE MIRROR 21 BẢNG (ĐÃ CHẠY, 21/21 khớp):** local thêm 3 mục sau 09-01 (`popularity_level` 2 bank + 2 bảng `user_important_vocabularies`/`user_vocabulary_mastery`) ⇒ script + `supabase-schema.sql` + file gia tăng `backend/supabase-update-2026-09-19.sql` đã bổ sung. **Thứ tự TABLES phải theo FK** (bảng cha `flashcard_decks`/`vocabulary_sets` TRƯỚC bảng join).

### 10.3 Lưu ý kỹ thuật (đã xác minh 2026-08-07)

- **Prisma cloud reset-toàn-bộ:** script xóa hết cloud rồi copy lại — nếu lỗi giữa chừng sẽ `ROLLBACK` an toàn, không để cloud ở trạng thái nửa chừng.
- **JSONB/JSON columns** (hanziCharacters breakdown, relatedWords, notes...): node-pg parse thành JS object → phải `JSON.stringify` lại trước khi insert.
- **Thứ tự FK (Prisma cloud, split 2026-08-18, sau drop han chars 08-31):** users → radicals → mandarin*vocabularies → mandarin_vocabulary_romanizations → mandarin_vocabulary_meanings → mandarin_vocabulary_examples → flashcard_deck_mandarin_vocabularies → vocabulary_set_mandarin_vocabularies → (tương tự cantonese*_) → grammars → grammar_examples → flashcard_decks → vocabulary_sets → user_checkins. DELETE theo thứ tự ngược. _(`sentence_patterns`/`user_vocabularies`/`han_characters`/`*_vocabulary_characters` đã drop.)\*
- **Supabase upsert:** bảng chưa tồn tại → tạo bằng `backend/supabase-schema.sql` hoặc `supabase/migrations/20260807000000_create_tables.sql`. Sau khi tạo/xóa bảng cần `NOTIFY pgrst, 'reload schema'`; sau khi reset schema cần `GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role` + `ALTER DEFAULT PRIVILEGES`.
- **Verify Supabase:** `docker compose -f docker-compose.dev.yml exec -T backend node /app/scripts/verify-supabase.mjs` (dùng REST + service key, không cần DB password). `--check` so CỘT trước khi ghi.
- ✅ **CLI Supabase ĐÃ LOGIN (2026-09-19):** chạy SQL trực tiếp lên cloud bằng `npx supabase db query --linked "<sql>"` (Management API, **không cần DB password**) — đã verify. Vẫn nên tạo file SQL gia tăng (`backend/supabase-update-*.sql`) để lưu vết/replay.
- ⚠️ **PostgREST KHÔNG cho DDL** — DDL phải qua CLI (`db query --linked`) hoặc Dashboard SQL Editor.
- ✅ **Advisor:** `npx supabase db advisors --linked --type all --level warn` — check trước khi deploy (09-19: không còn cảnh báo hiệu năng; chỉ còn leaked-password của Supabase Auth, project không dùng Auth).
- ⚠️ **Tạo project Supabase mới:** `npx supabase projects create <name> --org-id <org> --region ap-southeast-1 --db-password <pw>` — ⚠️ **npx IN RA toàn bộ tham số (lộ password)** ⇒ chạy binary trực tiếp `…\npm-cache\_npx\<hash>\node_modules\.bin\supabase.cmd` và truyền password qua **biến PowerShell** (`$pw`) để không lộ trong log. Sau khi tạo: `supabase link --project-ref <ref> --password $pw` → `supabase db query --linked -f backend/supabase-schema.sql` (đã sửa thứ tự: ALTER `popularity_level` phải nằm SAU khi 2 bảng vocab được tạo).
- ⚠️ **Đừng pipe output CLI qua console PowerShell** (`… | Set-Content`): sẽ hỏng encoding (U+252C trong API key → supabase-js lỗi `Cannot convert argument to a ByteString`). Dùng script node đọc/ghi file (không in secret).
- ⚡ **Hiệu năng (2026-09-19, sau khi tối ưu):** `@fastify/compress` bật gzip cho mọi response >1KB → `/api/bootstrap` **43,6MB → 16,4MB**; cache in-memory snapshot trong `prismaServiceSplit.js` (key = `computeDataSignature()`, TTL 5 phút, `invalidateSnapshotCache()` sau mọi mutation) → request thứ 2 trở đi **4,5s → 1,1s**; ETag/304 → **2ms, 0 byte**. Load app trong browser: **~2,8s** (trước ~9-10s với Mumbai không nén).
- **Xóa dữ liệu cloud (reset mirror):** Supabase có `statement_timeout` → xóa bảng CHA ngay sau khi bảng con vừa bị xóa sạch trong cùng phiên sẽ **timeout** (FK check seq-scan bảng con đầy dead tuple). Fix gốc = **tạo index trên cột FK trên cloud** (16 index đã thêm 09-19: `idx_m*`/`idx_c*`/`idx_fd*v`/`idx_vs*v` + `user_checkins_user_id_idx`); sau đó xóa 27.896 dòng chỉ ~0,4s.

### 10.4 Baseline đã verify (2026-09-19 — project SINGAPORE, mirror 21/21 bảng khớp)

| Bảng                                  | Local = Supabase                                                      |
| ------------------------------------- | --------------------------------------------------------------------- |
| users                                 | 3                                                                     |
| radicals                              | 214                                                                   |
| mandarin_vocabularies                 | 14,027                                                                |
| mandarin_vocabulary_romanizations     | 14,729                                                                |
| mandarin_vocabulary_meanings          | 24,640                                                                |
| mandarin_vocabulary_examples          | 55,491                                                                |
| cantonese_vocabularies                | 9,459                                                                 |
| cantonese_vocabulary_romanizations    | 9,682                                                                 |
| cantonese_vocabulary_meanings         | 27,028                                                                |
| cantonese_vocabulary_examples         | 53,666                                                                |
| flashcard_decks                       | 6                                                                     |
| vocabulary_sets                       | 8                                                                     |
| vocabulary_set_cantonese_vocabularies | 3                                                                     |
| user_checkins                         | 17                                                                    |
| user_favorite_vocabularies            | 4 (rename từ `user_important_vocabularies` 09-20)                     |
| user_vocabulary_mastery               | 3                                                                     |
| tags                                  | 0 (mới 09-27 — admin tạo tag qua UI; có cột `color` admin chọn 09-27) |
| vocabulary_tags                       | 0                                                                     |
| còn lại (deck/set links, grammars)    | 0                                                                     |

> Baseline 09-01 cũ (cantonese_examples 70,791…) đã **hết hiệu lực** — local đã dedupe/merge nghĩa & ví dụ sau đó.

→ Quy trình Supabase: `verify-supabase.mjs --check` (schema) → `backup-supabase.mjs --apply --reset` (mirror) → `verify-supabase.mjs` (đếm 21 bảng khớp).
→ Quy trình Prisma cloud: `sync-cloud-schema.mjs` → `backup-prisma-cloud.mjs --apply` → `verify-prisma-cloud.mjs`.

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

## 12. Dọn dẹp file/script tạm — BẮT BUỘC (2026-09-27)

> ⚠️ `backend/` đang có **rất nhiều file rác** (`_*.mjs`, `_*.py`, `_*.sql`, `add-cols*.cjs`, `*_audit*.txt`…). Từ nay: **tạo script để test/debug thì PHẢI xoá sau khi xong**, trừ khi script đó là **công cụ tái sử dụng thật sự**.

**Quy tắc:**

- ✅ Script test/debug dùng 1 lần (so sánh dữ liệu, probe API/DB, kiểm tra nhanh) → đặt tên tạm có tiền tố `_` (vd `backend/_check-*.mjs`, `_test-*.mjs`) rồi **XOÁ NGAY trong cùng phiên** khi đã verify (`Remove-Item -Force <file>` + xác nhận `Test-Path` = False).
- ✅ Script **giữ lại** chỉ khi: là công cụ sync/backup/migration chính thức (đã liệt kê ở §3.1, §10.2), hoặc user yêu cầu giữ.
- ✅ File rác khác cũng phải dọn: ảnh test trong `%TEMP%`, dump/`.bak` tạo tạm, file log tạm, `_tmp_*`.
- ❌ KHÔNG để lại: script test trong `backend/`, `frontend/scripts/` (trừ script build có chủ đích như `build-jyutping-table.mjs`), file `*.bak`, `*.dump` mới (dumps cũ đã gitignore).
- ❌ KHÔNG xoá file của user/công cụ chính thức khi chưa hỏi — chỉ xoá file **do agent tạo trong phiên**.
- ✅ Trước khi kết thúc công việc: tự hỏi _"còn file tạm nào mình vừa tạo không?"_ → liệt kê + xoá.
- ⚠️ Khi chạy script tạm trong container: tạo file ở `backend/` vẫn **thấy ngay trong container** (bind mount) → sau khi xoá ở host là hết.

### 12.1 Đã dọn 1 lần — 2026-09-27 (backend/)

- ✅ Đã XOÁ: toàn bộ `_*.mjs`/`_*.py`/`_*.txt`/`_*.sql` (script test tạm), `*.log` (`full-sync-*`, `typeduck-*`), `temp-test.json`, `backend/.pnpm-store`, và **script cũ đã lỗi thời**: `add-cols*`, `analyze-*` (9), `backfill-*` (11), `migrate-new-*`, `migrate-hanzi-schema`, `migrate-tts-prefix`, `rebuild-han-character-readings`, `sync-han-chars.cjs`, `update-mandarin-traditional-s2t`, `clean-romanization-punct`, `convert-wordshk.py`, `count-empty.cjs`, `list-tables.cjs`, `fix-pinyin.cjs`, `fix-mandarin-umlaut-pinyin`, `strip-tocfl.cjs` ⇒ còn **~38 file**.
- ✅ **GIỮ LẠI (đừng xoá):** `_local-snapshot-2026-09-19.dump` (restore DB), script sync/import chính thức (§3.1), script cloud (§10.2/§10.3), `normalize-vocab-case.mjs`, `detect-`/`filter-pure-cantonese-split.mjs`, `dedupe-examples.mjs`, `restore-*`/`upload-*`/`delete-cc101-r2.mjs`, `set-password.mjs`, `run-translate-all.sh`, `*.sql` schema.
- ⚠️ Từ nay `backend/` phải giữ trạng thái gọn này — script test mới tạo thì xoá trong CÙNG phiên.

### 12.2 Đợt 2 — gom script vào `scripts/` (2026-09-27)

- ✅ **Chuyển 18 script CLI từ `backend/` root → `backend/scripts/`** (giữ git history): backup/verify cloud, sync-cloud-schema, check-cloud-schema, full-sync-\*, import-\*, detect-/filter-pure-cantonese, upload/restore CC101 audio, create-admin, set-password.
- ✅ Sửa đường dẫn tương đối trong các script đã chuyển: import `./lib` → `../lib`, `./generated` → `../generated`; đọc tài nguyên `data/` → `../data`; env `.env.cloud`/`.env.r2` → `../`; env root `.env.dev`/`.env.supabase` → `../../`.
- ✅ **XOÁ thêm** (không dùng nữa / đã chết): `run-translate-all.sh`, `dedupe-examples.mjs`, `delete-cc101-r2.mjs`, `restore-from-cloud.mjs`, và 3 script tham chiếu model ĐÃ DROP: `sync-jyutping.mjs` (`prisma.vocabulary`), `normalize-vocab-case.mjs` (`vocabulary`/`hanCharacter`), `migrate-split-lang.mjs` (1 lần, nguồn bảng cũ).
- ✅ Dọn `backend/scripts/`: xoá `cloud-check2.mjs`, `cloud-inspect.mjs`, `fill_*.py` (3), `translate_*.log` (2), `verify-prisma.ts`.
- 📌 **backend/ root giờ còn 16 file** (code + config + schema + snapshot); `backend/scripts/` còn 21 file (script chính thức + python helper chạy runtime). Đừng để file mới ở root.
