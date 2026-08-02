import { useCallback, useState } from "react";
import { LoadingButton } from "./LoadingButton.jsx";
import { useLocale } from "../store/localeStore.js";
import { useAppActions, useVocabularyCount } from "../store/appStore.js";
import { btnClass } from "./ui/buttonStyles.js";
import { IconClose } from "./NavIcons.jsx";

export function PinyinSyncButton() {
    const { t } = useLocale();
    const wordCount = useVocabularyCount();
    const { syncPinyinAll } = useAppActions();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [result, setResult] = useState(null);
    const [confirmOpen, setConfirmOpen] = useState(false);

    const runSync = useCallback(async () => {
        setConfirmOpen(false);
        setLoading(true);
        setError("");
        setResult(null);
        try {
            const res = await syncPinyinAll();
            setResult(res);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }, [syncPinyinAll]);

    const disabled = wordCount === 0;

    return (
        <>
            <LoadingButton
                type="button"
                className={btnClass("ghost")}
                disabled={disabled}
                loading={loading}
                onClick={() => setConfirmOpen(true)}
            >
                {t.pinyinSync?.btn || "Sync Pinyin"}
            </LoadingButton>
            {error && <span className="text-error-text text-xs">{error}</span>}

            {confirmOpen && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
                    onClick={() => setConfirmOpen(false)}
                >
                    <div
                        className="w-full max-w-sm rounded-2xl bg-surface shadow-xl p-6 flex flex-col gap-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <p className="text-text-h font-semibold">Sync Pinyin</p>
                        <p className="text-sm text-text-muted">
                            Only fill pinyin for empty entries. Does not overwrite existing data.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button className={btnClass("ghost")} onClick={() => setConfirmOpen(false)}>
                                Cancel
                            </button>
                            <button className={btnClass("primary")} onClick={runSync}>
                                Sync
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {result && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
                    onClick={() => setResult(null)}
                >
                    <div
                        className="w-full max-w-sm rounded-2xl bg-surface shadow-xl p-6 flex flex-col gap-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between">
                            <p className="text-text-h font-semibold">Sync Pinyin — Complete</p>
                            <button
                                className="inline-flex items-center justify-center size-8 rounded-lg text-text-muted hover:bg-bg hover:text-text-h transition-colors"
                                onClick={() => setResult(null)}
                            >
                                <IconClose size={16} />
                            </button>
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-text-muted">Checked</span>
                                <span className="text-text-h font-semibold">{result.total.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-text-muted">Filled</span>
                                <span className="text-success-text font-semibold">
                                    {result.updated.toLocaleString()}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-text-muted">Skipped (could not generate pinyin)</span>
                                <span className="text-text-muted font-semibold">
                                    {(result.total - result.updated).toLocaleString()}
                                </span>
                            </div>
                            {result.skipped?.length > 0 && (
                                <div className="text-sm text-text-muted">
                                    <span className="font-medium">Skipped entries: </span>
                                    <span className="text-han">{result.skipped.join(", ")}</span>
                                </div>
                            )}
                        </div>
                        <button className={btnClass("primary")} onClick={() => setResult(null)}>
                            Close
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
