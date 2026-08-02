# Agent Guidelines — Learn Cantonese App

> Dành cho các AI agent khi làm việc với project này. Đọc kỹ trước khi thực hiện bất kỳ thay đổi nào.
>
> ⚠️ **QUAN TRỌNG:** Database PostgreSQL là nguồn dữ liệu duy nhất. Tuyệt đối không xóa, ghi đè, hay chạy seed/migration mà không có sự đồng ý rõ ràng của user. Phải hỏi user và chờ xác nhận trước khi thực hiện bất kỳ thao tác nào liên quan đến database.

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

| Domain                        | Dùng                                    | Không dùng       |
| ----------------------------- | --------------------------------------- | ---------------- |
| Từ vựng (variable, prop, key) | `vocabulary` / `vocabularies` / `vocab` | `word` / `words` |
| Ngữ pháp                      | `grammar` / `grammars`                  |                  |
| Mẫu câu                       | `sentence` / `sentences`                |                  |
| Bài học                       | `lesson` / `lessons`                    |                  |
| Hán tự                        | `hanCharacter` / `hanCharacters`        |                  |
| Flashcard                     | `flashcard` / `flashcards`              |                  |

- ❌ **Không** dùng `word` / `words` cho bất kỳ variable, prop, key, hoặc object field nào liên quan đến từ vựng.
- ✅ Luôn dùng `vocabulary` (số ít) hoặc `vocabularies` (số nhiều) hoặc `vocab` (viết tắt).
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
- Tổng: ~13,286 từ (13,218 HSK + ~68 custom của user)
- `backend/vocabularies.json` chỉ là file backup/export, **không phải source of truth**

### 1.3 Quy tắc chuẩn hóa phiên âm (Pinyin & Jyutping)

Khi so sánh, tìm kiếm, hoặc tạo ID cố định, luôn chuẩn hóa:

| Thao tác           | Công thức                  | Ví dụ                          |
| ------------------ | -------------------------- | ------------------------------ |
| Chuẩn hóa pinyin   | Bỏ khoảng trắng, lowercase | `"qǔ xiāo"` → `"qǔxiāo"`       |
| Chuẩn hóa jyutping | Bỏ khoảng trắng, lowercase | `"ceoi2 siu1"` → `"ceoi2siu1"` |

**Quy tắc quan trọng nhất:** `"qǔ xiāo"` và `"qǔxiāo"` là **cùng một pronunciation**. Đây là 2 cách viết khác nhau của cùng một phiên âm (có dấu cách vs không dấu cách). **Không được tạo 2 entry riêng cho chúng.**

### 1.4 ID cố định (stable UUID)

Mỗi DB row có UUID được sinh từ hash MD5:

```
stableUUID = MD5( hanTraditional | hanSimplified | normPinyin | normJyutping )
```

Trong đó `normPinyin` và `normJyutping` đã được chuẩn hóa (bỏ khoảng trắng, lowercase).

→ Cùng một từ + phiên âm luôn có cùng ID, bất kể seed bao nhiêu lần.

### 1.5 Quy tắc Hán tự: Traditional là mặc định

Khi một hán tự chỉ có 1 phiên bản (giản thể và phồn thể giống nhau, hoặc chỉ có 1 form), **mặc định là traditional (phồn thể)**.

| Trường hợp                             | hanTraditional                             | hanSimplified       |
| -------------------------------------- | ------------------------------------------ | ------------------- |
| Chữ chỉ có 1 form (VD: 人, 大, 山)     | Giữ nguyên                                 | Giữ nguyên (= trad) |
| Chữ có giản/phồn khác nhau (VD: 学/學) | **Phồn thể** (學)                          | **Giản thể** (学)   |
| Chữ có nhiều variant traditional       | Dùng variant phổ biến nhất (VD: 臺 cho 台) | Dùng giản thể chuẩn |

**Quy tắc bắt buộc:**

- ✅ `hanTraditional` luôn là phồn thể
- ✅ `hanSimplified` luôn là giản thể
- ❌ Không được đảo ngược (traditional ≠ simplified)
- ✅ Khi unsure, tra cứu OpenCC hoặc Hanzii để xác định đúng form
- ✅ Màu hiển thị: **🔵 xanh = simplified**, **🔴 đỏ = traditional**

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

## 3. Seed script

Seed script (`backend/prisma/seed.ts`) chỉ được chạy khi có sự đồng ý của user.

### 3.1 Hành vi

| Trường hợp                          | Hành động                                            |
| ----------------------------------- | ---------------------------------------------------- |
| Entry đã tồn tại trong DB (khớp ID) | **Bỏ qua hoàn toàn** — không ghi đè bất kỳ field nào |
| Entry mới (ID chưa có trong DB)     | **Tạo mới**                                          |
| `userVocabulary` (study progress)   | **Upsert với `update: {}`** — giữ nguyên progress    |

