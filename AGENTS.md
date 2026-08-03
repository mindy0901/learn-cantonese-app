# Agent Guidelines — Learn Cantonese App

> Dành cho các AI agent khi làm việc với project này. Đọc kỹ trước khi thực hiện bất kỳ thay đổi nào.
>
> ⚠️ **QUAN TRỌNG:** Database PostgreSQL là nguồn dữ liệu duy nhất. Tuyệt đối không xóa, ghi đè, hay chạy seed/migration mà không có sự đồng ý rõ ràng của user. Phải hỏi user và chờ xác nhận trước khi thực hiện bất kỳ thao tác nào liên quan đến database.

### ✂️ Rule tiết kiệm chi phí — TRẢ LỜI NGẮN GỌN

- ❌ **Không trả lời quá dài.** Chỉ trả lời đúng trọng tâm câu hỏi/công việc.
- ✅ Trả lời ngắn gọn, súc tích, đi thẳng vào vấn đề.
- ✅ Khi xác nhận hoàn thành: chỉ báo ngắn gọn đã làm gì (1-3 dòng), không giải thích dài dòng.
- ✅ Khi hỏi thông tin: hỏi đúng câu cần thiết, không lan man.

---

## 0. Agent Login (để tự động đăng nhập khi test)

| Field    | Value   |
| -------- | ------- |
| Username | `admin` |
| Password | `admin` |

**Cách đăng nhập tự động:**

1. Mở trang `http://localhost:5173`
2. Click nút 🔑 (bên cạnh "Sign in")
3. Nhập `admin` / `admin` → click "Sign in"
4. Hoặc gọi API trực tiếp: `POST /auth/login` với body `{ "email": "admin", "password": "admin" }`

---

## 1. Quy ước đặt tên

| Domain                        | Dùng                             | Không dùng       |
| ----------------------------- | -------------------------------- | ---------------- |
| Từ vựng (variable, prop, key) | `vocabulary` / `vocabularies`    | `word` / `words` |
| Ngữ pháp                      | `grammar` / `grammars`           |                  |
| Mẫu câu                       | `sentence` / `sentences`         |                  |
| Bài học                       | `lesson` / `lessons`             |                  |
| Hán tự                        | `hanCharacter` / `hanCharacters` |                  |
| Flashcard                     | `flashcard` / `flashcards`       |                  |

- ❌ **Không** dùng `word` / `words` cho bất kỳ variable, prop, key, hoặc object field nào liên quan đến từ vựng.
- ✅ Luôn dùng `vocabulary` (số ít) hoặc `vocabularies` (số nhiều).
- Áp dụng cho: tên biến, tên hàm, object keys, API endpoints, props, state.

### 0.1 Quy tắc fallback dữ liệu

- ❌ **Không bao giờ** fallback sai ngữ cảnh. Ví dụ:
    - `vietMeanings || sinoVietnamese` → **SAI**: Hán-Việt không phải nghĩa tiếng Việt.
    - `engMeanings || sinoVietnamese` → **SAI**: Hán-Việt không phải nghĩa tiếng Anh.
- ✅ Khi cần hiển thị nghĩa: chỉ dùng đúng field (`vietMeanings`, `engMeanings`).
- ✅ Khi cần hiển thị Hán-Việt: dùng `sinoVietnamese`.
- ✅ Nếu field không có dữ liệu: hiển thị "đang cập nhật" hoặc "không có dữ liệu", **không** fallback sang field khác loại.

---

## 1. Nguồn dữ liệu duy nhất — Database

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

- **PostgreSQL** trong Docker (`docker-compose.dev.yml`)
- User/pass/db: `cantonese` / `cantonese` / `cantonese`
- Tổng: ~**17,395** từ (HSK 1-6: 913/1027/1701/2457/2782/3091 + HSK 7-9 + custom của user)
- ⚠️ **`backend/vocabularies.json` ĐÃ BỊ XÓA (2026-08-03)** — không còn tồn tại. DB là source of truth DUY NHẤT, không có file backup nào khác.

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

### 1.4 ID cố định (stable UUID)

Mỗi DB row có UUID được sinh từ hash MD5:

```
stableUUID = MD5( hanTraditional | hanSimplified | normPinyin | normJyutping )
```

Trong đó `normPinyin` và `normJyutping` đã được chuẩn hóa (bỏ khoảng trắng, lowercase).

