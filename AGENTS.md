# Agent Guidelines — Learn Cantonese App

> Dành cho các AI agent khi làm việc với project này. Đọc kỹ trước khi thực hiện bất kỳ thay đổi nào.

---

## 0. Quy ước đặt tên

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

## 1. Kiến trúc dữ liệu

### 1.1 File nguồn duy nhất

- **`backend/vocabularies.json`** — file JSON chứa toàn bộ từ vựng HSK (12,614 entries, 13,218 pronunciations).
- Không còn file `hsk_full.json` nào khác. Đã xóa.
- File này được export từ database, là bản backup chính xác của dữ liệu hiện tại.

### 1.2 Cấu trúc JSON

```json
{
    "character": "啊",
    "forms": { "simplified": "啊", "traditional": "啊" },
    "level": "HSK 2",
    "pronunciations": [
        { "pinyin": "a", "jyutping": "aa3", "sino_vietnamese": "A" },
        { "pinyin": "à", "jyutping": "", "sino_vietnamese": "A" }
    ]
}
```

- Mỗi entry có thể có **nhiều pronunciations** (các phiên âm khác nhau của cùng một từ).
- Mỗi pronunciation → **một dòng riêng** trong database.

### 1.3 Quy tắc chuẩn hóa phiên âm (Pinyin & Jyutping)

Khi so sánh, tìm kiếm, hoặc tạo ID cố định, luôn chuẩn hóa:

| Thao tác           | Công thức                  | Ví dụ                          |
| ------------------ | -------------------------- | ------------------------------ |
| Chuẩn hóa pinyin   | Bỏ khoảng trắng, lowercase | `"qǔ xiāo"` → `"qǔxiāo"`       |
| Chuẩn hóa jyutping | Bỏ khoảng trắng, lowercase | `"ceoi2 siu1"` → `"ceoi2siu1"` |

**Quy tắc quan trọng nhất:** `"qǔ xiāo"` và `"qǔxiāo"` là **cùng một pronunciation**. Đây là 2 cách viết khác nhau của cùng một phiên âm (có dấu cách vs không dấu cách). **Không được tạo 2 entry riêng cho chúng.**

### 1.4 Mapping: JSON entry → DB rows

Mỗi pronunciation trong mảng `pronunciations` → 1 dòng trong bảng `vocabularies`:

```
JSON entry "啊" có 5 pronunciations:
  ├─ { pinyin: "a",  jyutping: "aa3" } → DB row #1
  ├─ { pinyin: "à",  jyutping: ""    } → DB row #2
  ├─ { pinyin: "ǎ",  jyutping: ""    } → DB row #3
  ├─ { pinyin: "ā",  jyutping: ""    } → DB row #4
  └─ { pinyin: "á",  jyutping: ""    } → DB row #5
```

Các field `character`, `forms`, `level` được copy giống nhau cho tất cả các dòng của cùng một entry.

### 1.5 ID cố định (stable UUID)

Mỗi DB row có UUID được sinh từ hash MD5:

```
stableUUID = MD5( hanTraditional | hanSimplified | normPinyin | normJyutping )
```

Trong đó `normPinyin` và `normJyutping` đã được chuẩn hóa (bỏ khoảng trắng, lowercase).

**Ví dụ:**

- Entry "取消" + pinyin `"qǔ xiāo"` + jyutping `"ceoi2 siu1"`
- Key: `取消||qǔxiāo|ceoi2siu1`
- UUID: `md5("取消||qǔxiāo|ceoi2siu1")` → luôn ra cùng một UUID

→ Dù seed bao nhiêu lần, cùng một từ + phiên âm luôn có cùng ID.

### 1.3 Database

- PostgreSQL trong Docker (`docker-compose.dev.yml`)
- User/pass/db: `cantonese` / `cantonese` / `cantonese`
- Tổng: ~13,286 từ (13,218 HSK + ~68 custom của user)

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

## 3. Seed script (`backend/prisma/seed.ts`)

### 3.1 Hành vi

| Trường hợp                                | Hành động                                            |
| ----------------------------------------- | ---------------------------------------------------- |
| Entry đã tồn tại trong DB (khớp ID)       | **Bỏ qua hoàn toàn** — không ghi đè bất kỳ field nào |
| Entry mới (ID chưa có trong DB)           | **Tạo mới**                                          |
| Entry trong DB không còn trong file nguồn | **Xóa** (dọn rác)                                    |
| `userVocabulary` (study progress)         | **Upsert với `update: {}`** — giữ nguyên progress    |

