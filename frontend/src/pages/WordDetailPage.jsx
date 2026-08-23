import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { WordDetailContent } from "../components/WordDetailContent.jsx";
import {
    useAppActions,
    useVocabularies,
    useMandarinVocabularies,
    useHkSuggestionMap,
    useLanguage,
} from "../store/appStore.js";
import { useLocale } from "../store/localeStore.js";
import { useIsAdmin, useIsSignedIn } from "../store/authStore.js";
import { Button } from "../components/shadcn/button.jsx";
import { vocabularyDetailPath, vocabularyBankPath } from "../lib/wordRoutes.js";
import { comparePinyinTone } from "../lib/pinyinSort.js";
import { loadWordBankReturnState } from "../lib/wordBankReturn.js";

/**
 * Flatten every reading of a han into display entries, split by `type`.
 * Preferred source is the merged `romanization` array on the vocab; when
 * missing (legacy/unsynced rows), derives typed entries from flat fields.
 */
function flattenRomanizations(vocabularies) {
    const out = [];
    for (const v of vocabularies) {
        const roms = Array.isArray(v.romanization) && v.romanization.length > 0 ? v.romanization : null;
        if (roms) {
            for (const r of roms) {
                out.push({
                    key: `${v.id}:${r.id ?? `${r.pinyin ?? ""}|${r.jyutping ?? ""}`}`,
                    vocabId: v.id,
                    romanizationId: r.id,
                    type: r.type === "jyutping" ? "jyutping" : "pinyin",
                    pinyin: r.pinyin ?? "",
                    jyutping: r.jyutping ?? "",
                    sinoVietnamese: r.sinoVietnamese ?? "",
                    meanings: r.meanings ?? [],
                });
            }
        } else {
            const py = v.pinyin ?? "";
            const jp = v.jyutping ?? "";
            if (py) {
                out.push({
                    key: `${v.id}:py`,
                    vocabId: v.id,
                    type: "pinyin",
                    pinyin: py,
                    jyutping: "",
                    sinoVietnamese: v.sinoVietnamese ?? "",
                    meanings: v.meanings ?? [],
                });
            }
            if (jp) {
                out.push({
                    key: `${v.id}:jp`,
                    vocabId: v.id,
                    type: "jyutping",
                    pinyin: "",
                    jyutping: jp,
                    sinoVietnamese: v.sinoVietnamese ?? "",
                    meanings: v.meanings ?? [],
                });
            }
        }
    }
    // Dedupe: cùng type + cùng phiên âm (pinyin/jyutping) là MỘT reading, dù data
    // bị lặp ở nhiều variant rows (legacy/unsynced) → giữ entry đầu, bỏ trùng.
    const seen = new Set();
    const deduped = out.filter((r) => {
        const norm = r.type === "jyutping" ? (r.jyutping ?? "").toLowerCase() : (r.pinyin ?? "").toLowerCase();
        const key = `${r.type}:${norm}`;
        if (!norm || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    // Sort by pinyin tone (yī, yí, yǐ, yì → thanh 1, 2, 3, 4), tie-break by jyutping.
    deduped.sort((a, b) => {
        const c = comparePinyinTone(a.pinyin, b.pinyin);
        if (c !== 0) return c;
        return comparePinyinTone(a.jyutping, b.jyutping);
    });
    return deduped;
}

export function WordDetailPage() {
    const { han: hanParam } = useParams();
    const navigate = useNavigate();
    const vocabularies = useVocabularies();
    const mandarinVocabularies = useMandarinVocabularies();
    const language = useLanguage();
    const { editVocabulary, removeVocabulary } = useAppActions();
    const { t } = useLocale();
    const isAdmin = useIsAdmin();

    // The URL carries the han text (traditional or simplified), like Hanzii.
    const han = decodeURIComponent(hanParam ?? "").trim();

    // All vocabularies matching this han (after the merge: normally one row,
    // but keep the loop for safety with legacy/unsynced data).
    const variants = useMemo(() => {
        if (!han) return [];
        const norm = han.replace(/\s+/g, "");
        return vocabularies.filter((v) => {
            const trad = (v.hanTraditional ?? "").replace(/\s+/g, "");
            const simp = (v.hanSimplified ?? "").replace(/\s+/g, "");
            const hk = (v.hanHongKong ?? "").replace(/\s+/g, "");
            return trad === norm || simp === norm || hk === norm;
        });
    }, [vocabularies, han]);

    // Cantonese mode: detail chia 2 cột Quảng | Quan thoại. Cột Mandarin lấy từ MANDARIN BANK
    // bằng cách tra theo `simplified` (từ hkSuggestionMap — precompute lúc load, chuẩn OpenCC)
    // → đổ data store mandarin vào cột. Đơn giản + chính xác hơn cách cũ (đoán keys simp/trad). (2026-08-21)
    const hkSuggestionMap = useHkSuggestionMap();
    const mandarinVariants = useMemo(() => {
        if (language !== "cantonese") return [];
        const norm = (s) => String(s ?? "").replace(/\s+/g, "");
        // simplified từ map gợi ý (key = form HK của vocab Quảng hiện tại).
        const hkForm = (variants[0]?.hanHongKong ?? "").trim();
        const simplified = norm(hkSuggestionMap?.[hkForm]?.simplified ?? "");
        if (!simplified) return [];
        return mandarinVocabularies.filter((v) => norm(v.hanSimplified) === simplified);
    }, [language, mandarinVocabularies, variants, hkSuggestionMap]);

    // Gộp: variants (Quảng) + mandarinVariants (Quan thoại) → readings pinyin + jyutping cùng lúc.
    // ⚠️ 2026-08-22: merge mandarin DỰA TRÊN HANZI (hkSuggestionMap: hanHongKong → simplified),
    // KHÔNG phụ thuộc readings của từ Cantonese (bỏ gate hasCantoneseReading — rule bịa, sai).
    const allVariants = useMemo(
        () => (mandarinVariants.length ? [...variants, ...mandarinVariants] : variants),
        [variants, mandarinVariants],
    );

    // Base vocab = the DB row(s); pronunciation list = flattened readings.
    const baseVocabulary = allVariants[0];
    const romanizations = useMemo(() => flattenRomanizations(allVariants), [allVariants]);

    // Tách readings thành 2 hàng: pinyin (Mandarin) + jyutping (Cantonese).
    const pinyinRoms = useMemo(() => romanizations.filter((r) => r.type === "pinyin"), [romanizations]);
    const jyutpingRoms = useMemo(() => romanizations.filter((r) => r.type === "jyutping"), [romanizations]);

    // Active reading indices (local state, URL stays as the han text).
    const [activePyIdx, setActivePyIdx] = useState(0);
    const [activeJpIdx, setActiveJpIdx] = useState(0);
    useEffect(() => {
        setActivePyIdx(0);
        setActiveJpIdx(0);
    }, [han]);

    const effPyIdx = activePyIdx < pinyinRoms.length ? activePyIdx : 0;
    const effJpIdx = activeJpIdx < jyutpingRoms.length ? activeJpIdx : 0;
    const activePinyin = pinyinRoms[effPyIdx] ?? null;
    const activeJyutping = jyutpingRoms[effJpIdx] ?? null;

    // Display vocab: base row overlaid with active reading fields. Meaning
    // của từng reading đi theo reading đó (pinyinReading / jyutpingReading).
    // Giữ `romanization` gốc (entry có `id`/`type`) để edit flow build đúng draft.
    const vocabulary = useMemo(() => {
        if (!baseVocabulary) return baseVocabulary;
        // Mandarin merge: cột Mandarin trong hero lấy han (simp/trad) từ TỪ MANDARIN — nếu chỉ
        // dùng base Cantonese (vốn chỉ có hanHongKong, không hanSimplified) thì cột Simplified trống
        // dù đã tìm ra từ gợi ý mandarin. (2026-08-22)
        const mandarinVariant = mandarinVariants[0] ?? null;
        return {
            ...baseVocabulary,
            hanSimplified: mandarinVariant?.hanSimplified ?? baseVocabulary.hanSimplified,
            hanTraditional: mandarinVariant?.hanTraditional ?? baseVocabulary.hanTraditional,
            pinyin: activePinyin?.pinyin || undefined,
            jyutping: activeJyutping?.jyutping || undefined,
            sinoVietnamese: activePinyin?.sinoVietnamese || activeJyutping?.sinoVietnamese || undefined,
            pinyinReading: activePinyin,
            jyutpingReading: activeJyutping,
        };
    }, [baseVocabulary, activePinyin, activeJyutping, mandarinVariants]);

    // "Từ tiếp theo" đi theo thứ tự BẢNG hiện tại (lưu khi bấm từ từ bảng qua saveWordBankReturnState),
    // lấy từ kế tiếp trong danh sách đã filter+sort (wrap vòng). Fallback: random (khi mở từ nơi khác).
    const handleNextRandom = useCallback(() => {
        const currentId = baseVocabulary?.id ? String(baseVocabulary.id) : null;
        const orderIds = loadWordBankReturnState()?.orderIds;
        if (currentId && Array.isArray(orderIds) && orderIds.length > 1) {
            const idx = orderIds.indexOf(currentId);
            if (idx >= 0) {
                const nextId = orderIds[(idx + 1) % orderIds.length];
                const next = vocabularies.find((v) => String(v.id) === nextId);
                if (next) {
                    navigate(vocabularyDetailPath(next.hanTraditional || next.hanSimplified || next.hanHongKong));
                    return;
                }
            }
        }
        const pool = vocabularies.filter(
            (v) => ((v.hanTraditional ?? "") + (v.hanSimplified ?? "")).replace(/\s+/g, "") !== han.replace(/\s+/g, ""),
        );
        if (pool.length === 0) return;
        const next = pool[Math.floor(Math.random() * pool.length)];
        navigate(vocabularyDetailPath(next.hanTraditional || next.hanSimplified || next.hanHongKong));
    }, [vocabularies, han, navigate, baseVocabulary?.id]);

    const handleDelete = useCallback(() => {
        if (!vocabulary) return;
        removeVocabulary(vocabulary.id);
        navigate(vocabularyBankPath());
    }, [vocabulary, removeVocabulary, navigate]);

    // Header & Footer cố định — portal vào 2 vùng này, nằm TRÊN/DƯỚI vùng scroll.
    const headerRef = useRef(null);
    const footerRef = useRef(null);

    // Chọn cách đọc: bấm chip trong thẻ để đổi reading đang active (Pinyin / Jyutping).
    const selectPinyin = useCallback(
        (key) => {
            const idx = pinyinRoms.findIndex((r) => r.key === key);
            if (idx >= 0) setActivePyIdx(idx);
        },
        [pinyinRoms],
    );
    const selectJyutping = useCallback(
        (key) => {
            const idx = jyutpingRoms.findIndex((r) => r.key === key);
            if (idx >= 0) setActiveJpIdx(idx);
        },
        [jyutpingRoms],
    );

    if (!vocabulary) {
        return (
            <main className="flex-1 w-full max-w-360 mx-auto px-4 py-8 pb-12">
                <div className="text-center py-12 px-6 text-muted-foreground flex flex-col items-center gap-4">
                    <p>{t.wordDetail.notFound}</p>
                    <Button nativeButton={false} render={<Link to={vocabularyBankPath()} />}>
                        {t.wordDetail.backToWordBank}
                    </Button>
                </div>
            </main>
        );
    }

    return (
        <main className="flex h-[calc(100svh-62px)] w-full max-w-360 mx-auto flex-col overflow-hidden px-4 py-8 pb-12">
            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-card shadow-sm">
                <div ref={headerRef} className="shrink-0 border-b border-border/60 px-4 py-2 sm:px-8" />
                <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
                    <div className="flex w-full min-w-0 flex-1 flex-col px-4 py-6 sm:px-8 sm:py-8">
                        <WordDetailContent
                            key={vocabulary.id}
                            vocabulary={vocabulary}
                            canEdit={isAdmin}
                            onSave={isAdmin ? editVocabulary : undefined}
                            onDelete={isAdmin ? handleDelete : undefined}
                            onNextRandom={vocabularies.length > 1 ? handleNextRandom : undefined}
                            activePinyinId={activePinyin?.romanizationId}
                            activeJyutpingId={activeJyutping?.romanizationId}
                            pinyinReadings={pinyinRoms}
                            jyutpingReadings={jyutpingRoms}
                            activePinyinKey={activePinyin?.key}
                            activeJyutpingKey={activeJyutping?.key}
                            onSelectPinyin={selectPinyin}
                            onSelectJyutping={selectJyutping}
                            headerRef={headerRef}
                            footerRef={footerRef}
                        />
                    </div>
                </div>
                <div ref={footerRef} className="shrink-0 border-t border-border/60 px-4 sm:px-8" />
            </section>
        </main>
    );
}
