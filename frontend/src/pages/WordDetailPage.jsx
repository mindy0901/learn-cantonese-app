import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { WordDetailContent } from "../components/WordDetailContent.jsx";
import { useAppActions, useVocabularies } from "../store/appStore.js";
import { useLocale } from "../store/localeStore.js";
import { useIsAdmin, useIsSignedIn } from "../store/authStore.js";
import { Button } from "../components/shadcn/button.jsx";
import { ToggleGroup, ToggleGroupItem } from "../components/shadcn/toggle-group.jsx";
import { vocabularyDetailPath } from "../lib/wordRoutes.js";
import { comparePinyinTone } from "../lib/pinyinSort.js";

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
    // Sort by pinyin tone (yī, yí, yǐ, yì → thanh 1, 2, 3, 4), tie-break by jyutping.
    out.sort((a, b) => {
        const c = comparePinyinTone(a.pinyin, b.pinyin);
        if (c !== 0) return c;
        return comparePinyinTone(a.jyutping, b.jyutping);
    });
    return out;
}

export function WordDetailPage() {
    const { han: hanParam } = useParams();
    const navigate = useNavigate();
    const vocabularies = useVocabularies();
    const { toggleImportant, toggleMastered, editVocabulary, removeVocabulary } = useAppActions();
    const { t } = useLocale();
    const isAdmin = useIsAdmin();
    const canMark = useIsSignedIn();

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

    // Base vocab = the DB row(s); pronunciation list = flattened readings.
    const baseVocabulary = variants[0];
    const romanizations = useMemo(() => flattenRomanizations(variants), [variants]);

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
        return {
            ...baseVocabulary,
            pinyin: activePinyin?.pinyin || undefined,
            jyutping: activeJyutping?.jyutping || undefined,
            sinoVietnamese: activePinyin?.sinoVietnamese || activeJyutping?.sinoVietnamese || undefined,
            pinyinReading: activePinyin,
            jyutpingReading: activeJyutping,
        };
    }, [baseVocabulary, activePinyin, activeJyutping]);

    const handleNextRandom = useCallback(() => {
        const pool = vocabularies.filter(
            (v) => ((v.hanTraditional ?? "") + (v.hanSimplified ?? "")).replace(/\s+/g, "") !== han.replace(/\s+/g, ""),
        );
        if (pool.length === 0) return;
        const next = pool[Math.floor(Math.random() * pool.length)];
        navigate(vocabularyDetailPath(next.hanTraditional || next.hanSimplified || next.hanHongKong));
    }, [vocabularies, han, navigate]);

    const handleDelete = useCallback(() => {
        if (!vocabulary) return;
        removeVocabulary(vocabulary.id);
        navigate("/vocabulary");
    }, [vocabulary, removeVocabulary, navigate]);

    if (!vocabulary) {
        return (
            <main className="flex-1 w-full max-w-360 mx-auto px-4 py-8 pb-12">
                <div className="text-center py-12 px-6 text-muted-foreground flex flex-col items-center gap-4">
                    <p>{t.wordDetail.notFound}</p>
                    <Button nativeButton={false} render={<Link to="/vocabulary" />}>
                        {t.wordDetail.backToWordBank}
                    </Button>
                </div>
            </main>
        );
    }

    return (
        <main className="flex-1 w-full max-w-360 mx-auto px-4 py-8 pb-12 flex flex-col">
            <div className="mb-8">
                <Button nativeButton={false} variant="ghost" render={<Link to="/vocabulary" />}>
                    ← {t.wordDetail.backToWordBank}
                </Button>
            </div>

            <section className="flex min-h-0 flex-1 flex-col rounded-xl bg-card px-4 py-6 shadow-sm sm:px-8 sm:py-8">
                <WordDetailContent
                    key={vocabulary.id}
                    vocabulary={vocabulary}
                    canEdit={isAdmin}
                    onSave={isAdmin ? editVocabulary : undefined}
                    onDelete={isAdmin ? handleDelete : undefined}
                    onNextRandom={vocabularies.length > 1 ? handleNextRandom : undefined}
                    activePinyinId={activePinyin?.romanizationId}
                    activeJyutpingId={activeJyutping?.romanizationId}
                    {...(canMark && {
                        onToggleImportant: toggleImportant,
                        onToggleMastered: toggleMastered,
                    })}
                    pronunciationBar={
                        romanizations.length > 0 ? (
                            <div className="flex flex-col items-center gap-2">
                                {!vocabulary.pureCantonese && pinyinRoms.length > 0 && (
                                    <ToggleGroup
                                        className="mx-auto flex-wrap"
                                        value={[pinyinRoms[effPyIdx]?.key ?? pinyinRoms[0]?.key]}
                                        onValueChange={(values) => {
                                            const key = values[0];
                                            const idx = pinyinRoms.findIndex((r) => r.key === key);
                                            if (idx >= 0) setActivePyIdx(idx);
                                        }}
                                    >
                                        {pinyinRoms.map((r) => (
                                            <ToggleGroupItem
                                                key={r.key}
                                                value={r.key}
                                                variant="outline"
                                                className="gap-2 rounded-full px-4 py-2"
                                                aria-label={`${r.sinoVietnamese ?? ""} ${r.pinyin ?? ""}`.trim()}
                                            >
                                                <div className="flex w-auto min-w-0 items-center gap-1">
                                                    <span className="text-xs font-semibold text-foreground">
                                                        {r.sinoVietnamese ?? ""}
                                                    </span>
                                                    <span className="text-muted-foreground text-sm">|</span>
                                                    <span className="font-semibold text-pinyin">{r.pinyin ?? ""}</span>
                                                </div>
                                            </ToggleGroupItem>
                                        ))}
                                    </ToggleGroup>
                                )}
                                {jyutpingRoms.length > 0 && (
                                    <ToggleGroup
                                        className="mx-auto flex-wrap"
                                        value={[jyutpingRoms[effJpIdx]?.key ?? jyutpingRoms[0]?.key]}
                                        onValueChange={(values) => {
                                            const key = values[0];
                                            const idx = jyutpingRoms.findIndex((r) => r.key === key);
                                            if (idx >= 0) setActiveJpIdx(idx);
                                        }}
                                    >
                                        {jyutpingRoms.map((r) => (
                                            <ToggleGroupItem
                                                key={r.key}
                                                value={r.key}
                                                variant="outline"
                                                className="gap-2 rounded-full px-4 py-2"
                                                aria-label={`${r.sinoVietnamese ?? ""} ${r.jyutping ?? ""}`.trim()}
                                            >
                                                <div className="flex w-auto min-w-0 items-center gap-1">
                                                    <span className="text-xs font-semibold text-foreground">
                                                        {r.sinoVietnamese ?? ""}
                                                    </span>
                                                    <span className="text-muted-foreground text-sm">|</span>
                                                    <span className="text-xs text-jyutping">{r.jyutping ?? ""}</span>
                                                </div>
                                            </ToggleGroupItem>
                                        ))}
                                    </ToggleGroup>
                                )}
                            </div>
                        ) : undefined
                    }
                />
            </section>
        </main>
    );
}
