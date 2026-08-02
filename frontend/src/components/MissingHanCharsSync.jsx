import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api.js";
import { logError } from "../lib/actionLog.js";
import { findMissingHanCharsWithReadings } from "../lib/hanCharExtract.js";
import { useAppActions, useDataHydrated, useHanCharacters, useVocabularies } from "../store/appStore.js";
import { btnClass } from "./ui/buttonStyles.js";

export function MissingHanCharsSync() {
    const words = useVocabularies();
    const hanCharacters = useHanCharacters();
    const hydrated = useDataHydrated();
    const { mergeHanCharacters, editHanCharacter } = useAppActions();

    const [syncing, setSyncing] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [result, setResult] = useState(null);

    const { missing, updates } = useMemo(
        () => (hydrated ? findMissingHanCharsWithReadings(words, hanCharacters) : { missing: [], updates: [] }),
        [words, hanCharacters, hydrated],
    );

    const actionCount = missing.length + updates.length;

    // Don't show anything until data is loaded
    if (!hydrated) return null;

    const handleSync = useCallback(async () => {
        if (actionCount === 0) return;
        setSyncing(true);
        setResult(null);
        let added = 0;
        let failed = 0;
        let updated = 0;
        let updateFailed = 0;
        let withReadings = 0;
        try {
            // 1. Update existing characters missing variant pairs
            for (const upd of updates) {
                try {
                    await api.updateHanCharacter(upd.id, upd);
                    editHanCharacter(upd.id, upd);
                    updated++;
                } catch {
                    updateFailed++;
                }
            }

            // 2. Create missing characters in batches
            const BATCH = 20;
            for (let i = 0; i < missing.length; i += BATCH) {
                const batch = missing.slice(i, i + BATCH);
                const results = await Promise.allSettled(
                    batch.map((item) =>
                        api.createHanCharacter({
                            hanSimplified: item.hanSimplified,
                            hanTraditional: item.hanTraditional,
                            pinyin: item.pinyin?.length > 0 ? item.pinyin : undefined,
                            jyutping: item.jyutping?.length > 0 ? item.jyutping : undefined,
                            sinoVietnamese: item.sinoVietnamese?.length > 0 ? item.sinoVietnamese : undefined,
                        }),
                    ),
                );
                const created = [];
                for (let j = 0; j < results.length; j++) {
                    const r = results[j];
                    if (r.status === "fulfilled") {
                        created.push(r.value);
                        added++;
                        if (batch[j].pinyin?.length > 0 || batch[j].jyutping?.length > 0) withReadings++;
                    } else {
                        failed++;
                    }
                }
                if (created.length > 0) {
                    mergeHanCharacters(created);
                }
            }
        } catch (err) {
            logError("Sync han chars from words failed", err instanceof Error ? err.message : String(err));
        }
        setResult({ added, failed, updated, updateFailed, withReadings, total: actionCount });
        setSyncing(false);
    }, [missing, updates, actionCount, mergeHanCharacters, editHanCharacter]);

    const missingWithReadings = useMemo(
        () => missing.filter((m) => m.pinyin?.length > 0 || m.jyutping?.length > 0).length,
        [missing],
    );

    if (actionCount === 0 && !result) {
        return (
            <button
                type="button"
                className="w-full text-left px-3 py-2.5 rounded-lg border border-border bg-surface opacity-40 cursor-not-allowed"
                disabled
                title="All Chinese characters already exist"
            >
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-text-muted">Vocabularies → Chinese Characters</span>
                    <span className="text-xs text-text-muted tabular-nums">0</span>
                </div>
                <p className="text-[0.6875rem] text-text-muted mt-0.5">Fully synced</p>
            </button>
        );
    }

    return (
        <>
            <button
                type="button"
                className="w-full text-left px-3 py-2.5 rounded-lg border border-accent-border bg-accent-bg/20 hover:bg-accent-bg/40 transition-colors"
                onClick={() => setShowModal(true)}
            >
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-accent">
                        {syncing ? "Adding..." : "Vocabularies → Chinese Characters"}
                    </span>
                    <span className="text-xs text-accent tabular-nums font-semibold">
                        {syncing ? "..." : `+${actionCount}`}
                    </span>
                </div>
                <p className="text-[0.6875rem] text-text-muted mt-0.5">Not yet in list</p>
            </button>

            {showModal &&
                createPortal(
                    <div
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
                        onClick={() => setShowModal(false)}
                    >
                        <div
                            className="bg-surface border border-border rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                                <h3 className="m-0 text-lg font-semibold text-text-h">
                                    Sync from Vocabularies ({actionCount})
                                </h3>
                                <button
                                    type="button"
                                    className="text-text-muted hover:text-text-h text-xl leading-none px-1"
                                    onClick={() => setShowModal(false)}
                                >
                                    ×
                                </button>
                            </div>

                            <div className="p-5 overflow-auto flex-1">
                                {result ? (
                                    <div className="text-sm">
                                        <p className="text-green-600 dark:text-green-400 font-medium">
                                            Added {result.added} characters
                                            {result.withReadings > 0 && (
                                                <span className="text-blue-600 dark:text-blue-400 ml-1">
                                                    ({result.withReadings} with readings)
                                                </span>
                                            )}
                                        </p>
                                        {result.updated > 0 && (
                                            <p className="text-green-600 dark:text-green-400 mt-1">
                                                Updated {result.updated} existing characters (added variant pairs)
                                            </p>
                                        )}
                                        {result.failed > 0 && (
                                            <p className="text-red-500 mt-1">{result.failed} failed</p>
                                        )}
                                    </div>
                                ) : (
                                    <>
                                        <p className="text-sm text-text-muted mb-3">
                                            Chinese characters found in vocabularies but not yet in the list:
                                        </p>
                                        <div className="flex flex-wrap gap-1.5 max-h-60 overflow-auto">
                                            {missing.map((item) => {
                                                const hasVariant =
                                                    item.hanTraditional &&
                                                    item.hanSimplified &&
                                                    item.hanTraditional !== item.hanSimplified;
                                                const hasReadings =
                                                    item.pinyin?.length > 0 || item.jyutping?.length > 0;
                                                return (
                                                    <span
                                                        key={item.hanSimplified + (item.hanTraditional || "")}
                                                        className="inline-flex items-center justify-center rounded-lg border border-border bg-bg text-lg font-medium px-1.5"
                                                        title={
                                                            (hasVariant
                                                                ? `${item.hanTraditional}/${item.hanSimplified}`
                                                                : item.hanSimplified) +
                                                            (item.pinyin?.length ? ` ${item.pinyin[0]}` : "") +
                                                            (item.jyutping?.length ? ` ${item.jyutping[0]}` : "")
                                                        }
                                                    >
                                                        {hasVariant ? (
                                                            <span className="flex gap-0.5">
                                                                <span className="text-red-600 dark:text-red-400">
                                                                    {item.hanTraditional}
                                                                </span>
                                                                <span className="text-text-muted text-sm">/</span>
                                                                <span className="text-blue-600 dark:text-blue-400">
                                                                    {item.hanSimplified}
                                                                </span>
                                                            </span>
                                                        ) : (
                                                            item.hanSimplified
                                                        )}
                                                        {hasReadings && (
                                                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 ml-1 flex-shrink-0" />
                                                        )}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
                                <button type="button" className={btnClass("ghost")} onClick={() => setShowModal(false)}>
                                    Close
                                </button>
                                {!result && (
                                    <button
                                        type="button"
                                        className={btnClass("primary")}
                                        onClick={handleSync}
                                        disabled={syncing}
                                    >
                                        {syncing
                                            ? "Syncing..."
                                            : `Sync ${actionCount} items${missingWithReadings > 0 ? ` (${missingWithReadings} with readings)` : ""}`}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>,
                    document.body,
                )}
        </>
    );
}
