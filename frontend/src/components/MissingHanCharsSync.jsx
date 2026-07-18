import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api.js";
import { logError } from "../lib/actionLog.js";
import { findMissingHanChars } from "../lib/hanCharExtract.js";
import { useAppActions, useDataHydrated, useHanCharacters, useWords } from "../store/appStore.js";
import { btnClass } from "./ui/buttonStyles.js";

export function MissingHanCharsSync() {
    const words = useWords();
    const hanCharacters = useHanCharacters();
    const hydrated = useDataHydrated();
    const { mergeHanCharacters } = useAppActions();

    const [syncing, setSyncing] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [result, setResult] = useState(null);

    const missing = useMemo(
        () => (hydrated ? findMissingHanChars(words, hanCharacters) : []),
        [words, hanCharacters, hydrated],
    );

    // Don't show anything until data is loaded
    if (!hydrated) return null;

    const handleSync = useCallback(async () => {
        if (missing.length === 0) return;
        setSyncing(true);
        setResult(null);
        let added = 0;
        let failed = 0;
        try {
            // Add in batches to avoid overwhelming the API
            const BATCH = 20;
            for (let i = 0; i < missing.length; i += BATCH) {
                const batch = missing.slice(i, i + BATCH);
                const results = await Promise.allSettled(
                    batch.map((ch) =>
                        api.createHanCharacter({
                            hanSimplified: ch,
                            hanViet: undefined,
                        }),
                    ),
                );
                const created = [];
                for (const r of results) {
                    if (r.status === "fulfilled") {
                        created.push(r.value);
                        added++;
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
        setResult({ added, failed, total: missing.length });
        setSyncing(false);
    }, [missing, mergeHanCharacters]);

    if (missing.length === 0 && !result) {
        return (
            <button
                type="button"
                className="w-full text-left px-3 py-2.5 rounded-lg border border-border bg-surface opacity-40 cursor-not-allowed"
                disabled
                title="Tất cả chữ Hán đã có"
            >
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-text-muted">Từ vựng → Hán tự</span>
                    <span className="text-xs text-text-muted tabular-nums">0</span>
                </div>
                <p className="text-[0.6875rem] text-text-muted mt-0.5">Đã đồng bộ đủ</p>
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
                        {syncing ? "Đang thêm..." : "Từ vựng → Hán tự"}
                    </span>
                    <span className="text-xs text-accent tabular-nums font-semibold">
                        {syncing ? "..." : `+${missing.length}`}
                    </span>
                </div>
                <p className="text-[0.6875rem] text-text-muted mt-0.5">Chưa có trong danh sách</p>
            </button>

            {showModal && createPortal(
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
                                Chữ Hán chưa có ({missing.length})
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
                                        Đã thêm {result.added} chữ Hán
                                    </p>
                                    {result.failed > 0 && <p className="text-red-500 mt-1">{result.failed} thất bại</p>}
                                </div>
                            ) : (
                                <>
                                    <p className="text-sm text-text-muted mb-3">
                                        Các chữ Hán xuất hiện trong Từ vựng nhưng chưa có trong danh sách:
                                    </p>
                                    <div className="flex flex-wrap gap-1.5 max-h-60 overflow-auto">
                                        {missing.map((ch) => (
                                            <span
                                                key={ch}
                                                className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-border bg-bg text-lg font-medium"
                                            >
                                                {ch}
                                            </span>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
                            <button type="button" className={btnClass("ghost")} onClick={() => setShowModal(false)}>
                                Đóng
                            </button>
                            {!result && (
                                <button
                                    type="button"
                                    className={btnClass("primary")}
                                    onClick={handleSync}
                                    disabled={syncing}
                                >
                                    {syncing ? "Đang thêm..." : `Thêm ${missing.length} chữ Hán`}
                                </button>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
