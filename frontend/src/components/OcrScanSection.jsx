import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useLocale } from "../store/localeStore.js";
import { useAppActions } from "../store/appStore.js";
import { api } from "../lib/api.js";
import { cn } from "../lib/cn.js";
import { diffHanChars } from "../lib/hanScriptDisplay.js";
import { btnClass } from "./ui/buttonStyles.js";
import { Button } from "./shadcn/button.jsx";
import { ReadingPair } from "./ReadingPair.jsx";
import { Spinner } from "./shadcn/spinner.jsx";
import { IconChevronDown, IconEdit } from "./NavIcons.jsx";

/** Check icon for the suggestion checkbox. */
function CheckIcon({ size = 14, className }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
        >
            <polyline points="20 6 9 17 4 12" />
        </svg>
    );
}

/** Image/upload icon. */
function IconImage({ size = 20, className }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
        >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
        </svg>
    );
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(file);
    });
}

/**
 * Render the SIMPLIFIED form with per-character coloring (AGENTS.md §1.5):
 * characters identical to the traditional form stay RED (traditional), only
 * characters that genuinely differ (true simplified) are BLUE. Single chars
 * fall back to the same rule.
 */
function SimplifiedHan({ simplified, traditional, className }) {
    const diff = diffHanChars({ traditional, simplified });
    const chars = diff.simp.length
        ? diff.simp
        : [{ char: simplified, same: String(simplified) === String(traditional) }];
    return (
        <span className={className}>
            {chars.map((c, i) => (
                <span key={i} className={cn(c.same ? "text-han-trad" : "text-han-simp")}>
                    {c.char}
                </span>
            ))}
        </span>
    );
}

/**
 * Normalize the image for OCR before sending: only downscale VERY large images
 * (to keep the payload small). The RapidOCR engine (PP-OCRv6) reads images at
 * their native size well, and nearest-neighbor upscaling of small screenshots
 * introduces pixelation that misleads it (e.g. 千机伞 → 灰 + 千機). No
 * binarization either — that erodes thin strokes (千 → 十).
 */
function normalizeForOcr(dataUrl, { maxDim = 2000 } = {}) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const w = img.width;
            const h = img.height;
            if (!w || !h) {
                resolve(dataUrl);
                return;
            }
            const max = Math.max(w, h);
            if (max <= maxDim) {
                resolve(dataUrl);
                return;
            }
            const scale = maxDim / max;
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(w * scale);
            canvas.height = Math.round(h * scale);
            const ctx = canvas.getContext("2d");
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });
}

/**
 * Paste/upload an image → OCR → suggest new vocabulary entries.
 * Only reads suggestions from the backend; creation happens through the
 * standard create flow when the user confirms.
 */
