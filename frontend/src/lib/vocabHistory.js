// Lịch sử các từ vựng đã xem trong phiên (session) — cho nút "Quay lại" ở footer detail.
// Khi user bấm "Từ tiếp theo" rồi muốn quay về từ vừa xem trước đó. Lưu sessionStorage + memory cache
// (F5 trong cùng tab vẫn giữ; mở tab mới sẽ trống). (2026-09-02)
const STORAGE_KEY = "cantonese-vocab-history";
const MAX_ENTRIES = 50;

/** @type {string[] | null} */
let memoryCache = null;

function load() {
    if (memoryCache) return memoryCache;
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        memoryCache = parsed;
        return parsed;
    } catch {
        return [];
    }
}

function save(list) {
    memoryCache = list;
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
        // ignore quota / private mode
    }
}

/** Push hán tự vừa mở vào lịch sử (dedupe liên tiếp — không push trùng 2 lần liền), giới hạn MAX_ENTRIES. */
export function pushVocabHistory(han) {
    if (!han) return load();
    const list = load();
    if (list[list.length - 1] === han) return list;
    const next = [...list, han].slice(-MAX_ENTRIES);
    save(next);
    return next;
}

/** Hán tự đứng TRƯỚC entry hiện tại (từ vừa xem trước đó) — KHÔNG đổi lịch sử. null nếu không có. */
export function previousVocabHistory() {
    const list = load();
    if (list.length < 2) return null;
    return list[list.length - 2];
}

/** Quay lại: trả hán tự trước đó và bỏ entry hiện tại (giữ entry trước làm cuối — bấm tiếp vẫn lùi được). */
export function backVocabHistory() {
    const list = load();
    if (list.length < 2) return null;
    const prev = list[list.length - 2];
    save(list.slice(0, -1));
    return prev;
}

export function clearVocabHistory() {
    memoryCache = [];
    try {
        sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        // ignore
    }
}
