# HANDOFF — Di chuyển sang learn-cantonese-app-next

**Ngày tạo:** 2026-07-18
**Người tạo:** CodeWhale agent (deepseek-v4-pro)
**Mục tiêu:** Di chuyển toàn bộ logic và giao diện từ `learn-cantonese-app` sang thư mục mới `learn-cantonese-app-next`, giữ nguyên cấu trúc monorepo pnpm workspace.

---

## 1. Tổng quan dự án

**learn-cantonese-app** là ứng dụng fullstack học tiếng Quảng Đông — word bank, grammar bank, sentence patterns, lessons, flashcards, và tra cứu chữ Hán.

| Lớp | Công nghệ |
|------|-----------|
| Frontend | React 19 SPA, Vite 8, Tailwind CSS v4, Zustand, React Router v7 |
| Backend | Express (Node 22), cookie-session, Supabase (PostgreSQL) |
| Auth | Google OAuth → session cookie |
| Deploy | Vercel (monorepo), Docker Compose (dev + prod) |

**Package manager:** pnpm@9.15.9 (pinned)
**Module system:** ESM (`"type": "module"`)
**Ngôn ngữ:** Pure JavaScript + JSDoc (KHÔNG dùng TypeScript)

---

## 2. Cấu trúc thư mục hiện tại

