/** Items per page in bank lists and pickers. */
export const PAGE_SIZE = 10;

/** Word Bank table: prefetch this many pages ahead of the current page. */
export const WORD_BROWSE_PREFETCH_PAGES = 5;

/** Page size when bulk-fetching words (flashcard, export). */
export const WORD_FETCH_PAGE_SIZE = 50;

/** Delay after typing before local search runs (ms). */
export const SEARCH_DEBOUNCE_MS = 600;

/** Quick-add suggestions shown while typing. */
export const MAX_SUGGESTIONS = 8;

/** Han lookup: results shown per page. */
export const LOOKUP_PAGE_SIZE = 5;

/** Han lookup: server page size when fetching all matches. */
export const LOOKUP_FETCH_PAGE_SIZE = 50;

/** Han lookup: max matches loaded before client pagination. */
export const LOOKUP_MAX_TOTAL = 500;

/** CC-CEDICT dictionary: results shown per page. */
export const CEDICT_PAGE_SIZE = 5;

/** CC-CEDICT dictionary: max matches fetched. */
export const CEDICT_MAX_RESULTS = 30;
