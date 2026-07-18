# AGENTS.md — Learn Cantonese App

## Build / Test / Lint

```bash
# Install dependencies (all workspaces)
pnpm install

# Frontend dev server (http://localhost:5173, proxies /api & /auth to backend)
cd frontend && pnpm dev

# Backend dev server (http://localhost:3001)
cd backend && pnpm dev

# Frontend lint
cd frontend && pnpm lint          # oxlint

# Frontend production build
cd frontend && pnpm build         # outputs to frontend/dist/

# Run via Docker Compose (dev)
docker compose -f docker-compose.dev.yml up

# Deploy to Vercel
pnpm deploy                       # preview
pnpm deploy:prod                  # production
```

There is no test suite. Linting is oxlint on the frontend only.

## Architecture

**learn-cantonese-app** is a fullstack Cantonese learning tool — word bank, grammar bank, sentence patterns, lessons, flashcards, and Hán character lookup. Data lives in Supabase (PostgreSQL); the backend exposes a REST API; the frontend is a React SPA that hydrates once from the cloud then works local-first with optimistic mutations.

### Layers

```
frontend (React SPA, Vite, Tailwind v4)
  │
  ├─ /api/*  ──proxy──▶  backend (Express, cookie-session)
  ├─ /auth/* ──proxy──▶       │
  │                            ├─ Supabase (PostgreSQL, via @supabase/supabase-js)
  │                            ├─ Google OAuth
  │                            └─ CC-CEDICT (bundled dictionary)
  │
  └─ Vercel rewrites in production route /api/* → backend serverless function
```

### Frontend (React 19 + Vite + Tailwind CSS v4)

| Directory | Purpose |
|-----------|---------|
| `pages/` | Route-level page components (WordBankPage, GrammarBankPage, etc.) |
| `components/` | Shared UI: modals, rows, fields, TagInput, FlashcardDeck, etc. |
| `store/` | Zustand stores: `appStore` (all domain data), `authStore`, `localeStore`, `prefsStore`, `uiStore`, `fontSizeStore`, `lessonDraftStore` |
| `lib/` | Pure utilities: API client, caching, filters, search, display helpers |
| `i18n/` | Locale system (vi/en) via `useLocale()` hook, locale files in `locales/` |
| `types/` | Domain model factories: `emptyWord()`, `emptyGrammar()`, etc. |

**State flow**: `appStore.hydrateFromCloud()` fetches the full dataset (words, grammar, sentences, lessons, han-characters) on first mount via `GET /api/data`. The store normalizes everything into maps keyed by `id`. All mutations go through the store, which calls the API then patches local state. A local `dataCache` (IndexedDB) serves as offline fallback.

**Routing**: React Router v7, single `<Layout>` with nested routes. `AuthGate` ensures auth is initialized; `CloudGate` gates all data-dependent routes behind the hydration promise.

### Backend (Express, Node 22)

| File | Purpose |
|------|---------|
| `app.js` | Express app setup: CORS, cookie-session, routes, error handler |
| `index.js` | Dev entry point: `app.listen()`. Not used on Vercel (serverless). |
| `routes/auth.js` | Google OAuth flow, `/auth/status`, `/auth/me`, `/auth/logout` |
| `routes/data.js` | Full CRUD for words, grammar, sentences, lessons, han-characters; backfill endpoints |
| `routes/cedict.js` | CC-CEDICT English→Chinese lookup |
| `middleware/auth.js` | `requireAuth` guard, `getUserId` helper |
| `middleware/appAdmin.js` | Admin-only guard (emails in `ADMIN_EMAILS` env var) |
| `lib/supabaseAdmin.js` | Supabase client singleton with service-role key |
| `lib/dataService.js` | Row ↔ domain object transforms, DB query builders |
| `lib/wordQuery.js` | Paginated word browse with filtering, sorting, full-text search |

**Auth model**: Google OAuth → `ensureSupabaseUser()` upserts into `public.users` → session stored in signed cookie (`cookie-session`). No JWT; session is self-contained. On Vercel serverless, cookie-session survives cold starts.

## Key Files & Directories