```
learn-cantonese-app/
├── package.json              # Root workspace (deploy scripts only)
├── pnpm-lock.yaml
├── vercel.json               # Vercel monorepo deploy config
├── docker-compose.yml        # Prod Docker
├── docker-compose.dev.yml    # Dev Docker
├── .env.dev.example          # Template biến môi trường dev
├── .env.prod.example         # Template biến môi trường prod
├── .gitignore
├── AGENTS.md                 # Hướng dẫn cho AI agent
├── HANDOFF.md                # File này
├── test.js                   # File test tạm (untracked)
│
├── frontend/                 # React SPA
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── vite.config.js
│   ├── index.html
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── .dockerignore
│   ├── .gitignore
│   ├── public/
│   │   └── favicon.svg
│   └── src/
│       ├── main.jsx          # Entry point
│       ├── App.jsx           # Router + Layout
│       ├── index.css         # Tailwind v4 + CSS theme variables
│       ├── pages/            # Route-level page components
│       │   ├── HomePage.jsx
│       │   ├── WordBankPage.jsx
│       │   ├── WordDetailPage.jsx
│       │   ├── GrammarBankPage.jsx
│       │   ├── SentencePatternsPage.jsx
│       │   ├── LessonsPage.jsx
│       │   ├── LessonDetailPage.jsx
│       │   ├── LessonEditPage.jsx
│       │   ├── FlashcardPage.jsx
│       │   ├── HanLookupPage.jsx
│       │   ├── HanCharactersPage.jsx      # MỚI (untracked)
│       │   ├── HanCharacterDetailPage.jsx # MỚI (untracked)
│       │   └── ErrorPage.jsx             # MỚI (untracked)
│       ├── components/       # Shared UI components
│       │   ├── AddGrammarModal.jsx
│       │   ├── AddHanCharacterModal.jsx   # MỚI (untracked)
│       │   ├── AddSentenceModal.jsx
│       │   ├── AddWordModal.jsx
│       │   ├── AuthGate.jsx
│       │   ├── BankSearchInput.jsx
│       │   ├── CloudGate.jsx
│       │   ├── ConfirmDialog.jsx
│       │   ├── FlashcardDeck.jsx
│       │   ├── FlashcardSessionSetup.jsx
│       │   ├── FlashcardSessionSummary.jsx
│       │   ├── FlashcardSizePicker.jsx
│       │   ├── FlashcardStatsPanel.jsx
│       │   ├── FontSizeSwitcher.jsx       # MỚI (untracked)
│       │   ├── GoogleIcon.jsx
│       │   ├── GrammarBankListPanel.jsx
│       │   ├── GrammarPicker.jsx
│       │   ├── GrammarPickerItem.jsx
│       │   ├── GrammarRow.jsx
│       │   ├── HanCharacterRow.jsx        # MỚI (untracked)
│       │   ├── HanVariantsInline.jsx
│       │   ├── HanVariantSyncButton.jsx
│       │   ├── HanziiHanCellLink.jsx
│       │   ├── LanguageSwitcher.jsx
│       │   ├── Layout.jsx
│       │   ├── LoadingButton.jsx
│       │   ├── MissingHanCharsSync.jsx    # MỚI (untracked)
│       │   ├── Pagination.jsx
│       │   ├── PinyinSyncButton.jsx
│       │   ├── SentenceBankListPanel.jsx
│       │   ├── SentenceDetailModal.jsx
│       │   ├── SentenceRow.jsx
│       │   ├── TagInput.jsx               # MỚI (untracked)
│       │   ├── UiSettings.jsx
│       │   ├── UserMenu.jsx
│       │   ├── WordBankBrowseTable.jsx
│       │   ├── WordBankListPanel.jsx
│       │   ├── WordDetailContent.jsx
│       │   ├── WordEditFields.jsx
│       │   ├── WordFieldText.jsx
│       │   ├── WordPicker.jsx
│       │   ├── WordPopularityPicker.jsx
│       │   ├── WordRelatedLessons.jsx
│       │   ├── WordRow.jsx
│       │   ├── WordSentenceSuggestions.jsx
│       │   ├── lesson-edit/
│       │   │   ├── LessonEditFooter.jsx
│       │   │   ├── LessonGrammarSection.jsx
│       │   │   └── LessonVocabSection.jsx
│       │   └── ui/
│       │       ├── Button.jsx
│       │       └── bankToolbarStyles.js
│       ├── store/             # Zustand stores
│       │   ├── appStore.js           # Central data store (~1000 lines)
│       │   ├── authStore.js
│       │   ├── localeStore.js
│       │   ├── prefsStore.js
│       │   ├── uiStore.js
│       │   ├── fontSizeStore.js      # MỚI (untracked)
│       │   └── lessonDraftStore.js
│       ├── lib/               # Pure utility functions
│       │   ├── actionLog.js
│       │   ├── api.js                # API client
│       │   ├── cedictLookup.js
│       │   ├── cn.js                 # clsx + tailwind-merge
│       │   ├── constants.js
│       │   ├── dataCache.js          # IndexedDB cache (MỚI, untracked)
│       │   ├── dataTransforms.js
│       │   ├── emptyMessage.js
│       │   ├── flashcard*.js         # flashcardDue, flashcardPrefs, flashcardProgress, flashcardStats, flashcardWords
│       │   ├── grammarFilters.js
│       │   ├── grammarSearch.js
│       │   ├── hanCharExtract.js     # MỚI (untracked)
│       │   ├── hanCharacterBrowseCache.js # MỚI (untracked)
│       │   ├── hanCharacterRoutes.js # MỚI (untracked)
│       │   ├── hanLookup.js
│       │   ├── hanScriptDisplay.js
│       │   ├── hanVariantSync.js
│       │   ├── hanVietMarkers.js
│       │   ├── hanVietReadings.js
│       │   ├── hanzii.js
│       │   ├── lessonFilters.js
│       │   ├── opencc.js
│       │   ├── pagination.js
│       │   ├── pinyin.js
│       │   ├── pinyinSync.js
│       │   ├── prefs.js
│       │   ├── sentenceFilters.js
│       │   ├── sentencePatternMatch.js
│       │   ├── sentenceSearch.js
│       │   ├── wordBankReturn.js
│       │   ├── wordBrowseCache.js
│       │   ├── wordDialect.js
│       │   ├── wordDisplay.js
│       │   ├── wordFilters.js
│       │   ├── wordPopularity.js
│       │   ├── wordRoutes.js
│       │   └── wordSearch.js
│       ├── i18n/               # Locale system
│       │   ├── index.js
│       │   ├── types.js
│       │   └── locales/
│       │       ├── en.js
│       │       ├── vi.js
│       │       ├── zh-CN.js
│       │       └── zh-TW.js
│       ├── types/              # Domain model factories
│       │   └── word.js
│       ├── context/
│       ├── hooks/
│       │   ├── useConfirmDialog.jsx
│       │   ├── useDebouncedValue.js
│       │   └── useOpenWordDetail.js
│       └── assets/
│
├── backend/                  # Express API server
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── app.js                # Express app (Vercel entrypoint)
│   ├── index.js              # Dev entrypoint (app.listen)
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── .gitignore
│   ├── routes/
│   │   ├── auth.js           # Google OAuth
│   │   ├── data.js           # CRUD API (~1000 lines)
│   │   └── cedict.js         # CC-CEDICT lookup
│   ├── middleware/
│   │   ├── auth.js           # requireAuth, getUserId
│   │   └── appAdmin.js       # Admin guard
│   ├── lib/
│   │   ├── actionLog.js
│   │   ├── appAdmin.js
│   │   ├── cedictSearch.js
│   │   ├── dataService.js    # Row ↔ domain transforms
│   │   ├── hanCharHanVietBackfill.js  # MỚI (untracked)
│   │   ├── hanCharJyutpingBackfill.js # MỚI (untracked)
│   │   ├── hanCharPinyinBackfill.js   # MỚI (untracked)
│   │   ├── hanCharVariantBackfill.js  # MỚI (untracked)
│   │   ├── hanVariantBackfill.js
│   │   ├── hanVietMarkers.js
│   │   ├── hanVietReadings.js
│   │   ├── jyutping.js               # MỚI (untracked)
│   │   ├── opencc.js
│   │   ├── pinyin.js
│   │   ├── pinyinBackfill.js
│   │   ├── publicData.js
│   │   ├── searchNormalize.js
│   │   ├── sentencePatternMatch.js
│   │   ├── supabaseAdmin.js
│   │   ├── wordDialect.js
│   │   ├── wordHanRelation.js        # MỚI (untracked)
│   │   ├── wordNormalize.js
│   │   ├── wordPopularity.js
│   │   └── wordQuery.js
│   ├── scripts/              # One-off scripts
│   │   ├── _count_simplified.mjs       # MỚI (untracked)
│   │   ├── _run_migration.js           # MỚI (untracked)
│   │   ├── _test_pg.js                 # MỚI (untracked)
│   │   ├── _test_sql.js                # MỚI (untracked)
│   │   ├── add-jyutping-column.js      # MỚI (untracked)
│   │   ├── backfill-han-variants.js
│   │   ├── backfill-hk-traditional.js  # MỚI (untracked)
│   │   ├── fix-search-key-d.js         # MỚI (untracked)
│   │   ├── import-han-characters.js    # MỚI (untracked)
│   │   ├── migrate-search-key.js       # MỚI (untracked)
│   │   └── rebuild-han-characters.js   # MỚI (untracked)
│   ├── data/                 # Static data files
│   │   ├── cccanto-webdist.txt
│   │   ├── char.csv                   # MỚI (untracked)
│   │   ├── chinese-hanviet-non-cognates.tsv
│   │   └── phienam.txt
│   └── supabase/
│       ├── config.toml
│       └── migrations/       # 40+ SQL migration files
│           ├── 20260707120000_initial_schema.sql
│           ├── ... (xem git status để có danh sách đầy đủ)
│           └── 20260715100000_word_han_characters.sql  # MỚI (untracked)
│
└── api/                      # (thư mục rỗng hoặc không dùng)
```