### 3.2 Cơ chế ID cố định

Mỗi vocabulary row có ID được tạo từ hash:

```
MD5(hanTraditional | hanSimplified | normPinyin | normJyutping)
```

→ Cùng một từ + phiên âm luôn có cùng ID, bất kể seed bao nhiêu lần.

### 3.3 KHÔNG BAO GIỜ

- ❌ Dùng `deleteMany` cho vocabulary trong seed
- ❌ Dùng `skipDuplicates` khi tạo vocabulary
- ❌ Ghi đè field user đã chỉnh sửa
- ❌ Thay đổi ID vocabulary đã tồn tại

### 3.4 Cách chạy

```bash
docker compose -f docker-compose.dev.yml exec -T backend npx prisma db seed
```

---

## 4. Merge / Bổ sung từ vựng mới

### 4.1 Quy trình

1. **Chỉnh sửa `vocabularies.json`** — thêm entry mới hoặc thêm pronunciation vào entry có sẵn.
2. **Chạy seed** — các entry mới sẽ được thêm, entry cũ không bị ảnh hưởng.
3. Nếu muốn xóa entry khỏi DB, **xóa nó khỏi `vocabularies.json`** rồi chạy seed.

### 4.2 Merge từ file khác

Nếu cần merge từ file ngoài vào:

- Dùng `vocabularies.json` làm gốc.
- So sánh pronunciation bằng **pinyin đã chuẩn hóa** (bỏ khoảng trắng, lowercase).
- `"qǔ xiāo"` và `"qǔxiāo"` → cùng một pronunciation → không thêm trùng.
- Các pronunciation không có trong gốc mới được thêm vào.

### 4.3 Thuật toán merge chi tiết

```
1. Load vocabularies.json (gốc)  —  build Map<"trad|simp", entry>
2. Load file bổ sung              —  duyệt từng entry
3. Với mỗi entry từ file bổ sung:
   a. Tìm entry tương ứng trong gốc (theo traditional + simplified)
   b. Nếu tìm thấy:
      - So sánh từng pronunciation bằng normPinyin (bỏ space, lowercase)
      - Nếu normPinyin đã tồn tại → BỎ QUA (không thêm trùng)
      - Nếu normPinyin chưa có → THÊM vào mảng pronunciations
   c. Nếu không tìm thấy → THÊM toàn bộ entry mới vào gốc
4. Ghi đè vocabularies.json
5. Chạy seed
```

**Lưu ý dedup:** Chỉ so sánh bằng `normPinyin`, không dùng jyutping làm key.
Vì trong file bổ sung, split-pinyin có thể có jyutping, còn unsplit-pinyin thì jyutping rỗng.
Nếu so sánh cả jyutping sẽ tạo ra 2 entry trùng lặp.

---

## 5. Export database → JSON (backup)

Khi cần cập nhật `vocabularies.json` từ database hiện tại:

```bash
# Tạo file export script (backend/export-db.mjs) rồi chạy trong container:
docker compose -f docker-compose.dev.yml exec -T backend node -e "
const { PrismaClient } = require('./generated/prisma/client.js');
const { PrismaPg } = require('@prisma/adapter-pg');
const pg = require('pg');
const fs = require('fs');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
(async () => {
  const rows = await prisma.vocabulary.findMany({
    where: { hsk_level: { not: null, not: '' } },
    orderBy: { han_traditional: 'asc' }
  });
  // Group by (hanTraditional, hanSimplified)
  const map = new Map();
  for (const r of rows) {
    const k = r.hanTraditional + '|' + (r.hanSimplified || '');
    if (!map.has(k)) map.set(k, { character: r.hanTraditional, forms: { simplified: r.hanSimplified || '', traditional: r.hanTraditional }, level: r.hskLevel || '', pronunciations: [] });
    map.get(k).pronunciations.push({ pinyin: r.pinyin || '', jyutping: r.jyutping || '', sino_vietnamese: r.sinoVietnamese || '' });
  }
  fs.writeFileSync('vocabularies.json', JSON.stringify([...map.values()], null, 2));
  console.log('Done: ' + [...map.values()].length + ' entries');
  await prisma.\$disconnect(); await pool.end();
})();
"
```

**Quy tắc export:**

- Chỉ export từ có `hsk_level IS NOT NULL AND hsk_level != ''` (từ HSK).
- Không export custom entries (hsk_level = NULL) — đó là dữ liệu của user.
- Group theo `(hanTraditional, hanSimplified)` để gộp pronunciations vào cùng 1 entry.

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