→ Cùng một từ + phiên âm luôn có cùng ID, bất kể seed bao nhiêu lần.

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
    - 🔴 **Đỏ = traditional** (`text-red-600 dark:text-red-400`)
    - 🔵 **Xanh = simplified** (`text-blue-600 dark:text-blue-400`)
    - ⚠️ **Quy tắc quan trọng:** Ký tự **giống hệt** ở cả 2 form (vd 安, 眠 trong 安眠藥/安眠药) vẫn là **traditional → ĐỎ**, kể cả khi nằm trong cột Simplified. Chỉ ký tự **thật sự khác** (vd 药 = giản thể của 藥) mới **XANH**.
    - ✅ Cột **Traditional**: toàn bộ ký tự đỏ (render bằng `renderHanText`).
    - ✅ Cột **Simplified**: dùng `renderHanWithDiff` — ký tự `same` (giống trad) → đỏ, ký tự `diff` (giản thật) → xanh. Đây là logic giống `WordRow` (bảng vocabularies).
    - Áp dụng toàn app: `WordDetailContent.jsx`, `WordRow.jsx`, `HanCharacterRow.jsx`, `HanCharacterCard.jsx`, `HanCharacterDetailPage.jsx`, `WordEditFields.jsx`, `AddHanCharacterModal.jsx`, `HanVariantsInline.jsx`, `FlashcardDeckManager.jsx`, `FlashcardSessionSummary.jsx`, `HanziiHanCellLink.jsx` (primary = traditional → đỏ, secondary = simplified → xanh)
    - ❌ Không dùng `text-han` (màu trung tính) cho hiển thị hán tự khi phân biệt được trad/simp — trừ danh sách skipped/không phân biệt
    - ❌ Không dùng màu amber (`text-amber-600`) để tô ký tự diff — nó ghi đè màu convention; dùng chính đỏ/xanh để thể hiện
- ✅ **Single-form (chỉ 1 phiên bản):** `hanSimplified = NULL/trống` — **KHÔNG** lưu giá trị giống `hanTraditional`
- ❌ Mọi nguồn sync (backend `hanCharacterBreakdown.js`) **không được** ghi lại `hanSimplified` trùng `hanTraditional`

---

## 2. Schema Prisma — QUAN TRỌNG

### 2.1 KHÔNG có unique constraint trên Vocabulary

```prisma
model Vocabulary {
    id             String   @id @default(uuid()) @db.Uuid
    hanTraditional String   @map("han_traditional") @db.VarChar
    hanSimplified  String?  @map("han_simplified") @db.VarChar
    pinyin         String?  @db.VarChar
    jyutping       String?  @db.VarChar
    sinoVietnamese String?  @map("sino_vietnamese") @db.VarChar
    vietMeanings   String?  @map("viet_meanings") @db.VarChar
    engMeanings    String?  @map("eng_meanings") @db.VarChar
    hskLevel       String?  @map("hsk_level") @db.VarChar
    // ... relations
    @@index([searchKey, hskLevel])
    @@map("vocabularies")
    // ⚠️ KHÔNG có @@unique([hanSimplified, hanTraditional])
}
```

**Lý do:** Cùng một chữ Hán có thể có nhiều phiên âm khác nhau → nhiều dòng DB.

### 2.2 `createVocabulary` và `replacePartialData` dùng `create`, KHÔNG dùng `upsert`

- `backend/lib/prismaService.js`: Đã sửa `upsert` → `create` để không ghi đè từ đã tồn tại.

---

## 3. Seed script — KHÔNG CÒN DÙNG (legacy)

> ⚠️ **`backend/prisma/seed.ts` KHÔNG còn chạy được** — nguồn `vocabularies.json` đã bị xóa (2026-08-03).
> Database là nguồn dữ liệu duy nhất, dữ liệu được thêm qua UI hoặc script sync thủ công (xem dưới).
> Không được tự ý khôi phục file `vocabularies.json` hoặc viết lại seed mà không hỏi user.

### 3.1 Script sync dữ liệu hiện có (đều phải hỏi user trước khi chạy)

| Script                       | Chức năng                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| `sync-xuehanzi-metadata.mjs` | Sync lexicon metadata (mwr/bwr/boost/searchPinyin/relatedWords) từ `data/xue-hanzi-dictionary.json` |
| `sync-meanings-eng.mjs`      | Điền `engMeanings` vào `vocabulary_meanings` theo index (CVDICT ↔ CC-CEDICT)                        |
| `import-xuehanzi-common.mjs` | Import từ mới HSK 1-6 phổ biến từ `data/xue-hanzi-dictionary.json`                                  |
| `sync-jyutping.mjs`          | Điền jyutping từ CC-Canto + pycantonese fallback                                                    |