---

## 3. Trạng thái Git hiện tại

**Branch:** main (có uncommitted changes)
**124 files modified, 50 files untracked**

### File đã xóa (Deleted):
| File | Ghi chú |
|------|---------|
| `backend/data/chinese-hanviet-cognates.tsv` | Dữ liệu Hán-Việt cognates cũ |
| `backend/lib/hanVietCognates.js` | Module Hán-Việt cognates cũ |
| `backend/lib/hanVietPhienam.js` | Module phiên âm cũ |
| `backend/lib/mergeService.js` | Service merge cũ |
| `backend/lib/sheetFetch.js` | Sheet fetch cũ |
| `backend/lib/sheetMergePreview.js` | Sheet merge preview cũ |
| `backend/routes/hanviet.js` | Route Hán-Việt cũ |
| `frontend/src/components/HanVietCognatesSyncButton.jsx` | Component cũ |
| `frontend/src/components/HanVietSyncButton.jsx` | Component cũ |
| `frontend/src/components/SheetExportButton.jsx` | Component cũ |
| `frontend/src/components/SheetUpdateButton.jsx` | Component cũ |
| `frontend/src/lib/hanVietCharMap.js` | Lib cũ |
| `frontend/src/lib/hanVietCognatesSync.js` | Lib cũ |
| `frontend/src/lib/hanVietSync.js` | Lib cũ |
| `frontend/src/lib/sheetErrors.js` | Lib cũ |
| `frontend/src/lib/sheetExport.js` | Lib cũ |
| `frontend/src/lib/sheetImport.js` | Lib cũ |
| `frontend/src/lib/sheetMergeKeys.js` | Lib cũ |
| `frontend/src/lib/sheetMergePreview.js` | Lib cũ |
| `frontend/src/lib/sheetParsers.js` | Lib cũ |
| `frontend/src/lib/sheetUpdate.js` | Lib cũ |
| `frontend/src/lib/syncConfig.js` | Lib cũ |

