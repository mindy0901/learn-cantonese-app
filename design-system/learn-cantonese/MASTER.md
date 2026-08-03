# Design System Master File — Learn Cantonese

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Learn Cantonese
**Updated:** 2026-07-27
**Category:** Language Learning App (Cantonese / Chinese)

---

## 1. Color Palette

### 1.1 Light Mode

| Token              | Hex       | Usage                       |
| ------------------ | --------- | --------------------------- |
| `--han-color`      | `#3730a3` | Hán tự (Chinese characters) |
| `--pinyin-color`   | `#0e7490` | Pinyin (same as jyutping)   |
| `--jyutping-color` | `#0e7490` | Jyutping romanization       |
| `--viet-color`     | `#16a34a` | Sino-Vietnamese (Hán-Việt)  |
| `--text`           | `#475569` | Body text                   |
| `--text-h`         | `#312e81` | Heading text                |
| `--text-muted`     | `#475569` | Muted / secondary text      |
| `--bg`             | `#eef2ff` | Page background             |
| `--surface`        | `#ffffff` | Card / table surface        |
| `--border`         | `#c7d2fe` | Borders                     |
| `--accent`         | `#4f46e5` | Primary / interactive       |
| `--accent-hover`   | `#4338ca` | Hover state                 |
| `--success-text`   | `#16a34a` | Success / mastered          |

### 1.2 Dark Mode

| Token              | Hex       |
| ------------------ | --------- |
| `--han-color`      | `#f87171` |
| `--pinyin-color`   | `#67e8f9` |
| `--jyutping-color` | `#67e8f9` |
| `--viet-color`     | `#4ade80` |
| `--text`           | `#cbd5e1` |
| `--text-h`         | `#e0e7ff` |
| `--text-muted`     | `#a5b4fc` |
| `--bg`             | `#0f0a2e` |
| `--surface`        | `#1e1b4b` |
| `--border`         | `#3730a3` |
| `--accent`         | `#818cf8` |
| `--accent-hover`   | `#a5b4fc` |
| `--success-text`   | `#4ade80` |

### 1.3 Han Popularity Colors

| Level | Light     | Dark      |
| ----- | --------- | --------- |
| 0     | `#dc2626` | `#f87171` |
| 1     | `#ea580c` | `#fb923c` |
| 2     | `#65a30d` | `#a3e635` |
| 3     | `#059669` | `#34d399` |
| 4     | `#7c3aed` | `#a78bfa` |

---

## 2. Typography

### 2.1 Font Families

| Role      | Font Stack                                                                 |
| --------- | -------------------------------------------------------------------------- |
| Body      | `"Roboto", "Inter", "Noto Sans SC", "Noto Sans TC", system-ui, sans-serif` |
| Heading   | Same as body                                                               |
| Mono/Code | `"Roboto Mono", ui-monospace, Consolas, monospace`                         |

**Google Fonts:** Roboto (400,500,700) + Inter (400,500,600,700) + Roboto Mono (400,500) + Noto Sans SC (400,500,600,700) + Noto Sans TC (400,500,600,700)

### 2.2 Base Sizes

| Token      | Value  | Usage            |
| ---------- | ------ | ---------------- |
| `:root`    | `20px` | Base font-size   |
| `md` scale | `22px` | Medium font-size |
| `lg` scale | `24px` | Large font-size  |

### 2.3 Element Font Sizes & Weights

| Element            | Class / Tag  | Font Size                | Weight                             |
| ------------------ | ------------ | ------------------------ | ---------------------------------- |
| Hán tự (table)     | `text-5xl`   | `3rem` (48px)            | `font-semibold` (600)              |
| Hán tự (detail)    | `wd-han`     | `clamp(3rem, 8vw, 7rem)` | `font-semibold` (600)              |
| Pinyin             | `text-base`  | `1rem` (20px)            | `font-semibold` (600)              |
| Jyutping           | `romanClass` | `1rem` (20px)            | `font-semibold` (600)              |
| Hán-Việt (table)   | `text-base`  | `1rem` (20px)            | normal (400), `uppercase`          |
| Hán-Việt (detail)  | `wd-text`    | inherited                | `font-medium` (500)                |
| Heading h1         | `h1`         | `2rem` (40px)            | `font-semibold` (600)              |
| Heading h2         | `h2`         | `1.125rem` (22.5px)      | `font-semibold` (600)              |
| Small labels       | `text-xs`    | `0.75rem` (15px)         | normal / semibold                  |
| Sub-label (detail) | `wd-sub`     | inherited                | `font-semibold` (600), `uppercase` |

### 2.4 Line Heights

| Context         | Value                    |
| --------------- | ------------------------ |
| Body            | `1.5`                    |
| Hán tự          | `1.25` (`leading-tight`) |
| Pinyin/Jyutping | `1.375` (`leading-snug`) |
| Headings        | inherited                |

