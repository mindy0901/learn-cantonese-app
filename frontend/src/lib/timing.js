/**
 * Rule DEBOUNCE toàn app (2026-08-17) — THỐNG NHẤT 300ms.
 * Dùng cho mọi search/filter/dup-check khi gõ (tránh lọc lại dữ liệu lớn mỗi
 * lần gõ → lag). Không hardcode số khác; import hằng số này.
 */
export const SEARCH_DEBOUNCE_MS = 300;