- ✅ Tất cả script đều hỗ trợ `--dry` để preview trước khi ghi.
- ✅ Nguồn dữ liệu nằm trong `backend/data/`: `xue-hanzi-dictionary.json`, `cccanto-webdist.txt`, `cvdict.json`...

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

---

## 5. Backup database

- ❌ `backend/vocabularies.json` **đã bị xóa** — không còn file backup nào.
- ✅ Database là nguồn duy nhất; để export, dùng `backend/export-db.mjs` (cần hỏi user trước khi ghi file).

---

## 6. Các trường dữ liệu — ai sở hữu?

| Field                                    | Nguồn                     | Bị script sync ghi đè? |
| ---------------------------------------- | ------------------------- | :--------------------: |
| `hanTraditional`, `hanSimplified`        | Import (OpenCC chuẩn hóa) |           ❌           |
| `pinyin`, `jyutping`                     | Import / sync             |           ❌           |
| `sinoVietnamese`                         | Import                    |           ❌           |
| `hskLevel`                               | Import (HSK 1-6) / cũ     |           ❌           |
| `vietMeanings`, `engMeanings`            | User (UI)                 |           ❌           |
| `vietExamples`                           | User (UI)                 |           ❌           |
| `important`, `mastered`, `studyProgress` | User (UI)                 |           ❌           |
| `vocabularyMeanings` (nested)            | User (UI) + sync          |           ❌           |
| `vocabularyExamples` (nested)            | User (UI)                 |           ❌           |

→ **Không field nào bị script sync ghi đè** — tất cả script đều chỉ điền dòng trống/thiếu hoặc tạo mới, không ghi đè user data.

---

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

### 7.6. `hanCharacters` breakdown (JSON column) — BẮT BUỘC

Mỗi vocabulary có cột `hanCharacters` (JSONB) lưu breakdown từng hán tự theo vị trí:

```json
[
    { "character": "挨", "pinyin": "āi", "jyutping": "aai1" },
    { "character": "家", "pinyin": "jiā", "jyutping": "gaa1" },
    { "character": "挨", "pinyin": "āi", "jyutping": "aai1" },
    { "character": "戶", "pinyin": "hù", "jyutping": "wu6" }
]
```

**Quy tắc bắt buộc:**

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

## 8. UI/UX Design System

### 8.1 Nguồn tham chiếu

Khi tạo UI mới hoặc sửa UI hiện có, **đọc `design-system/learn-cantonese/MASTER.md`** (skill `ui-ux-pro-max` quản lý file này động qua `--persist`).

> Nếu có page-specific override, đọc `design-system/learn-cantonese/pages/[page-name].md` — file này ghi đè MASTER.md.

### 8.2 Skill `ui-ux-pro-max` (ƯU TIÊN HÀNG ĐẦU)

> ⚠️ **Trước khi tạo hoặc sửa bất kỳ UI nào**, phải dùng skill `ui-ux-pro-max` để tra cứu guidelines. Đây là nguồn tham chiếu UI/UX chính thức, thay thế mọi rule CSS cứng trước đây.
> Skill đã cài tại `.github/prompts/ui-ux-pro-max/` (GitHub Copilot). Trên Windows dùng `python` (không phải `python3`).

Khi cần tìm kiếm UX guidelines, color palettes, hoặc style references:

```bash
# Tìm UX guidelines
python .github/prompts/ui-ux-pro-max/scripts/search.py "<query>" --domain ux -n 5

# Tìm color palette
python .github/prompts/ui-ux-pro-max/scripts/search.py "<query>" --domain color -n 3

# Tìm style
python .github/prompts/ui-ux-pro-max/scripts/search.py "<query>" --domain style -n 5

# Tạo/cập nhật design system
python .github/prompts/ui-ux-pro-max/scripts/search.py "<query>" --design-system --persist -p "Learn Cantonese"
```

### 8.3 Component tái sử dụng

Khi tạo UI, ưu tiên dùng các component có sẵn:

| Component                                           | File                                  | Dùng khi                 |
| --------------------------------------------------- | ------------------------------------- | ------------------------ |
| `EmptyState`                                        | `ui/EmptyState.jsx`                   | Trang không có dữ liệu   |
| `SkeletonTable` / `SkeletonStats` / `SkeletonBlock` | `ui/Skeleton.jsx`                     | Loading states           |
| `NavIcons` (IconWordBank, IconGrammar, ...)         | `NavIcons.jsx`                        | SVG icons cho navigation |
| `Button` / `btnClass()`                             | `ui/Button.jsx`, `ui/buttonStyles.js` | Nút bấm                  |