### File mới thêm (untracked) — tính năng Hán Characters + cải tiến:
| File | Mục đích |
|------|----------|
| `AGENTS.md` | Hướng dẫn AI agent |
| `test.js` | File test tạm |
| **Backend data:** | |
| `backend/data/char.csv` | Dữ liệu chữ Hán |
| **Backend lib (mới):** | |
| `backend/lib/hanCharHanVietBackfill.js` | Backfill Hán-Việt cho chữ Hán |
| `backend/lib/hanCharJyutpingBackfill.js` | Backfill jyutping cho chữ Hán |
| `backend/lib/hanCharPinyinBackfill.js` | Backfill pinyin cho chữ Hán |
| `backend/lib/hanCharVariantBackfill.js` | Backfill biến thể cho chữ Hán |
| `backend/lib/jyutping.js` | Module jyutping |
| `backend/lib/wordHanRelation.js` | Quan hệ word-Hán character |
| **Backend scripts (mới):** | |
| `backend/scripts/_count_simplified.mjs` | Script đếm chữ giản thể |
| `backend/scripts/_run_migration.js` | Script chạy migration |
| `backend/scripts/_test_pg.js` | Script test PostgreSQL |
| `backend/scripts/_test_sql.js` | Script test SQL |
| `backend/scripts/add-jyutping-column.js` | Script thêm cột jyutping |
| `backend/scripts/backfill-hk-traditional.js` | Backfill HK traditional |
| `backend/scripts/fix-search-key-d.js` | Sửa search key chữ đ |
| `backend/scripts/import-han-characters.js` | Import chữ Hán |
| `backend/scripts/migrate-search-key.js` | Migration search key |
| `backend/scripts/rebuild-han-characters.js` | Rebuild bảng Hán characters |
| **Backend migrations (mới):** | 17 file migration cho `han_characters` table |
| **Frontend components (mới):** | |
| `frontend/src/components/AddHanCharacterModal.jsx` | Modal thêm chữ Hán |
| `frontend/src/components/FontSizeSwitcher.jsx` | Switcher cỡ chữ |
| `frontend/src/components/HanCharacterRow.jsx` | Row hiển thị chữ Hán |
| `frontend/src/components/MissingHanCharsSync.jsx` | Sync chữ Hán thiếu |
| `frontend/src/components/TagInput.jsx` | Input dạng chip/tag |
| **Frontend lib (mới):** | |
| `frontend/src/lib/dataCache.js` | IndexedDB cache |
| `frontend/src/lib/hanCharExtract.js` | Trích xuất chữ Hán |
| `frontend/src/lib/hanCharacterBrowseCache.js` | Cache browse Hán characters |
| `frontend/src/lib/hanCharacterRoutes.js` | Routes cho Hán characters |
| **Frontend pages (mới):** | |
| `frontend/src/pages/ErrorPage.jsx` | Trang lỗi |
| `frontend/src/pages/HanCharacterDetailPage.jsx` | Trang chi tiết chữ Hán |
| `frontend/src/pages/HanCharactersPage.jsx` | Trang danh sách chữ Hán |
| **Frontend store (mới):** | |
| `frontend/src/store/fontSizeStore.js` | Store cỡ chữ |