export const OcrScanSection = forwardRef(function OcrScanSection(
    { engine, onScanningChange, onAddingChange, onImageChange },
    ref,
) {
    const { t } = useLocale();
    const { createVocabularyAwait } = useAppActions();

    const [image, setImage] = useState(null);
    const [scanning, setScanning] = useState(false);
    const [error, setError] = useState(null);
    const [groups, setGroups] = useState([]); // [{ cluster, members }]
    const [expanded, setExpanded] = useState(() => new Set()); // group indices
    const [selected, setSelected] = useState(() => new Map()); // key -> suggestion (deduped)
    const [adding, setAdding] = useState(false);
    const [addedCount, setAddedCount] = useState(null);
    const [scanned, setScanned] = useState(false);

    // Inline correction of OCR misreads: which suggestion is being edited,
    // the current input text, and whether a derive request is in flight.
    const [editing, setEditing] = useState(null); // { gi, mi|null, oldKey }
    const [editText, setEditText] = useState("");
    const [deriving, setDeriving] = useState(false);

    const fileInputRef = useRef(null);

    const applyImage = useCallback(
        async (dataUrl) => {
            try {
                const processed = await normalizeForOcr(dataUrl);
                setImage(processed);
                setGroups([]);
                setExpanded(new Set());
                setSelected(new Map());
                setError(null);
                setAddedCount(null);
                setScanned(false);
            } catch {
                setError(t.addWord.ocrError);
            }
        },
        [t],
    );

    // Global paste handler — Ctrl+V anywhere in the modal grabs an image.
    const handlePaste = useCallback(
        (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of items) {
                if (item.type && item.type.startsWith("image/")) {
                    const file = item.getAsFile();
                    if (file) {
                        e.preventDefault();
                        fileToDataUrl(file).then(applyImage);
                        return;
                    }
                }
            }
        },
        [applyImage],
    );

    useEffect(() => {
        document.addEventListener("paste", handlePaste);
        return () => document.removeEventListener("paste", handlePaste);
    }, [handlePaste]);

    const handleFileChange = useCallback(
        async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const url = await fileToDataUrl(file);
            await applyImage(url);
            if (fileInputRef.current) fileInputRef.current.value = "";
        },
        [applyImage],
    );

    // Drag & drop image onto the dropzone.
    const handleDrop = useCallback(
        (e) => {
            e.preventDefault();
            const file = e.dataTransfer?.files?.[0];
            if (file && file.type.startsWith("image/")) {
                fileToDataUrl(file).then(applyImage);
            }
        },
        [applyImage],
    );

    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    }, []);

    const handleScan = useCallback(async () => {
        if (!image || scanning) return;
        setScanning(true);
        setError(null);
        setGroups([]);
        setExpanded(new Set());
        setAddedCount(null);
        setScanned(false);
        try {
            const base64 = image.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "");
            const res = await api.ocrVocabulary(base64, engine);
            const list = res.groups ?? [];
            setGroups(list);
            // Default: select new (not-yet-in-bank) clusters; members are opt-in via expand.
            const init = new Map();
            list.forEach((g) => {
                if (!g.cluster.exists) init.set(g.cluster.key, g.cluster);
            });
            setSelected(init);
            setScanned(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : t.addWord.ocrError);
            setScanned(true);
        } finally {
            setScanning(false);
        }
    }, [image, scanning, engine, t]);

    /** Toggle any suggestion (cluster or member) in the selected map, deduped by key. */
    const toggleItem = useCallback((sug) => {
        setSelected((prev) => {
            const next = new Map(prev);
            if (next.has(sug.key)) next.delete(sug.key);
            else next.set(sug.key, sug);
            return next;
        });
    }, []);

    const toggleExpand = useCallback((index) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    }, []);

    /** Enter edit mode for a suggestion (gi = group index, mi = member index or null for the cluster). */
    const startEdit = useCallback((gi, mi, sug) => {
        setEditing({ gi, mi, oldKey: sug.key });
        setEditText(sug.hanTraditional);
        setDeriving(false);
    }, []);

    const cancelEdit = useCallback(() => {
        setEditing(null);
        setEditText("");
        setDeriving(false);
    }, []);

    /**
     * Apply a corrected suggestion (from the backend derive endpoint) to both the
     * groups list and the selection map. Selection follows the old key: if the
     * corrected word is new, re-select it; if it already exists, drop it.
     */
    const applyEdit = useCallback(
        (newSug) => {
            setEditing(null);
            setEditText("");
            setDeriving(false);
            setGroups((cur) =>
                cur.map((g, i) => {
                    if (i !== editing.gi) return g;
                    const cluster = editing.mi === null ? newSug : g.cluster;
                    const members =
                        editing.mi === null ? g.members : g.members.map((m, j) => (j === editing.mi ? newSug : m));
                    return { cluster, members };
                }),
            );
            setSelected((prev) => {
                const next = new Map(prev);
                next.delete(editing.oldKey);
                if (!newSug.exists) next.set(newSug.key, newSug);
                return next;
            });
        },
        [editing],
    );

    /** Confirm the edited han text — ask the backend to re-derive the full suggestion. */
    const confirmEdit = useCallback(async () => {
        const text = editText.trim();
        if (!text || deriving || !editing) return;
        setDeriving(true);
        try {
            const sug = await api.ocrDerive(text);
            applyEdit(sug);
        } catch {
            setDeriving(false);
            setError(t.addWord.ocrError);
        }
    }, [editText, deriving, editing, applyEdit, t]);

    /** Update edit text + Enter-to-confirm / Escape-to-cancel from the inline input. */
    const handleEditKeyDown = useCallback(
        (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                confirmEdit();
            } else if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
            }
        },
        [confirmEdit, cancelEdit],
    );

    const newClusters = groups.filter((g) => !g.cluster.exists);
    const allSelected = newClusters.length > 0 && newClusters.every((g) => selected.has(g.cluster.key));

    const toggleAll = useCallback(() => {
        setSelected((prev) => {
            const next = new Map(prev);
            const allNew = groups.filter((g) => !g.cluster.exists);
            const allChosen = allNew.length > 0 && allNew.every((g) => next.has(g.cluster.key));
            if (allChosen) {
                allNew.forEach((g) => next.delete(g.cluster.key));
            } else {
                allNew.forEach((g) => next.set(g.cluster.key, g.cluster));
            }
            return next;
        });
    }, [groups]);

    // All member words (inside clusters) that aren't in the bank yet, deduped by key.
    const newMembers = [];
    {
        const seen = new Set();
        for (const g of groups) {
            for (const m of g.members) {
                if (m.exists || seen.has(m.key)) continue;
                seen.add(m.key);
                newMembers.push(m);
            }
        }
    }
    const allMembersSelected = newMembers.length > 0 && newMembers.every((m) => selected.has(m.key));

    // One-click select/deselect of every new (not-yet-in-bank) individual word.
    const toggleAllMembers = useCallback(() => {
        setSelected((prev) => {
            const next = new Map(prev);
            const allChosen = newMembers.length > 0 && newMembers.every((m) => next.has(m.key));
            if (allChosen) {
                newMembers.forEach((m) => next.delete(m.key));
            } else {
                newMembers.forEach((m) => next.set(m.key, m));
            }
            return next;
        });
    }, [newMembers]);

    // Unique selected items that aren't in the bank yet (clusters + expanded members).
    const selectedCount = [...selected.values()].filter((s) => !s.exists).length;

    const handleAddSelected = useCallback(async () => {
        const targets = [...selected.values()].filter((s) => !s.exists);
        if (!targets.length || adding) return;
        setAdding(true);
        setError(null);
        let added = 0;
        const createdKeys = new Set();
        for (const s of targets) {
            const { key: _key, ...vocab } = s;
            try {
                await createVocabularyAwait({
                    id: crypto.randomUUID(),
                    ...vocab,
                    important: false,
                    mastered: false,
                    studyProgress: 0,
                });
                added += 1;
                createdKeys.add(s.key);
            } catch {
                // Skip failures individually so one bad entry doesn't block the rest.
            }
        }
        setAdding(false);
        setAddedCount(added);
        if (added > 0) {
            setGroups((cur) =>
                cur.map((g) => ({
                    cluster: createdKeys.has(g.cluster.key) ? { ...g.cluster, exists: true } : g.cluster,
                    members: g.members.map((m) => (createdKeys.has(m.key) ? { ...m, exists: true } : m)),
                })),
            );
            setSelected(new Map());
        }
    }, [selected, adding, createVocabularyAwait]);

    // Expose controls so the modal footer can drive the scan flow.
    const reset = useCallback(() => {
        setImage(null);
        setGroups([]);
        setExpanded(new Set());
        setSelected(new Map());
        setAddedCount(null);
        setError(null);
        setScanned(false);
        setEditing(null);
        setEditText("");
        setDeriving(false);
    }, []);
    const chooseFile = useCallback(() => fileInputRef.current?.click(), []);
    useImperativeHandle(ref, () => ({ reset, scan: handleScan, chooseFile }));

    // Report image presence to the parent (footer disables "Scan" until an image is loaded).
    useEffect(() => {
        onImageChange?.(Boolean(image));
    }, [image, onImageChange]);

    // Report busy flags to the parent so the footer buttons can disable + show a spinner.
    useEffect(() => {
        onScanningChange?.(scanning);
    }, [scanning, onScanningChange]);
    useEffect(() => {
        onAddingChange?.(adding);
    }, [adding, onAddingChange]);

    const ocr = t.addWord;

    return (
        <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-muted p-4">
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
                aria-hidden="true"
            />

            {!image && (
                <div
                    className="group relative flex min-h-0 flex-1 cursor-pointer flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl border-2 border-dashed border-primary/25 bg-linear-to-b from-primary/10 to-card px-6 py-10 text-center transition-all hover:border-primary hover:shadow-lg dark:from-primary/5 dark:to-card dark:hover:border-primary"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            fileInputRef.current?.click();
                        }
                    }}
                >
                    {/* Decorative blurred color blobs for depth */}
                    <span
                        aria-hidden="true"
                        className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full bg-primary/15 blur-2xl"
                    />
                    <span
                        aria-hidden="true"
                        className="pointer-events-none absolute -bottom-12 -left-8 size-28 rounded-full bg-purple/15 blur-2xl"
                    />
                    <span className="grid size-16 shrink-0 place-items-center rounded-full bg-linear-to-br from-primary to-purple text-white shadow-[0_8px_20px_rgb(124_58_237/35%)] transition-transform duration-200 group-hover:scale-105">
                        <IconImage size={30} />
                    </span>
                    <div className="flex flex-col items-center gap-1">
                        <p className="text-base font-semibold text-foreground">{ocr.ocrEmptyTitle}</p>
                        <p className="text-sm text-muted-foreground">{ocr.ocrEmptyHint}</p>
                    </div>
                </div>
            )}

            {image && (
                <div
                    className={cn(
                        "flex flex-col gap-4",
                        groups.length === 0 && "min-h-0 flex-1 items-center justify-center",
                    )}
                >
                    <div className="relative flex h-56 w-fit max-h-full max-w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-card">
                        <img src={image} alt="" className="max-h-full max-w-full object-contain" />
                    </div>
                </div>
            )}

            {error && <p className="mt-2 text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}

            {groups.length > 0 && (
                <div className="mt-4 flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
                                <input
                                    type="checkbox"
                                    className="size-4 cursor-pointer accent-primary"
                                    checked={allSelected}
                                    onChange={toggleAll}
                                />
                                {ocr.ocrSelectAll}
                            </label>
                            <label
                                className={cn(
                                    "inline-flex items-center gap-2 text-sm",
                                    newMembers.length > 0
                                        ? "cursor-pointer text-foreground"
                                        : "cursor-not-allowed text-muted-foreground",
                                )}
                            >
                                <input
                                    type="checkbox"
                                    className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed"
                                    checked={allMembersSelected}
                                    onChange={toggleAllMembers}
                                    disabled={newMembers.length === 0}
                                />
                                {ocr.ocrSelectNewMembers.replace("{count}", String(newMembers.length))}
                            </label>
                            <span className="text-sm text-muted-foreground">
                                {ocr.ocrResults.replace("{count}", String(groups.length))}
                            </span>
                        </div>
                        <button
                            type="button"
                            className={btnClass("success")}
                            onClick={handleAddSelected}
                            disabled={adding || selectedCount === 0}
                        >
                            {adding ? ocr.ocrAdding : ocr.ocrAddSelected.replace("{count}", String(selectedCount))}
                        </button>
                    </div>

                    {addedCount != null && (
                        <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                            {ocr.ocrAdded.replace("{count}", String(addedCount))}
                        </p>
                    )}

                    <ul className="flex flex-col gap-2">
                        {groups.map((g, gi) => {
                            const s = g.cluster;
                            const hasSimp = s.hanSimplified && s.hanSimplified !== s.hanTraditional;
                            const checked = selected.has(s.key);
                            const isExpanded = expanded.has(gi);
                            const canExpand = g.members.length > 0;
                            return (
                                <li key={s.key} className="w-full">
                                    <div
                                        className={cn(
                                            "flex items-start gap-4 rounded-xl border-2 border-slate-300 bg-card px-4 py-3 shadow-lg transition-all dark:border-slate-600",
                                            !(s.exists || adding) && "hover:border-primary hover:shadow-xl",
                                        )}
                                    >
                                        <label
                                            className={cn(
                                                "flex min-w-0 flex-1 cursor-pointer items-start gap-4",
                                                (s.exists || adding) && "cursor-default",
                                            )}
                                        >
                                            <input
                                                type="checkbox"
                                                className="peer sr-only"
                                                checked={checked}
                                                disabled={s.exists || adding}
                                                onChange={() => toggleItem(s)}
                                                aria-label={`${s.hanTraditional} ${s.pinyin} ${s.jyutping}`}
                                            />
                                            {!(s.exists || adding) && (
                                                <span
                                                    aria-hidden="true"
                                                    className={cn(
                                                        "mt-1 grid size-6 shrink-0 place-items-center rounded-lg border-2 transition-colors",
                                                        checked
                                                            ? "border-primary bg-primary text-white"
                                                            : "border-slate-400 bg-background text-transparent dark:border-slate-500",
                                                    )}
                                                >
                                                    <CheckIcon size={16} />
                                                </span>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                {s.sinoVietnamese && (
                                                    <div className="mb-1 text-sm text-viet uppercase">
                                                        {s.sinoVietnamese}
                                                    </div>
                                                )}
                                                {editing && editing.gi === gi && editing.mi === null ? (
                                                    <div
                                                        className="flex w-full flex-wrap items-center gap-2"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <input
                                                            value={editText}
                                                            onChange={(e) => setEditText(e.target.value)}
                                                            onKeyDown={handleEditKeyDown}
                                                            autoFocus
                                                            disabled={deriving}
                                                            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1 text-base font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                                            aria-label={ocr.ocrEditHan}
                                                            placeholder={ocr.ocrEditPlaceholder}
                                                        />
                                                        <button
                                                            type="button"
                                                            className={btnClass("primary", "sm")}
                                                            onClick={confirmEdit}
                                                            disabled={deriving || !editText.trim()}
                                                        >
                                                            {deriving ? (
                                                                <Spinner className="size-3.5" />
                                                            ) : (
                                                                ocr.ocrEditSave
                                                            )}
                                                        </button>
                                                        <Button
                                                            type="button"
                                                            variant="destructive"
                                                            size="sm"
                                                            onClick={cancelEdit}
                                                            disabled={deriving}
                                                        >
                                                            {ocr.ocrEditCancel}
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                        {hasSimp && (
                                                            <SimplifiedHan
                                                                simplified={s.hanSimplified}
                                                                traditional={s.hanTraditional}
                                                                className="text-xl font-semibold leading-none"
                                                            />
                                                        )}
                                                        <span className="text-xl font-semibold leading-none text-han-trad">
                                                            {s.hanTraditional}
                                                        </span>
                                                        {s.pureCantonese && (
                                                            <span className="inline-flex shrink-0 items-center rounded-full bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-cyan-600 dark:text-cyan-400">
                                                                {ocr.ocrPureCantonese}
                                                            </span>
                                                        )}
                                                        {!s.exists && !adding && (
                                                            <button
                                                                type="button"
                                                                className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    startEdit(gi, null, s);
                                                                }}
                                                                aria-label={ocr.ocrEditHan}
                                                                title={ocr.ocrEditHint}
                                                            >
                                                                <IconEdit size={13} />
                                                            </button>
                                                        )}
                                                        {s.exists || adding ? (
                                                            <span className="ml-auto inline-flex shrink-0 items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                                                {ocr.ocrExists}
                                                            </span>
                                                        ) : (
                                                            <span className="ml-auto inline-flex shrink-0 items-center text-xs font-medium text-primary">
                                                                {ocr.ocrNotExists}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                                <div className="mt-2">
                                                    <ReadingPair
                                                        left={s.pinyin}
                                                        right={s.jyutping}
                                                        containerClass="grid-cols-[auto_auto_auto] w-auto max-w-none mx-0 justify-start gap-2 text-sm"
                                                        leftClass="text-pinyin"
                                                        rightClass="text-jyutping"
                                                        fallbackClass="italic text-muted-foreground"
                                                    />
                                                </div>
                                                {(s.vietMeanings || s.engMeanings) && (
                                                    <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2 text-sm">
                                                        {s.vietMeanings && (
                                                            <span className="text-muted-foreground">
                                                                {s.vietMeanings}
                                                            </span>
                                                        )}
                                                        {s.engMeanings && (
                                                            <span className="text-muted-foreground">
                                                                {s.engMeanings}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </label>
                                        {canExpand && (
                                            <button
                                                type="button"
                                                className="mt-1 inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                                                onClick={() => toggleExpand(gi)}
                                                aria-label={isExpanded ? ocr.collapse : ocr.ocrExpand}
                                                aria-expanded={isExpanded}
                                            >
                                                <IconChevronDown
                                                    size={16}
                                                    className={cn(
                                                        "transition-transform duration-200",
                                                        isExpanded && "rotate-180",
                                                    )}
                                                />
                                            </button>
                                        )}
                                    </div>

                                    {isExpanded && canExpand && (
                                        <div className="mt-2 flex flex-col gap-1 pl-9">
                                            <p className="px-1 text-xs font-medium text-muted-foreground">
                                                {ocr.ocrMembers}
                                            </p>
                                            {g.members.map((m, mi) => {
                                                const mSimp = m.hanSimplified && m.hanSimplified !== m.hanTraditional;
                                                const mChecked = selected.has(m.key);
                                                return (
                                                    <label
                                                        key={m.key}
                                                        className={cn(
                                                            "flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background px-3 py-2 transition-colors",
                                                            m.exists || adding
                                                                ? "cursor-default"
                                                                : "cursor-pointer hover:border-primary",
                                                        )}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            className="peer sr-only"
                                                            checked={mChecked}
                                                            disabled={m.exists || adding}
                                                            onChange={() => toggleItem(m)}
                                                            aria-label={`${m.hanTraditional} ${m.pinyin} ${m.jyutping}`}
                                                        />
                                                        {!(m.exists || adding) && (
                                                            <span
                                                                aria-hidden="true"
                                                                className={cn(
                                                                    "mt-1 grid size-5 shrink-0 place-items-center rounded-md border-2 transition-colors",
                                                                    mChecked
                                                                        ? "border-primary bg-primary text-white"
                                                                        : "border-slate-400 bg-card text-transparent dark:border-slate-500",
                                                                )}
                                                            >
                                                                <CheckIcon size={14} />
                                                            </span>
                                                        )}
                                                        <div className="min-w-0 flex-1">
                                                            {m.sinoVietnamese && (
                                                                <div className="mb-0.5 text-xs text-viet uppercase">
                                                                    {m.sinoVietnamese}
                                                                </div>
                                                            )}
                                                            {editing && editing.gi === gi && editing.mi === mi ? (
                                                                <div
                                                                    className="flex w-full flex-wrap items-center gap-2"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    <input
                                                                        value={editText}
                                                                        onChange={(e) => setEditText(e.target.value)}
                                                                        onKeyDown={handleEditKeyDown}
                                                                        autoFocus
                                                                        disabled={deriving}
                                                                        className="min-w-0 flex-1 rounded-lg border border-border bg-card px-2 py-1 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                                                        aria-label={ocr.ocrEditHan}
                                                                        placeholder={ocr.ocrEditPlaceholder}
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        className={btnClass("primary", "sm")}
                                                                        onClick={confirmEdit}
                                                                        disabled={deriving || !editText.trim()}
                                                                    >
                                                                        {deriving ? (
                                                                            <Spinner className="size-3" />
                                                                        ) : (
                                                                            ocr.ocrEditSave
                                                                        )}
                                                                    </button>
                                                                    <Button
                                                                        type="button"
                                                                        variant="destructive"
                                                                        size="sm"
                                                                        onClick={cancelEdit}
                                                                        disabled={deriving}
                                                                    >
                                                                        {ocr.ocrEditCancel}
                                                                    </Button>
                                                                </div>
                                                            ) : (
                                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                                    {mSimp && (
                                                                        <SimplifiedHan
                                                                            simplified={m.hanSimplified}
                                                                            traditional={m.hanTraditional}
                                                                            className="text-base font-semibold leading-none"
                                                                        />
                                                                    )}
                                                                    <span className="text-base font-semibold leading-none text-han-trad">
                                                                        {m.hanTraditional}
                                                                    </span>
                                                                    {m.pureCantonese && (
                                                                        <span className="inline-flex shrink-0 items-center rounded-full bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-cyan-600 dark:text-cyan-400">
                                                                            {ocr.ocrPureCantonese}
                                                                        </span>
                                                                    )}
                                                                    {!m.exists && !adding && (
                                                                        <button
                                                                            type="button"
                                                                            className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                                                                            onClick={(e) => {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();
                                                                                startEdit(gi, mi, m);
                                                                            }}
                                                                            aria-label={ocr.ocrEditHan}
                                                                            title={ocr.ocrEditHint}
                                                                        >
                                                                            <IconEdit size={11} />
                                                                        </button>
                                                                    )}
                                                                    {m.exists || adding ? (
                                                                        <span className="ml-auto inline-flex shrink-0 items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                                                            {ocr.ocrExists}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="ml-auto inline-flex shrink-0 items-center text-xs font-medium text-primary">
                                                                            {ocr.ocrNotExists}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                            <div className="mt-1">
                                                                <ReadingPair
                                                                    left={m.pinyin}
                                                                    right={m.jyutping}
                                                                    containerClass="grid-cols-[auto_auto_auto] w-auto max-w-none mx-0 justify-start gap-2 text-xs"
                                                                    leftClass="text-pinyin"
                                                                    rightClass="text-jyutping"
                                                                    fallbackClass="italic text-muted-foreground"
                                                                />
                                                            </div>
                                                            {(m.vietMeanings || m.engMeanings) && (
                                                                <div className="mt-1 flex flex-col gap-0.5 text-xs">
                                                                    {m.vietMeanings && (
                                                                        <span className="text-muted-foreground">
                                                                            {m.vietMeanings}
                                                                        </span>
                                                                    )}
                                                                    {m.engMeanings && (
                                                                        <span className="text-muted-foreground">
                                                                            {m.engMeanings}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {scanned && !scanning && groups.length === 0 && image && (
                <p className="mt-2 text-sm text-muted-foreground">{ocr.ocrNoResult}</p>
            )}
        </section>
    );
});