### 8.4 Quy tắc bắt buộc

- ❌ **Không dùng emoji làm icon** — dùng SVG từ `NavIcons.jsx` hoặc Lucide/Heroicons
- ✅ **`cursor-pointer`** trên mọi phần tử clickable
- ✅ **Transition 150-300ms** cho hover/active states
- ✅ **Focus states visible** (`focus-visible:outline-accent`)
- ✅ **`prefers-reduced-motion`** respected
- ✅ **`active:enabled:scale-[0.97]`** cho tất cả buttons

### 8.5 Quy tắc Spacing — BẮT BUỘC

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

---

## 9. Ghi chú kỹ thuật đã xác minh (2026-08-02)

### 9.1 Hán tự single-form → `hanSimplified = NULL` (BẮT BUỘC)

- Chỉ 1 phiên bản (giản = phồn, vd 慧, 人, 大, 山, 你, 仇, 熏) → `hanSimplified = NULL`, **không** lưu bằng `hanTraditional`.
- Edit UI (`HanCharacterRow.jsx`, `AddHanCharacterModal.jsx`): khi `hanSimplified === hanTraditional` → field Simplified **để trống**; lưu `hanSimplified: x || undefined`.
- Backend `prismaService.js`: `hanCharacterToRow` giữ `undefined` (1không ép `""`); `createHanChar` → `rest.hanSimplified || null`; `updateHanChar` → `rest.hanSimplified || null` (rỗng = clear về NULL).
- Nếu bị ghi lại, dọn: `UPDATE han_characters SET han_simplified = NULL WHERE han_simplified = han_traditional;` (nhớ hỏi user).

### 9.2 Sync Han Characters (nút duy nhất trên HanCharactersPage)

- **Luồng**: Click "Sync Han Characters" → chọn **mode** → gọi `/api/data/sync-han-characters/preview` (tính trước, KHÔNG ghi DB) → hiện modal liệt kê hán tự mới + hán tự cần update → "Confirm Sync" → tạo job (`POST /data/sync-han-characters` trả `jobId`) → frontend poll `/data/sync-han-characters/progress/:jobId` mỗi 1.5s → hiện tiến trình % + chi tiết (processed/total, created, updated, linked, merged).
- **2 mode sync** (body API gửi `{mode}`):
    - **`fast`** (mặc định): chỉ xử lý vocab có `hanCharacters = DbNull` (skip từ đã sync), **không xóa gì**.
    - **`full`**: xóa hết `vocabulary_characters` + `han_characters` rồi sync lại toàn bộ. Preview báo **New = Total, Update = 0, Same = 0** (vì store bị xóa trước).
- **Backend**: `backend/lib/hanCharacterBreakdown.js` (`computeHanCharacters` căn chỉnh cả pinyin/jyutping/**sinoVietnamese** theo vị trí; `resolveHanCharacter` dedupe hán tự trùng — merge readings vào keeper, re-link, xóa dupes; `syncVocabularyHanCharacters`; `backfillVocabularyHanCharacters(where, onProgress, mode)`; `previewVocabularyHanCharacters(mode)`). Job manager: `backend/lib/hanCharSyncJob.js` (`runSyncJob(jobId, mode)`, job có `job.mode`, `job.reset`).
- **Sino-Vietnamese "A | B" = 1 reading**: `"TỊNH | TÍNH"` là **một** reading (đọc TỊNH _hoặc_ TÍNH), KHÔNG phải 2 reading. `splitSinoVietnameseParts` giữ nguyên nhóm `|`; `mergeSinoReadings` gộp (và xóa các alternative standalone cũ như `"TỊNH"`, `"TÍNH"` bị tách sai từ trước).
- **Preview modal**: mode selector đặt NGOÀI nhánh loading (luôn hiển thị), nút mode `disabled` khi đang load, hiện spinner + "Analyzing vocabularies…". Detail list hiện readings kèm label Pinyin/Jyutping/Sino (không ẩn trong tooltip).
- **Không có nút riêng để dedupe** — việc dedupe tự xảy ra trong lúc sync (qua `resolveHanCharacter`).
- **Đã xóa**: `MissingHanCharsSync.jsx`, `hanCharExtract.js` (thay bằng sync backend).