---

## 4. Kiến trúc chi tiết

### Data flow
```
Frontend (React SPA)
  │
  ├─ appStore.hydrateFromCloud()  ← GET /api/data (full dataset)
  ├─ Optimistic mutations         ← POST/PUT/DELETE /api/words, /api/grammar, ...
  ├─ Local IndexedDB cache        ← dataCache.js (offline fallback)
  └─ Vite proxy /api → backend (dev) hoặc Vercel rewrites (prod)
```

### Auth flow
```
Google OAuth → /auth/google → /auth/google/callback
  → ensureSupabaseUser() upsert vào public.users
  → session cookie (cookie-session, signed)
  → /auth/me trả về user info
```

### Database (Supabase PostgreSQL)
- `public.users` — người dùng
- `public.words` — từ vựng (có search_key, jyutping, pinyin, hán tự, ...)
- `public.grammar` — ngữ pháp
- `public.sentences` — câu/mẫu câu
- `public.lessons` — bài học
- `public.han_characters` — chữ Hán (bảng MỚI, 17 migration files)
- `public.word_han_characters` — bảng nối word ↔ han_character (MỚI)

### API endpoints (chính)
| Method | Path | Mục đích |
|--------|------|----------|
| GET | `/api/data` | Hydrate toàn bộ dataset |
| GET/POST | `/api/words` | Browse / Create word |
| PUT/DELETE | `/api/words/:id` | Update / Delete word |
| GET/POST | `/api/grammar` | Browse / Create grammar |
| PUT/DELETE | `/api/grammar/:id` | Update / Delete grammar |
| GET/POST | `/api/sentences` | Browse / Create sentence |
| PUT/DELETE | `/api/sentences/:id` | Update / Delete sentence |
| GET/POST | `/api/lessons` | Browse / Create lesson |
| PUT/DELETE | `/api/lessons/:id` | Update / Delete lesson |
| GET/POST | `/api/han-characters` | Browse / Create han character |
| PUT/DELETE | `/api/han-characters/:id` | Update / Delete han character |
| POST | `/api/han-characters/backfill/*` | Các endpoint backfill |
| GET | `/api/cedict/lookup` | Tra từ điển CC-CEDICT |

---

## 5. Biến môi trường cần thiết

```
# Frontend
FRONTEND_PORT=5173
FRONTEND_URL=http://localhost:5173
VITE_BACKEND_URL=http://127.0.0.1:3001

# Backend
BACKEND_PORT=3001
BACKEND_URL=http://localhost:3001

# Auth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:5173/auth/google/callback
SESSION_SECRET=change-me-to-a-long-random-string
ADMIN_EMAILS=your@gmail.com

# Cookie
COOKIE_SECURE=false

# Supabase (BẮT BUỘC)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=
```

---

## 6. Kế hoạch di chuyển sang learn-cantonese-app-next

### Bước 1: Khởi tạo thư mục mới
```bash
mkdir learn-cantonese-app-next
cd learn-cantonese-app-next
git init
```