---

## 3. Romanization Rules (Pinyin & Jyutping)

| Rule                         | Value                                        |
| ---------------------------- | -------------------------------------------- |
| Color                        | **Same** for pinyin & jyutping               |
| Font weight                  | **`font-semibold` (600)** for both           |
| Font style                   | `not-italic`                                 |
| Letter spacing               | `tracking-wide` (`0.025em`)                  |
| Wrap                         | `truncate` (table) / `break-normal` (detail) |
| Separator (single-char word) | `·` (middle dot, `text-text-muted text-sm`)  |

---

## 4. Han Character Rules

| Rule                              | Value                                                         |
| --------------------------------- | ------------------------------------------------------------- |
| Color                             | `text-han` (red tone)                                         |
| Font weight                       | `font-semibold` (600)                                         |
| Hover effect                      | `hover:opacity-80 transition-opacity duration-150`            |
| Diff highlight (trad/simp differ) | `text-amber-600 dark:text-amber-400` (no background)          |
| Diff highlight scope              | **Both** simplified & traditional sides                       |
| Click behavior                    | Both sides link to **same** Hanzii page (simplified lookup)   |
| Single-form (1 phiên bản)         | Chỉ hiện **1 form traditional**; KHÔNG hiện simplified trùng  |
| Màu (trang Han Characters)        | 🔴 đỏ = traditional, 🔵 xanh = simplified (chỉ khi khác nhau) |

---

## 5. Layout Rules

### 5.1 Kho Từ (Word Bank Table)

| Rule                  | Value                               |
| --------------------- | ----------------------------------- |
| Han cell padding      | `py-1.5`                            |
| Phonetic position     | Below han char, `items-end` on grid |
| Hán-Việt column width | `max-w-[200px] truncate`            |
| HSK badge min-width   | `82px`                              |

### 5.2 Trang Chi Tiết (Word Detail)

| Rule                     | Value                                  |
| ------------------------ | -------------------------------------- |
| Card gap                 | `gap-3`                                |
| Content alignment        | `justify-start items-start` (top-left) |
| Hán-Việt position        | **Above** han characters               |
| Pinyin/Jyutping position | **Below** respective han char in card  |

---

## 6. Component Reuse

| Component           | File                    | When to use             |
| ------------------- | ----------------------- | ----------------------- |
| `HanVariantCell`    | `WordRow.jsx`           | Han char in word bank   |
| `HanziiHanCellLink` | `HanziiHanCellLink.jsx` | Clickable han char link |
| `DiffHanChars`      | `hanScriptDisplay.js`   | Compute trad/simp diff  |

---

## 7. Icons & Visual

- ❌ **No emoji as icons** — use SVG from `NavIcons.jsx` or Lucide
- ✅ `cursor-pointer` on all clickable elements
- ✅ `active:enabled:scale-[0.97]` on all buttons
- ✅ `focus-visible:outline-accent` for focus states
- ✅ `transition` 150-300ms for hover/active

---

## 8. Han Characters Page — Verified UI Rules (2026-08-02)

> Ghi chú UI/UX đã xác minh, bổ sung cho MASTER.md. Chi tiết kỹ thuật (backend/sync/auth) xem `AGENTS.md` mục 9.

### 8.1 Hán tự single-form (chỉ 1 phiên bản)

- `hanSimplified = NULL` khi không có simplified riêng (vd 慧, 人, 大, 山, 你, 仇, 熏).
- **Bảng hiển thị:** chỉ hiện **1 form traditional** (🔴 đỏ), KHÔNG hiện `/ simplified` trùng (dùng `item.hanSimplified && item.hanSimplified !== item.hanTraditional`).
- **Edit form:** khi `hanSimplified === hanTraditional` → field **Simplified để trống** (`HanCharacterRow.jsx`, `AddHanCharacterModal.jsx`); lưu `hanSimplified: x || undefined`.
- **Detail page:** chỉ hiện traditional khi single-form.

### 8.2 Sidebar "Sync Data" (trang Han Characters)

- Chỉ còn **5 nút**: Pinyin, Jyutping, Traditional/Simplified, Vocabularies → Chinese Characters, Remove duplicates.
- Nút **"Vocabularies → Chinese Characters"** (`MissingHanCharsSync`): click mở **modal** → nút "Sync N items" trong modal mới chạy; khi không còn item → hiện **"0 — Fully synced"** (disabled).
- Đã xóa 4 nút dư thừa: Sino-Vietnamese (phienam), Vocab-Han Relations, From Vocabularies, Sino-Vietnamese → Vocabularies.

### 8.3 Màu simplified / traditional

- 🔴 **Đỏ** = traditional (phồn thể)
- 🔵 **Xanh** = simplified (giản thể) — chỉ hiển thị khi khác traditional
