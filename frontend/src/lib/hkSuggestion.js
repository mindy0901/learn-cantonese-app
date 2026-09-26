import { useEffect, useState } from "react";
import { api } from "./api.js";

/**
 * Gợi ý giản thể Mandarin cho 1 form HK — ON-DEMAND theo từng từ (2026-09-02).
 *
 * Thay cho cơ chế precompute hkSuggestionMap (đã xóa ở backend + store). Khi click/xem
 * 1 vocab Cantonese, component gọi hook này → fetch /api/hanzi/simplified-suggestion với
 * đúng form HK của vocab đó → trả gợi ý + trạng thái loading để UI hiện skeleton.
 *
 * Cache theo form HK (module-level): nhiều nơi trên CÙNG trang (VocabularyDetailPage +
 * VocabularyDetailContent + WordHanRomanBlock) cùng xem 1 vocab → chỉ 1 API call.
 */

const cache = new Map(); // key = form HK (trim) → Promise<response>

/**
 * Cache lưu CẢ response đã resolve (không chỉ promise) — để hook init/return đồng bộ khi
 * quay lại từ đã tra (không giật skeleton).
 */
const resolvedCache = new Map(); // key → response (object | null khi not-found/error)

export function fetchHkSuggestion(hk) {
    const key = String(hk ?? "").trim();
    if (!key) return Promise.resolve({ found: false, simplified: "" });
    if (cache.has(key)) return cache.get(key);
    const p = api
        .hanziSimplifiedSuggestion(key)
        .catch(() => ({ found: false, simplified: "" }))
        .then((res) => {
            resolvedCache.set(key, res);
            return res;
        });
    cache.set(key, p);
    return p;
}

/** Response đã resolve của 1 form HK (nếu từ này từng tra trong session) — đồng bộ, không fetch. */
export function peekHkSuggestion(hk) {
    const key = String(hk ?? "").trim();
    if (!key) return null;
    return resolvedCache.get(key) ?? null;
}

/** Fetch nhanh (< delay) → KHÔNG hiện skeleton (hết flick khi lướt tới từ Cantonese KHÔNG có
 *  cột Mandarin: trước đây skeleton 2 cột hiện rồi sập về 1 cột). Chỉ fetch chậm (mạng lag) mới
 *  bật skeleton sau delay để vẫn có phản hồi "đang tải". (2026-09-02) */
const SKELETON_DELAY_MS = 120;

/** @returns {{ suggestion: object|null, loading: boolean, skeleton: boolean }}
 *  suggestion = response /api/hanzi/simplified-suggestion (hoặc null khi chưa có gợi ý).
 *  skeleton   = loading kéo dài > SKELETON_DELAY_MS (dùng để hiện Skeleton, tránh flick).
 *
 *  ⚠️ 2026-09-02: fix flicker khi CHUYỂN TỪ MỚI — hook lưu kèm `key` của suggestion; nếu key
 *  vừa đổi (từ mới) mà fetch chưa xong → KHÔNG trả suggestion cũ của từ trước (trước đây giữ
 *  suggestion cũ khi chỉ set loading → cột Mandarin hiện DATA SAI của từ trước trong lúc chờ). */
export function useHkSuggestion(hk) {
    const key = String(hk ?? "").trim();
    // Khởi tạo từ cache đã resolve (nếu từ này từng tra) → mount không giật skeleton.
    const [data, setData] = useState(() => {
        const cached = resolvedCache.get(key);
        return {
            key,
            suggestion: cached?.found ? cached : null,
            loading: !cached && Boolean(key),
        };
    });
    const [showSkeleton, setShowSkeleton] = useState(false);

    useEffect(() => {
        let active = true;
        let timer = null;
        const stopTimer = () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        };
        setShowSkeleton(false);
        stopTimer();
        // Reset ngay khi key đổi — xóa suggestion cũ, bật loading.
        setData((d) => ({ key, suggestion: null, loading: Boolean(key) }));
        if (!key) return undefined;
        // Nếu từ đã tra → trả ngay (không chờ fetch) để không giật skeleton.
        const cached = resolvedCache.get(key);
        if (cached !== undefined) {
            setData({ key, suggestion: cached?.found ? cached : null, loading: false });
            return undefined;
        }
        // Chưa có kết quả: bật skeleton CHỈ khi fetch lâu (sau delay).
        timer = setTimeout(() => {
            if (active) setShowSkeleton(true);
        }, SKELETON_DELAY_MS);
        fetchHkSuggestion(key).then((res) => {
            if (!active) return;
            stopTimer();
            setShowSkeleton(false);
            setData({ key, suggestion: res?.found ? res : null, loading: false });
        });
        return () => {
            active = false;
            stopTimer();
        };
    }, [key]);

    // Key vừa đổi mà effect chưa reset → KHÔNG trả data cũ; coi như đang load.
    if (data.key !== key) {
        return { suggestion: null, loading: Boolean(key), skeleton: false };
    }
    return { suggestion: data.suggestion, loading: data.loading, skeleton: showSkeleton };
}