### Bước 2: Sao chép cấu trúc monorepo root
Copy các file root:
- `package.json` — workspace root (deploy scripts)
- `pnpm-lock.yaml` — lock file
- `vercel.json` — Vercel config
- `docker-compose.yml` + `docker-compose.dev.yml`
- `.env.dev.example` + `.env.prod.example`
- `.gitignore`
- `AGENTS.md` — giữ lại cho agent
- `HANDOFF.md` — file này (cập nhật sau khi di chuyển xong)

### Bước 3: Sao chép backend
Copy toàn bộ thư mục `backend/`:
```
backend/
├── package.json
├── pnpm-lock.yaml
├── app.js
├── index.js
├── Dockerfile
├── .dockerignore
├── .gitignore
├── routes/       (auth.js, data.js, cedict.js)
├── middleware/   (auth.js, appAdmin.js)
├── lib/          (TẤT CẢ các file, kể cả file mới untracked)
├── scripts/      (TẤT CẢ các file)
├── data/         (TẤT CẢ các file)
└── supabase/     (config.toml + TẤT CẢ migrations)
```

**LƯU Ý:** KHÔNG copy các file đã bị xóa (listed in git status as `D`):
- `backend/data/chinese-hanviet-cognates.tsv`
- `backend/lib/hanVietCognates.js`
- `backend/lib/hanVietPhienam.js`
- `backend/lib/mergeService.js`
- `backend/lib/sheetFetch.js`
- `backend/lib/sheetMergePreview.js`
- `backend/routes/hanviet.js`

### Bước 4: Sao chép frontend
Copy toàn bộ thư mục `frontend/`:
```
frontend/
├── package.json
├── pnpm-lock.yaml
├── vite.config.js
├── index.html
├── Dockerfile
├── nginx.conf
├── .dockerignore
├── .gitignore
├── public/
└── src/          (TẤT CẢ các file và thư mục con)
```

**LƯU Ý:** KHÔNG copy các file đã bị xóa (listed as `D`):
- `frontend/src/components/HanVietCognatesSyncButton.jsx`
- `frontend/src/components/HanVietSyncButton.jsx`
- `frontend/src/components/SheetExportButton.jsx`
- `frontend/src/components/SheetUpdateButton.jsx`
- `frontend/src/lib/hanVietCharMap.js`
- `frontend/src/lib/hanVietCognatesSync.js`
- `frontend/src/lib/hanVietSync.js`
- `frontend/src/lib/sheetErrors.js`
- `frontend/src/lib/sheetExport.js`
- `frontend/src/lib/sheetImport.js`
- `frontend/src/lib/sheetMergeKeys.js`
- `frontend/src/lib/sheetMergePreview.js`
- `frontend/src/lib/sheetParsers.js`
- `frontend/src/lib/sheetUpdate.js`
- `frontend/src/lib/syncConfig.js`

### Bước 5: Cài đặt dependencies
```bash
cd learn-cantonese-app-next
pnpm install
```

### Bước 6: Kiểm tra
```bash
# Backend dev server
cd backend && pnpm dev

# Frontend dev server (cửa sổ khác)
cd frontend && pnpm dev

# Frontend build test
cd frontend && pnpm build

# Frontend lint
cd frontend && pnpm lint
```

### Bước 7: Dọn dẹp
- Xóa `test.js` khỏi thư mục mới (file tạm)
- Cập nhật HANDOFF.md nếu cần
- Commit tất cả vào git repository mới

---

## 7. Danh sách dependencies

### Backend (Node 22, ESM)
```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.110.0",
    "cc-cedict": "1.1.1",
    "cookie-parser": "^1.4.7",
    "cookie-session": "^2.1.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.7",
    "express": "^4.21.2",
    "opencc-js": "1.0.5",
    "pg": "^8.22.0",
    "pinyin-pro": "3.27.0",
    "to-jyutping": "^3.1.1"
  }
}
```

### Frontend (React 19, Vite 8, ESM)
```json
{
  "dependencies": {
    "clsx": "^2.1.1",
    "opencc-js": "1.0.5",
    "pinyin-pro": "3.27.0",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "react-router-dom": "^7.18.1",
    "tailwind-merge": "^3.3.1",
    "zustand": "^5.0.14"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.1.11",
    "@vitejs/plugin-react": "^6.0.3",
    "oxlint": "^1.71.0",
    "tailwindcss": "^4.1.11",
    "vite": "^8.1.1"
  }
}
```

