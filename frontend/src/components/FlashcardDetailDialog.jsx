import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "./shadcn/dialog.jsx";
import { VocabularyDetailContent } from "./VocabularyDetailContent.jsx";
import { useAppActions } from "../store/appStore.js";
import { useIsAdmin } from "../store/authStore.js";
import { cn } from "../lib/cn.js";

/**
 * ⚠️ 2026-09-01: Detail thẻ flashcard hiển thị trong shadcn Dialog.
 * REUSE trực tiếp `VocabularyDetailContent` (component của trang detail) nên hiển thị ĐẦY ĐỦ
 * như trang detail: hero hán tự, toggle chip phiên âm, nghĩa đánh số, ví dụ, link từ điển,
 * và CÓ THỂ EDIT (canEdit + onSave) với đầy đủ button (Edit/Delete/Cancel/Save/Full Sync).
 * Wire prop giống VocabularyDetailPage (flatten readings theo type, active idx local) — chỉ
 * onNextRandom/onDelete được nối vào deck session (FlashcardDeck).
 */
function flattenReadings(vocab) {
    const roms = Array.isArray(vocab?.romanization) && vocab.romanization.length > 0 ? vocab.romanization : null;
    const out = [];
    if (roms) {
        for (const r of roms) {
            out.push({
                key: r.id ?? `${r.pinyin ?? ""}|${r.jyutping ?? ""}`,
                vocabId: vocab.id,
                romanizationId: r.id,
                type: r.type === "jyutping" ? "jyutping" : "pinyin",
                pinyin: r.pinyin ?? "",
                jyutping: r.jyutping ?? "",
                sinoVietnamese: r.sinoVietnamese ?? "",
                meanings: r.meanings ?? [],
            });
        }
    } else {
        // Legacy flat (OCR/agent): dựng entry từ field phẳng.
        const py = vocab.pinyin ?? "";
        const jp = vocab.jyutping ?? "";
        const sino = vocab.sinoVietnamese ?? "";
        if (py) {
            out.push({
                key: "py",
                vocabId: vocab.id,
                type: "pinyin",
                pinyin: py,
                jyutping: "",
                sinoVietnamese: sino,
                meanings: vocab.meanings ?? [],
            });
        }
        if (jp) {
            out.push({
                key: "jp",
                vocabId: vocab.id,
                type: "jyutping",
                pinyin: "",
                jyutping: jp,
                sinoVietnamese: sino,
                meanings: vocab.meanings ?? [],
            });
        }
    }
    return out;
}

export function FlashcardDetailDialog({ vocab, open, onOpenChange, onDeleteVocabulary, startEditing = false }) {
    const isAdmin = useIsAdmin();
    const { editVocabulary, removeVocabulary } = useAppActions();
    // ⚠️ 2026-09-01: header/footer ref giống VocabularyDetailPage — portal headerBar/actionBar của
    // VocabularyDetailContent vào 2 vùng này, kèm line ngăn cách (border-b / border-t) như trang detail.
    const headerRef = useRef(null);
    const footerRef = useRef(null);
    const readings = useMemo(() => (vocab ? flattenReadings(vocab) : []), [vocab]);
    const pinyinRoms = readings.filter((r) => r.type === "pinyin");
    const jyutpingRoms = readings.filter((r) => r.type === "jyutping");

    const [activePyIdx, setActivePyIdx] = useState(0);
    const [activeJpIdx, setActiveJpIdx] = useState(0);
    useEffect(() => {
        setActivePyIdx(0);
        setActiveJpIdx(0);
    }, [vocab?.id]);

    const effPy = activePyIdx < pinyinRoms.length ? activePyIdx : 0;
    const effJp = activeJpIdx < jyutpingRoms.length ? activeJpIdx : 0;
    const activePinyin = pinyinRoms[effPy] ?? null;
    const activeJyutping = jyutpingRoms[effJp] ?? null;

    const vocabulary = useMemo(() => {
        if (!vocab) return null;
        return {
            ...vocab,
            pinyin: activePinyin?.pinyin || undefined,
            jyutping: activeJyutping?.jyutping || undefined,
            sinoVietnamese: activePinyin?.sinoVietnamese || activeJyutping?.sinoVietnamese || undefined,
            pinyinReading: activePinyin,
            jyutpingReading: activeJyutping,
        };
    }, [vocab, activePinyin, activeJyutping]);

    const selectPinyin = (key) => {
        const i = pinyinRoms.findIndex((r) => r.key === key);
        if (i >= 0) setActivePyIdx(i);
    };
    const selectJyutping = (key) => {
        const i = jyutpingRoms.findIndex((r) => r.key === key);
        if (i >= 0) setActiveJpIdx(i);
    };

    const handleDelete = useCallback(async () => {
        if (!vocab) return;
        await removeVocabulary(vocab.id);
        onOpenChange(false);
        onDeleteVocabulary?.(vocab.id);
    }, [vocab, removeVocabulary, onOpenChange, onDeleteVocabulary]);

    const hanSimp = String(vocab?.hanSimplified ?? "").trim();
    const hanHk = String(vocab?.hanHongKong ?? vocab?.hanTraditional ?? "").trim();
    const hanTitle = [hanSimp, hanHk].filter(Boolean).join(" ") || "—";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flashcard-detail-dialog max-w-[calc(100%-2rem)] lg:max-w-5xl h-[calc(100svh-4rem)] overflow-hidden p-0 gap-0">
                {/* sr-only trực tiếp (không bọc DialogHeader — wrapper tạo grid item bị stretch thành
                    khoảng trống dư phía trên). sr-only = absolute → out of flow → không chiếm layout. */}
                <DialogTitle className="sr-only">{hanTitle}</DialogTitle>
                {vocabulary ? (
                    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
                        {/* Header (toolbar) + line ngăn cách dưới — như VocabularyDetailPage. CỐ ĐỊNH h-14 (56px)
                            + overflow-hidden: không tự giãn theo content (content chỉ 40px, vừa 56px). */}
                        <div
                            ref={headerRef}
                            className="flex h-14 shrink-0 items-center overflow-hidden border-b border-border/60 px-4 pr-14 sm:pr-16"
                        />
                        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
                            <div className="flex w-full min-w-0 flex-1 flex-col px-4 py-6 sm:px-8 sm:py-8">
                                <VocabularyDetailContent
                                    key={vocab.id}
                                    vocabulary={vocabulary}
                                    canEdit={isAdmin}
                                    // ⚠️ 2026-09-19: mở dialog là vào CHẾ ĐỘ EDIT luôn (nút "Chỉnh sửa" trên thẻ).
                                    initialEditing={startEditing && isAdmin}
                                    onSave={isAdmin ? editVocabulary : undefined}
                                    onDelete={isAdmin ? handleDelete : undefined}
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
                        {/* Footer (action bar) + line ngăn cách trên — như VocabularyDetailPage. min-h-14 + items-center
                            khớp chiều cao header (override padding actionBar trong globals.css). */}
                        <div
                            ref={footerRef}
                            className="flex min-h-14 shrink-0 items-center border-t border-border/60 px-4 sm:px-8"
                        />
                    </div>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