### 3.2 KHÔNG BAO GIỜ

- ❌ Dùng `deleteMany` cho vocabulary trong seed
- ❌ Dùng `skipDuplicates` khi tạo vocabulary
- ❌ Ghi đè field user đã chỉnh sửa
- ❌ Thay đổi ID vocabulary đã tồn tại
- ❌ Tự ý chạy seed mà không hỏi user trước

### 3.3 Cách chạy (chỉ khi user đồng ý)

```bash
docker compose -f docker-compose.dev.yml exec -T backend npx prisma db seed
```

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

File `backend/vocabularies.json` là bản backup/export từ database, **không phải source of truth**.

---

## 6. Các trường dữ liệu — ai sở hữu?

| Field                                    | Nguồn     | Bị seed ghi đè? |
| ---------------------------------------- | --------- | :-------------: |
| `hanTraditional`, `hanSimplified`        | JSON      |       ❌        |
| `pinyin`, `jyutping`                     | JSON      |       ❌        |
| `sinoVietnamese`                         | JSON      |       ❌        |
| `hskLevel`                               | JSON      |       ❌        |
| `vietMeanings`, `engMeanings`            | User (UI) |       ❌        |
| `vietExamples`                           | User (UI) |       ❌        |
| `important`, `mastered`, `studyProgress` | User (UI) |       ❌        |
| `vocabularyMeanings` (nested)            | User (UI) |       ❌        |
| `vocabularyExamples` (nested)            | User (UI) |       ❌        |

→ **Không field nào bị seed ghi đè.**

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

### 8.1 Nguồn tham chiếu bắt buộc

Khi tạo UI mới hoặc sửa UI hiện có, **luôn đọc file design system trước**:

```
design-system/learn-cantonese/MASTER.md
```

Nếu có page-specific override, đọc `design-system/learn-cantonese/pages/[page-name].md` — file này ghi đè MASTER.md.

### 8.2 Skill `ui-ux-pro-max` (ƯU TIÊN HÀNG ĐẦU)

> ⚠️ **Trước khi tạo hoặc sửa bất kỳ UI nào**, phải dùng skill `ui-ux-pro-max` để tra cứu guidelines. Đây là nguồn tham chiếu UI/UX chính thức, thay thế mọi rule CSS cứng trước đây.

Khi cần tìm kiếm UX guidelines, color palettes, hoặc style references:

```bash
# Tìm UX guidelines
python .codewhale/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain ux -n 5

# Tìm color palette
python .codewhale/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain color -n 3

# Tìm style
python .codewhale/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain style -n 5

# Tạo/cập nhật design system
python .codewhale/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system --persist -p "Learn Cantonese"
```

### 8.3 Palette hiện tại

| Token                | Light     | Dark      |
| -------------------- | --------- | --------- |
| `--accent` (primary) | `#4F46E5` | `#818CF8` |
| `--accent-hover`     | `#4338CA` | `#A5B4FC` |
| `--success-text`     | `#16A34A` | `#4ADE80` |
| `--bg`               | `#EEF2FF` | `#0F0A2E` |
| `--surface`          | `#ffffff` | `#1E1B4B` |
| `--border`           | `#C7D2FE` | `#3730A3` |
| `--text-h`           | `#312E81` | `#E0E7FF` |

### 8.4 Component tái sử dụng

Khi tạo UI, ưu tiên dùng các component có sẵn:

| Component                                           | File                                  | Dùng khi                 |
| --------------------------------------------------- | ------------------------------------- | ------------------------ |
| `EmptyState`                                        | `ui/EmptyState.jsx`                   | Trang không có dữ liệu   |
| `SkeletonTable` / `SkeletonStats` / `SkeletonBlock` | `ui/Skeleton.jsx`                     | Loading states           |
| `NavIcons` (IconWordBank, IconGrammar, ...)         | `NavIcons.jsx`                        | SVG icons cho navigation |
| `Button` / `btnClass()`                             | `ui/Button.jsx`, `ui/buttonStyles.js` | Nút bấm                  |

### 8.5 Quy tắc bắt buộc

- ❌ **Không dùng emoji làm icon** — dùng SVG từ `NavIcons.jsx` hoặc Lucide/Heroicons
- ✅ **`cursor-pointer`** trên mọi phần tử clickable
- ✅ **Transition 150-300ms** cho hover/active states
- ✅ **Focus states visible** (`focus-visible:outline-accent`)
- ✅ **`prefers-reduced-motion`** respected
- ✅ **`active:enabled:scale-[0.97]`** cho tất cả buttons

### 8.6 Quy tắc Spacing — BẮT BUỘC

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