### Root (deploy)
```json
{
  "devDependencies": {
    "vercel": "^55.0.0"
  }
}
```

---

## 8. Các lưu ý quan trọng

### 8.1 Coding conventions
- **pnpm only** — `packageManager` field pinned to `pnpm@9.15.9`
- **ESM** — `"type": "module"` trong tất cả `package.json`
- **No TypeScript** — thuần JavaScript + JSDoc
- **`cn()` là utility classname DUY NHẤT** — kết hợp clsx + tailwind-merge, import từ `'../lib/cn.js'`
- **CSS theme** — dùng `--color-*` CSS variables trong `index.css`, Tailwind map qua `@theme` block
- **Optimistic mutations** — frontend store cập nhật local state trước, gọi API sau, re-hydrate nếu fail

### 8.2 Những thứ KHÔNG có trong dự án
- Không có test suite (không có Jest, Vitest, hay bất kỳ test framework nào)
- Không có CI/CD pipeline
- Không có TypeScript
- Không có JWT — auth dùng session cookie

### 8.3 Vercel deployment
- `backend/app.js` là entrypoint serverless (export `app`, không gọi `listen()`)
- `backend/index.js` chỉ dùng cho local dev
- Vercel rewrites `/api/*` và `/auth/*` → backend service
- Frontend build ra `frontend/dist/`

### 8.4 Docker
- Dev: `docker compose -f docker-compose.dev.yml up` — hot-reload, volumes mount
- Prod: `docker compose up` — nginx serve frontend build, backend healthcheck

### 8.5 Migration files
Có **40+ file migration** trong `backend/supabase/migrations/`. Tất cả đều cần được giữ lại. Các file mới (untracked) từ 20260713... đến 20260715... liên quan đến bảng `han_characters`.

### 8.6 Static data files
```
backend/data/
├── cccanto-webdist.txt        # CC-Canto wordlist
├── char.csv                   # Character CSV data (MỚI)
├── chinese-hanviet-non-cognates.tsv
└── phienam.txt                # Phiên âm Hán-Việt
```

---

## 9. Câu lệnh hữu ích cho agent tiếp theo

```bash
# Kiểm tra workspace sau khi copy
cd D:\Code\learn-cantonese-app-next
git status

# Cài đặt
pnpm install

# Chạy backend
cd backend && pnpm dev

# Chạy frontend (terminal khác)
cd frontend && pnpm dev

# Build & lint
cd frontend && pnpm build && pnpm lint

# Deploy (cần Vercel CLI đã login)
pnpm deploy        # preview
pnpm deploy:prod   # production
```

---

## 10. Trạng thái bàn giao

- [x] Tổng hợp kiến trúc dự án
- [x] Liệt kê cấu trúc thư mục đầy đủ
- [x] Ghi nhận trạng thái git (124 modified, 50 untracked)
- [x] Đánh dấu file đã xóa (cần loại trừ khi copy)
- [x] Đánh dấu file mới thêm (untracked, cần bao gồm)
- [x] Liệt kê dependencies
- [x] Kế hoạch di chuyển 7 bước
- [ ] Thực hiện di chuyển thực tế (dành cho agent tiếp theo)
- [ ] Cài đặt và kiểm tra sau di chuyển
- [ ] Commit vào repo mới

---

**Ghi chú cho agent tiếp theo:** File này chứa tất cả thông tin cần thiết để thực hiện việc di chuyển. Hãy đọc kỹ phần "File đã xóa" và "File mới thêm" để đảm bảo copy đúng — không copy file đã xóa, nhưng phải copy tất cả file mới (untracked). Sau khi copy xong, chạy `pnpm install` từ root, sau đó kiểm tra `pnpm dev` cho cả frontend và backend.
