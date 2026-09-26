import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "../store/localeStore.js";
import { api, getApiLanguage } from "../lib/api.js";
import { vocabLangToLegacy } from "../lib/dataTransforms.js";
import { cn } from "../lib/cn.js";
import { btnClass } from "./ui/buttonStyles.js";
import { SkeletonBlock } from "./ui/Skeleton.jsx";
import { EmptyState } from "./ui/EmptyState.jsx";
import { ConfirmDialog } from "./ConfirmDialog.jsx";
import { FlashcardStatsPanel } from "./FlashcardStatsPanel.jsx";
import { IconFlashcard } from "./NavIcons.jsx";
import { Button } from "./shadcn/button.jsx";
import { normalizeSearchText } from "../lib/wordSearch.js";
import { collectMeaningsField, displayMeaning } from "../lib/wordNormalize.js";
import { vocabRomanizationField, vocabMeanings } from "../lib/wordDisplay.js";

const DECK_COLORS = [
    "#6D28D9", // violet-700
    "#7C3AED", // violet
    "#DB2777", // pink
    "#DC2626", // red
    "#EA580C", // orange
    "#D97706", // amber
    "#16A34A", // green
    "#0891B2", // cyan
    "#2563EB", // blue
    "#6B7280", // gray
];

export function FlashcardDeckManager({ onClose, onDeckSelect }) {
    const { t } = useLocale();
    const [decks, setDecks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [editingDeck, setEditingDeck] = useState(null); // null | 'new' | deck object
    const [managingDeck, setManagingDeck] = useState(null); // deck object with vocabularies
    const [deleteTarget, setDeleteTarget] = useState(null);

    const loadDecks = useCallback(async () => {
        try {
            setLoading(true);
            const data = await api.fetchFlashcardDecks();
            setDecks(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadDecks();
    }, [loadDecks]);

    const handleCreateDeck = useCallback(() => {
        setEditingDeck("new");
    }, []);

    const handleEditDeck = useCallback((deck) => {
        setEditingDeck(deck);
    }, []);

    const handleManageDeck = useCallback(async (deck) => {
        try {
            const full = await api.fetchFlashcardDeck(deck.id);
            setManagingDeck(full);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    }, []);

    const handleDeleteDeck = useCallback((deck) => {
        setDeleteTarget(deck);
    }, []);

    const confirmDelete = useCallback(async () => {
        if (!deleteTarget) return;
        try {
            await api.deleteFlashcardDeck(deleteTarget.id);
            setDecks((prev) => prev.filter((d) => d.id !== deleteTarget.id));
            setDeleteTarget(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    }, [deleteTarget]);

    const handleDeckSaved = useCallback((savedDeck, isNew) => {
        if (isNew) {
            setDecks((prev) => [savedDeck, ...prev]);
        } else {
            setDecks((prev) => prev.map((d) => (d.id === savedDeck.id ? { ...d, ...savedDeck } : d)));
        }
        setEditingDeck(null);
    }, []);

    const handleDeckVocabChanged = useCallback((mandarinCount, cantoneseCount) => {
        setManagingDeck((prev) => {
            if (!prev) return prev;
            return {
                ...prev,
                mandarinCount,
                cantoneseCount,
                vocabularyCount: mandarinCount + cantoneseCount,
            };
        });
    }, []);

    // Khi đóng màn quản lý từ — refresh lại danh sách deck để count cập nhật đúng. (2026-09)
    const closeManager = useCallback(() => {
        setManagingDeck(null);
        loadDecks();
    }, [loadDecks]);

    if (editingDeck) {
        return (
            <DeckForm
                deck={editingDeck === "new" ? null : editingDeck}
                onSave={handleDeckSaved}
                onCancel={() => setEditingDeck(null)}
            />
        );
    }

    if (managingDeck) {
        return (
            <DeckVocabularyManager deck={managingDeck} onBack={closeManager} onVocabChanged={handleDeckVocabChanged} />
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
                <h2 className="m-0 text-lg font-semibold text-foreground">{t.flashcard.manageDecks}</h2>
                <div className="flex gap-2">
                    <button type="button" className={btnClass("primary", "sm")} onClick={handleCreateDeck}>
                        + {t.flashcard.createDeck}
                    </button>
                    {onClose && (
                        <button type="button" className={btnClass("ghost", "sm")} onClick={onClose}>
                            {t.common.close}
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <p className="px-4 py-3 rounded-lg text-sm bg-destructive/10 text-destructive border border-destructive/30">
                    {error}
                </p>
            )}

            {/* ⚠️ 2026-09-02: thống kê tiến trình hiển thị ngay trong màn quản lý bộ thẻ (theo yêu cầu user) */}
            <FlashcardStatsPanel />

            {loading ? (
                <SkeletonBlock height="8rem" className="rounded-xl" />
            ) : decks.length === 0 ? (
                <EmptyState
                    icon={<IconFlashcard size={24} />}
                    title={t.flashcard.noDecks}
                    action={
                        <button type="button" className={btnClass("primary")} onClick={handleCreateDeck}>
                            + {t.flashcard.createDeck}
                        </button>
                    }
                />
            ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                    {decks.map((deck) => (
                        <DeckCard
                            key={deck.id}
                            deck={deck}
                            onSelect={onDeckSelect}
                            onManage={handleManageDeck}
                            onEdit={handleEditDeck}
                            onDelete={handleDeleteDeck}
                        />
                    ))}
                </div>
            )}

            {deleteTarget && (
                <ConfirmDialog
                    title={t.flashcard.deleteDeck}
                    message={t.flashcard.deleteDeckConfirm.replace("{name}", deleteTarget.name)}
                    confirmLabel={t.common.delete}
                    onConfirm={confirmDelete}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}
        </div>
    );
}

function DeckCard({ deck, onSelect, onManage, onEdit, onDelete }) {
    const { t } = useLocale();
    const colorStyle = deck.color ? { borderLeftColor: deck.color, borderLeftWidth: 4 } : {};

    return (
        <div
            className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3 hover:border-primary/25 transition-colors"
            style={colorStyle}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <h3 className="m-0 text-base font-semibold text-foreground truncate">{deck.name}</h3>
                    {deck.description && (
                        <p className="m-0 mt-1 text-sm text-muted-foreground line-clamp-2">{deck.description}</p>
                    )}
                    <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                        <span>
                            {t.nav.mandarinGroup}: {deck.mandarinCount ?? 0}
                        </span>
                        <span>
                            {t.nav.cantoneseGroup}: {deck.cantoneseCount ?? 0}
                        </span>
                    </div>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {t.flashcard.deckVocabCount.replace("{count}", deck.vocabularyCount ?? 0)}
                </span>
            </div>

            <div className="flex gap-2 flex-wrap">
                {onSelect && (
                    <button type="button" className={btnClass("primary", "sm")} onClick={() => onSelect(deck)}>
                        {t.flashcard.startSession}
                    </button>
                )}
                <button type="button" className={btnClass("ghost", "sm")} onClick={() => onManage(deck)}>
                    {t.flashcard.addVocabToDeck}
                </button>
                <button type="button" className={btnClass("ghost", "sm")} onClick={() => onEdit(deck)}>
                    {t.common.edit}
                </button>
                <Button type="button" variant="destructive" size="sm" onClick={() => onDelete(deck)}>
                    {t.common.delete}
                </Button>
            </div>
        </div>
    );
}

function DeckForm({ deck, onSave, onCancel }) {
    const { t } = useLocale();
    const isNew = !deck;
    const [name, setName] = useState(deck?.name ?? "");
    const [description, setDescription] = useState(deck?.description ?? "");
    const [color, setColor] = useState(deck?.color ?? DECK_COLORS[0]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = useCallback(
        async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            setSaving(true);
            setError(null);
            try {
                const payload = { name: name.trim(), description: description.trim(), color };
                let saved;
                if (isNew) {
                    saved = await api.createFlashcardDeck(payload);
                } else {
                    saved = await api.updateFlashcardDeck(deck.id, payload);
                }
                onSave(saved, isNew);
            } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                setSaving(false);
            }
        },
        [name, description, color, isNew, deck, onSave],
    );

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <h2 className="m-0 text-lg font-semibold text-foreground">
                {isNew ? t.flashcard.createDeck : t.flashcard.editDeck}
            </h2>

            {error && (
                <p className="px-4 py-3 rounded-lg text-sm bg-destructive/10 text-destructive border border-destructive/30">
                    {error}
                </p>
            )}

            <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t.flashcard.deckName} *
                </label>
                <input
                    type="text"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/35 focus:border-primary/25"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t.flashcard.deckNamePlaceholder}
                    required
                    autoFocus
                />
            </div>

            <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t.flashcard.deckDescription}
                </label>
                <textarea
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/35 focus:border-primary/25 resize-y"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t.flashcard.deckDescriptionPlaceholder}
                    rows={2}
                />
            </div>

            <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t.flashcard.deckColor}
                </label>
                <div className="flex gap-2 flex-wrap">
                    {DECK_COLORS.map((c) => (
                        <button
                            key={c}
                            type="button"
                            className={cn(
                                "w-7 h-7 rounded-full border-2 transition-all cursor-pointer",
                                color === c ? "border-text-h scale-110" : "border-transparent",
                            )}
                            style={{ backgroundColor: c }}
                            onClick={() => setColor(c)}
                            aria-label={c}
                        />
                    ))}
                </div>
            </div>

            <div className="flex gap-2 justify-end">
                <Button type="button" variant="destructive" onClick={onCancel}>
                    {t.common.cancel}
                </Button>
                <button type="submit" className={btnClass("primary")} disabled={saving || !name.trim()}>
                    {saving ? t.common.loading : t.common.save}
                </button>
            </div>
        </form>
    );
}

function DeckVocabularyManager({ deck, onBack, onVocabChanged }) {
    const { t } = useLocale();
    // ⚠️ 2026-09: deck tách ngôn ngữ — gộp 2 mảng mandarin + cantonese, convert sang legacy + tag _lang.
    const [vocabularies, setVocabularies] = useState(() => [
        ...(deck.mandarinVocabularies ?? []).map((v) => ({ ...vocabLangToLegacy(v, "mandarin"), _lang: "mandarin" })),
        ...(deck.cantoneseVocabularies ?? []).map((v) => ({
            ...vocabLangToLegacy(v, "cantonese"),
            _lang: "cantonese",
        })),
    ]);
    const [search, setSearch] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [addingId, setAddingId] = useState(null);
    const [removingId, setRemovingId] = useState(null);

    const deckVocabIds = useMemo(() => new Set(vocabularies.map((v) => v.id)), [vocabularies]);

    // Báo counts lên parent sau khi state đã commit (tránh setState trong render).
    useEffect(() => {
        const man = vocabularies.filter((v) => v._lang === "mandarin").length;
        const can = vocabularies.filter((v) => v._lang === "cantonese").length;
        onVocabChanged?.(man, can);
    }, [vocabularies, onVocabChanged]);

    // Search vocabulary to add (theo ngôn ngữ active)
    useEffect(() => {
        const q = search.trim();
        if (q.length < 1) {
            setSearchResults([]);
            return;
        }
        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                setSearching(true);
                const lang = getApiLanguage();
                const result = await api.browseVocabularies({ page: 1, pageSize: 20, q });
                if (!cancelled) {
                    setSearchResults((result.items ?? []).map((v) => ({ ...vocabLangToLegacy(v, lang), _lang: lang })));
                }
            } catch {
                if (!cancelled) setSearchResults([]);
            } finally {
                if (!cancelled) setSearching(false);
            }
        }, 300);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [search]);

    const handleAdd = useCallback(
        async (vocab) => {
            setAddingId(vocab.id);
            try {
                await api.addVocabularyToDeck(deck.id, vocab.id, vocab._lang);
                setVocabularies((prev) => [...prev, vocab]);
            } catch {
                // silently ignore (might already be in deck)
            } finally {
                setAddingId(null);
            }
        },
        [deck.id],
    );

    const handleRemove = useCallback(
        async (vocab) => {
            setRemovingId(vocab.id);
            try {
                await api.removeVocabularyFromDeck(deck.id, vocab.id, vocab._lang);
                setVocabularies((prev) => prev.filter((v) => v.id !== vocab.id));
            } catch {
                // silently ignore
            } finally {
                setRemovingId(null);
            }
        },
        [deck.id],
    );

    const langLabel = (lang) => (lang === "mandarin" ? t.nav.mandarinGroup : t.nav.cantoneseGroup);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
                <button type="button" className={btnClass("ghost", "sm")} onClick={onBack}>
                    ← {t.common.back}
                </button>
                <h2 className="m-0 text-lg font-semibold text-foreground">
                    {deck.name} — {t.flashcard.addVocabToDeck}
                </h2>
                <span className="text-sm text-muted-foreground">
                    ({t.flashcard.deckVocabCount.replace("{count}", vocabularies.length)})
                </span>
            </div>

            {/* Search to add */}
            <div>
                <input
                    type="text"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/35 focus:border-primary/25"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t.flashcard.deckSearchPlaceholder}
                />
            </div>

            {search.trim() && (
                <div className="rounded-xl border border-border bg-card divide-y divide-border max-h-64 overflow-y-auto">
                    {searching ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">{t.common.loading}</div>
                    ) : searchResults.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">{t.wordBank.noSearchMatch}</div>
                    ) : (
                        searchResults.map((vocab) => {
                            const inDeck = deckVocabIds.has(vocab.id);
                            return (
                                <div
                                    key={vocab.id}
                                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-background transition-colors"
                                >
                                    <div className="flex-1 min-w-0">
                                        <span className="font-semibold text-han-trad text-base">
                                            {vocab.hanTraditional || vocab.hanHongKong || "—"}
                                        </span>
                                        <span className="ml-2 text-xs text-muted-foreground">
                                            {langLabel(vocab._lang)}
                                        </span>
                                        {vocabRomanizationField(vocab, "sinoVietnamese") && (
                                            <span className="ml-2 text-sm text-viet">
                                                {vocabRomanizationField(vocab, "sinoVietnamese")}
                                            </span>
                                        )}
                                        {(() => {
                                            const viet =
                                                collectMeaningsField(vocabMeanings(vocab), "vietMeanings") ||
                                                displayMeaning(vocab.vietMeanings);
                                            const eng =
                                                collectMeaningsField(vocabMeanings(vocab), "engMeanings") ||
                                                displayMeaning(vocab.engMeanings);
                                            return (
                                                (viet || eng) && (
                                                    <span className="ml-2 text-sm text-muted-foreground truncate">
                                                        {viet || eng}
                                                    </span>
                                                )
                                            );
                                        })()}
                                    </div>
                                    <button
                                        type="button"
                                        className={btnClass(inDeck ? "ghost" : "primary", "sm")}
                                        disabled={inDeck || addingId === vocab.id}
                                        onClick={() => !inDeck && handleAdd(vocab)}
                                    >
                                        {inDeck ? "✓" : addingId === vocab.id ? "…" : "+"}
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* Current deck vocabularies */}
            <div>
                <h3 className="m-0 mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    {t.flashcard.deckVocabCount.replace("{count}", vocabularies.length)}
                </h3>
                {vocabularies.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">{t.flashcard.deckEmpty}</p>
                ) : (
                    <div className="rounded-xl border border-border bg-card divide-y divide-border max-h-80 overflow-y-auto">
                        {vocabularies.map((vocab) => (
                            <div
                                key={vocab.id}
                                className="flex items-center gap-3 px-4 py-2.5 hover:bg-background transition-colors"
                            >
                                <div className="flex-1 min-w-0">
                                    <span className="font-semibold text-han-trad text-base">
                                        {vocab.hanTraditional || vocab.hanHongKong || "—"}
                                    </span>
                                    <span className="ml-2 text-xs text-muted-foreground">{langLabel(vocab._lang)}</span>
                                    {vocabRomanizationField(vocab, "sinoVietnamese") && (
                                        <span className="ml-2 text-sm text-viet">
                                            {vocabRomanizationField(vocab, "sinoVietnamese")}
                                        </span>
                                    )}
                                    {(() => {
                                        const viet =
                                            collectMeaningsField(vocabMeanings(vocab), "vietMeanings") ||
                                            displayMeaning(vocab.vietMeanings);
                                        const eng =
                                            collectMeaningsField(vocabMeanings(vocab), "engMeanings") ||
                                            displayMeaning(vocab.engMeanings);
                                        return (
                                            (viet || eng) && (
                                                <span className="ml-2 text-sm text-muted-foreground truncate">
                                                    {viet || eng}
                                                </span>
                                            )
                                        );
                                    })()}
                                </div>
                                <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    disabled={removingId === vocab.id}
                                    onClick={() => handleRemove(vocab)}
                                >
                                    {removingId === vocab.id ? "…" : "×"}
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
