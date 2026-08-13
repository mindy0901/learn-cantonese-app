import { useMemo, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useHanCharacters, useVocabularies, useAppActions } from "../store/appStore.js";
import { useIsAdmin } from "../store/authStore.js";
import { useLocale } from "../store/localeStore.js";
import { vocabularyDetailPath } from "../lib/wordRoutes.js";
import { collectMeaningsField, displayMeaning } from "../lib/wordNormalize.js";
import { vocabRomanizationField, vocabMeanings } from "../lib/wordDisplay.js";
import { HanziiHanCellLink } from "../components/HanziiHanCellLink.jsx";
import { TagInput } from "../components/TagInput.jsx";
import { Button } from "../components/shadcn/button.jsx";
import { Input } from "../components/shadcn/input.jsx";

function buildHanDraft(item) {
    return {
        hanSimplified: item.hanSimplified ?? "",
        hanTraditional: item.hanTraditional ?? "",
        sinoVietnamese: Array.isArray(item.sinoVietnamese)
            ? item.sinoVietnamese.join(", ")
            : (item.sinoVietnamese ?? ""),
        jyutping: Array.isArray(item.jyutping) ? item.jyutping.join(", ") : (item.jyutping ?? ""),
        pinyin: Array.isArray(item.pinyin) ? item.pinyin.join(", ") : (item.pinyin ?? ""),
    };
}