| Path | Role |
|------|------|
| `vercel.json` | Vercel monorepo deploy: services (frontend+Vite, backend+Express) and rewrites |
| `docker-compose.dev.yml` | Dev environment: backend+frontend with hot-reload, `.env.dev` |
| `docker-compose.yml` | Prod-like Docker: nginx serves built frontend, backend health-checked |
| `frontend/vite.config.js` | Vite dev server: proxies `/api` & `/auth` to backend, Tailwind plugin |
| `frontend/src/index.css` | Tailwind v4 `@import "tailwindcss"`, CSS custom properties theme (light+dark via `[data-theme="dark"]`), `color-scheme` for native form controls |
| `frontend/src/lib/api.js` | Typed API client: `api.browseWords()`, `api.createWord()`, etc. |
| `frontend/src/lib/cn.js` | `cn()` = `twMerge(clsx())` — the one-and-only classname utility |
| `frontend/src/store/appStore.js` | Central data store (~1000 lines): hydration, CRUD, caching |
| `backend/supabase/migrations/` | Timestamp-ordered SQL migrations (40+ files) |
| `backend/data/` | Static data: CC-Canto wordlist, character CSV, Hán-Việt readings |
| `backend/scripts/` | One-off data import/backfill scripts |
| `backend/.env.dev.example` | Template for required env vars (Supabase keys, Google OAuth, session secret) |

## Coding Conventions

- **pnpm** only. `packageManager` field is pinned.
- **ESM** throughout (`"type": "module"`).
- **No TypeScript** — pure JavaScript with JSDoc annotations where helpful.
- **React patterns**: functional components, hooks, Zustand for state. Use `useShallow` from `zustand/react/shallow` for selectors returning objects.
- **Styling**: Tailwind utility classes composed via `cn()` (clsx + tailwind-merge). Reusable styles extracted to `buttonStyles.js` / `controlStyles.js` as classname-returning functions.
- **I18n**: `useLocale()` hook returns `{ t }` — all user-facing strings go through `t.someKey`. Locale files in `frontend/src/i18n/locales/`.
- **Domain objects**: factory functions like `emptyWord(partial)` create objects with sensible defaults + `crypto.randomUUID()` id.
- **Backend errors**: thrown errors with `.status` property are caught by the Express error handler and returned as JSON. `next(err)` pattern.
- **Logging**: `backend/lib/actionLog.js` wraps `console` with timestamps. Frontend has its own mirror in `frontend/src/lib/actionLog.js`.
- **Mutations are optimistic**: the frontend store updates local state immediately, then calls the API. On failure it re-hydrates from cloud.

## Git Workflow

- Single `main` branch, direct pushes.
- Commit messages: lowercase, descriptive ("fix bugs and update log be fe", "fix auth", "Initial commit: ...").

## CI/CD

- No CI pipeline configured. Deployment is manual via `pnpm deploy` (Vercel CLI).
- Vercel runs `pnpm build` for frontend and treats `backend/app.js` as a serverless function entrypoint.

## Tips for AI Agents

- **CSS theme variables** are defined in `frontend/src/index.css` under `:root` (light) and `[data-theme="dark"]`. Use `--color-*` variables via Tailwind's `@theme` block — they map to Tailwind utilities like `bg-surface`, `text-text-h`, `border-border`, etc.
- **TagInput** is the chip-style multi-value input used for jyutping, pinyin, and Hán-Việt fields. It accepts comma/separator-delimited strings and optional per-tag dropdown options.
- **`cn()` is the only classname utility** — never import `clsx` or `twMerge` directly. Import from `'../lib/cn.js'`.
- **The data store is large** (`appStore.js` ~1000 lines). Most domain logic for mutations lives there, not in components. When adding a new entity type, follow the pattern: factory in `types/`, transform in `lib/dataTransforms.js`, API methods in `lib/api.js`, store actions in `store/appStore.js`.
- **Backend routes** are all in `routes/data.js` (~1000 lines). New endpoints go there. Row ↔ domain transforms are in `lib/dataService.js`.
- **Vercel serverless caveat**: `backend/app.js` exports `app` (no `listen()`). The `index.js` entry is for local dev only. In-memory state (like the warmed CC-CEDICT index) is per-instance and may be cold.
- **Environment variables** are documented in `.env.dev.example` / `.env.prod.example`. `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are mandatory; `GOOGLE_CLIENT_ID`/`SECRET` for OAuth; `SESSION_SECRET` for cookie signing; `ADMIN_EMAILS` for admin access.