function parseArrayField(val) {
    if (Array.isArray(val)) return val;
    if (!val || !String(val).trim()) return [];
    return String(val)
        .split(/[,，/、]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

function hanDraftPayload(draft) {
    return {
        hanSimplified: draft.hanSimplified?.trim() || undefined,
        hanTraditional: draft.hanTraditional?.trim() || undefined,
        sinoVietnamese: parseArrayField(draft.sinoVietnamese),
        jyutping: parseArrayField(draft.jyutping),
        pinyin: parseArrayField(draft.pinyin),
    };
}

export function HanCharacterDetailPage() {
    const { id } = useParams();
    const { t } = useLocale();
    const isAdmin = useIsAdmin();
    const { editHanCharacter } = useAppActions();
    const hanCharacters = useHanCharacters();
    const words = useVocabularies();

    const item = useMemo(() => hanCharacters.find((h) => h.id === id), [hanCharacters, id]);

    // Edit mode state
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(() => (item ? buildHanDraft(item) : null));
    const [saving, setSaving] = useState(false);

    const resetDraft = useCallback(() => {
        if (item) setDraft(buildHanDraft(item));
    }, [item]);

    const startEdit = useCallback(() => {
        resetDraft();
        setEditing(true);
    }, [resetDraft]);

    const cancelEdit = useCallback(() => {
        resetDraft();
        setEditing(false);
    }, [resetDraft]);

    const saveEdit = useCallback(async () => {
        if (!draft || !item) return;
        const payload = hanDraftPayload(draft);
        // Check if anything changed
        const currentSinoVietnamese = Array.isArray(item.sinoVietnamese)
            ? item.sinoVietnamese.join(", ")
            : (item.sinoVietnamese ?? "");
        const currentJyutping = Array.isArray(item.jyutping) ? item.jyutping.join(", ") : (item.jyutping ?? "");
        const currentPinyin = Array.isArray(item.pinyin) ? item.pinyin.join(", ") : (item.pinyin ?? "");
        const noChange =
            (payload.hanSimplified || "") === (item.hanSimplified ?? "") &&
            (payload.hanTraditional || "") === (item.hanTraditional ?? "") &&
            payload.sinoVietnamese.join(", ") === currentSinoVietnamese &&
            payload.jyutping.join(", ") === currentJyutping &&
            payload.pinyin.join(", ") === currentPinyin;
        if (noChange) {
            setEditing(false);
            return;
        }
        setSaving(true);
        try {
            editHanCharacter(item.id, payload);
            setEditing(false);
        } finally {
            setSaving(false);
        }
    }, [draft, item, editHanCharacter]);

    const handleKeyDown = useCallback(
        (e) => {
            if (!editing) return;
            if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
            } else if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
                e.preventDefault();
                saveEdit();
            }
        },
        [editing, cancelEdit, saveEdit],
    );

    // Sync draft when item changes externally
    useMemo(() => {
        if (item && !editing) setDraft(buildHanDraft(item));
    }, [item, editing]);

    // Find words containing this character
    const charWords = useMemo(() => {
        if (!item) return [];
        const ch = (item.hanSimplified ?? item.character ?? "").trim();
        const tradCh = (item.hanTraditional ?? "").trim();
        if (!ch && !tradCh) return [];
        return words.filter((w) => {
            const ht = w.hanTraditional ?? "";
            const hs = w.hanSimplified ?? "";
            return (
                (ch && ht.includes(ch)) ||
                (ch && hs.includes(ch)) ||
                (tradCh && ht.includes(tradCh)) ||
                (tradCh && hs.includes(tradCh))
            );
        });
    }, [words, item]);

    if (!item) {
        return (
            <main className="flex-1 w-full px-5 py-8 pb-12">
                <div className="text-center py-12 px-6 text-muted-foreground flex flex-col items-center gap-4">
                    <p>{t.hanCharacters?.notFound}</p>
                    <Link to="/han-characters" className="text-primary underline">
                        {t.hanCharacters?.backToList}
                    </Link>
                </div>
            </main>
        );
    }

    const char = item.hanSimplified ?? item.character ?? "";
    const trad = item.hanTraditional;
    const showTrad = trad && trad !== char;

    /** Render han text with the target character(s) highlighted */
    const highlightChar = (text) => {
        if (!text) return "—";
        const targets = new Set([char, trad].filter(Boolean));
        return [...text].map((c, i) => {
            if (targets.has(c)) {
                return (
                    <span key={i} className="text-han-trad font-bold">
                        {c}
                    </span>
                );
            }
            return <span key={i}>{c}</span>;
        });
    };
    const jyutping = Array.isArray(item.jyutping) ? item.jyutping : item.jyutping ? [item.jyutping] : [];
    const pinyin = Array.isArray(item.pinyin) ? item.pinyin : item.pinyin ? [item.pinyin] : [];
    const sinoVietnamese = Array.isArray(item.sinoVietnamese)
        ? item.sinoVietnamese
        : item.sinoVietnamese
          ? [item.sinoVietnamese]
          : [];

    const labelClass = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";
    const inputClass = "w-full";

    return (
        <main className="han-detail-page flex-1 w-full px-5 py-8 pb-12" onKeyDown={handleKeyDown}>
            <div className="flex flex-col items-stretch gap-8">
                {/* Character display */}
                <div className="flex flex-col items-center gap-3">
                    <div className="flex items-center gap-4">
                        <HanziiHanCellLink
                            hanTraditional={trad || char}
                            displayText={char}
                            emphasis="primary"
                            className="text-6xl sm:text-7xl text-han-simp"
                        />
                        {showTrad && (
                            <>
                                <span className="text-2xl text-muted-foreground">/</span>
                                <HanziiHanCellLink
                                    hanTraditional={trad}
                                    displayText={trad}
                                    emphasis="primary"
                                    className="text-6xl sm:text-7xl text-han-trad"
                                />
                            </>
                        )}
                    </div>
                </div>

                {/* Readings table */}
                <div className="relative w-full rounded-xl border border-border/80 bg-card/80 p-6">
                    {isAdmin && (
                        <div className="absolute top-3 right-3 flex items-center gap-2">
                            {editing ? (
                                <>
                                    <Button type="button" variant="outline" onClick={cancelEdit}>
                                        {t.common?.cancel}
                                    </Button>
                                    <Button type="button" variant="default" onClick={saveEdit} disabled={saving}>
                                        {saving ? t.common?.saving : t.common?.save}
                                    </Button>
                                </>
                            ) : (
                                <Button type="button" variant="default" onClick={startEdit}>
                                    {t.common?.edit}
                                </Button>
                            )}
                        </div>
                    )}
                    {editing ? (
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1">
                                <label className={labelClass}>{t.hanLookup?.traditionalHk}</label>
                                <Input
                                    className="text-lg text-han-trad"
                                    value={draft?.hanTraditional ?? ""}
                                    onChange={(e) => setDraft((d) => ({ ...d, hanTraditional: e.target.value }))}
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className={labelClass}>{t.wordBank.colSinoVietnamese}</label>
                                <TagInput
                                    value={draft?.sinoVietnamese ?? ""}
                                    onChange={(v) => setDraft((d) => ({ ...d, sinoVietnamese: v }))}
                                    placeholder={t.hanCharacters.readingPlaceholder}
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className={labelClass}>{t.wordBank.colJyutping}</label>
                                <TagInput
                                    value={draft?.jyutping ?? ""}
                                    onChange={(v) => setDraft((d) => ({ ...d, jyutping: v }))}
                                    className="text-jyutping"
                                    placeholder={t.hanCharacters.readingPlaceholder}
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className={labelClass}>{t.wordBank.colPinyin}</label>
                                <TagInput
                                    value={draft?.pinyin ?? ""}
                                    onChange={(v) => setDraft((d) => ({ ...d, pinyin: v }))}
                                    className="text-jyutping"
                                    placeholder={t.hanCharacters.readingPlaceholder}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {sinoVietnamese.length > 0 && (
                                <div className="flex flex-col gap-1">
                                    <p className={labelClass}>{t.wordBank.colSinoVietnamese}</p>
                                    <p className="text-lg font-medium text-foreground">{sinoVietnamese.join(" / ")}</p>
                                </div>
                            )}
                            {jyutping.length > 0 && (
                                <div className="flex flex-col gap-1">
                                    <p className={labelClass}>{t.wordBank.colJyutping}</p>
                                    <p className="text-lg font-semibold text-jyutping">{jyutping.join(" / ")}</p>
                                </div>
                            )}
                            {pinyin.length > 0 && (
                                <div className="flex flex-col gap-1">
                                    <p className={labelClass}>{t.wordBank.colPinyin}</p>
                                    <p className="text-lg font-semibold text-jyutping">{pinyin.join(" / ")}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Words containing this character */}
                {charWords.length > 0 && (
                    <div className="w-full rounded-xl border border-border/80 bg-card/80 p-6">
                        <div className="flex flex-col divide-y divide-border/60">
                            {/* Column headers */}
                            <div className="grid grid-cols-[1fr_1.5fr_1.5fr_1fr] items-center gap-3 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                <span>{t.wordBank.colHanTraditional}</span>
                                <span>{t.wordBank.colJyutping}</span>
                                <span>{t.wordBank.colVietMeanings}</span>
                                <span>{t.wordBank.colEngMeanings}</span>
                            </div>
                            {charWords.map((w) => (
                                <Link
                                    key={w.id}
                                    to={vocabularyDetailPath(w.hanTraditional || w.hanSimplified || w.hanHongKong)}
                                    className="grid grid-cols-[1fr_1.5fr_1.5fr_1fr] items-center gap-3 px-3 py-3 text-sm no-underline rounded hover:bg-background/60"
                                >
                                    <span className="font-semibold text-han-trad text-2xl truncate">
                                        {highlightChar(w.hanTraditional || w.hanSimplified || w.hanHongKong)}
                                    </span>
                                    <span className="text-jyutping font-medium text-sm truncate">
                                        {vocabRomanizationField(w, "jyutping") || w.jyutping || ""}
                                    </span>
                                    <span className="text-foreground text-sm truncate">
                                        {collectMeaningsField(vocabMeanings(w), "vietMeanings") ||
                                            displayMeaning(w.vietMeanings) ||
                                            "—"}
                                    </span>
                                    <span className="text-foreground text-sm truncate">
                                        {collectMeaningsField(vocabMeanings(w), "engMeanings") ||
                                            displayMeaning(w.engMeanings) ||
                                            "—"}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {/* Back link */}
                <div className="flex items-center">
                    <Link
                        to="/han-characters"
                        className="text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                        ← {t.hanCharacters?.backToList}
                    </Link>
                </div>
            </div>
        </main>
    );
}
