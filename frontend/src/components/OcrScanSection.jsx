import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useLocale } from "../store/localeStore.js";
import { useAppActions } from "../store/appStore.js";
import { api } from "../lib/api.js";
import { cn } from "../lib/cn.js";
import { btnClass } from "./ui/buttonStyles.js";
import { Button } from "./shadcn/button.jsx";
import { Checkbox } from "./shadcn/checkbox.jsx";
import { Spinner } from "./shadcn/spinner.jsx";
import { IconEdit } from "./NavIcons.jsx";

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
 * Hán tự theo ngôn ngữ quét OCR (2026-09-02): cantonese → đỏ (phồn thể HK),
 * mandarin → xanh (giản thể) — theo chuẩn màu page (§8.5).
 */
function OcrHan({ s, lang, className }) {
    if (lang === "mandarin") {
        return (
            <span className={cn("font-semibold leading-none text-han-simp", className)}>
                {s.hanSimplified || s.hanTraditional}
            </span>
        );
    }
    return (
        <span className={cn("font-semibold leading-none text-han-trad", className)}>
            {s.hanziTraditionalHk || s.hanTraditional}
        </span>
    );
}

/** Phiên âm theo ngôn ngữ quét OCR: mandarin → pinyin, cantonese → jyutping. */
function OcrReading({ s, lang, className }) {
    if (lang === "mandarin") {
        return <span className={cn("whitespace-nowrap text-pinyin", className)}>{s.pinyin || "-"}</span>;
    }
    return <span className={cn("whitespace-nowrap text-jyutping", className)}>{s.jyutping || "-"}</span>;
}

/** Chữ Hán hiển thị theo ngôn ngữ (dùng cho aria-label). */
function hanForLang(s, lang) {
    return lang === "mandarin" ? s.hanSimplified || s.hanTraditional : s.hanziTraditionalHk || s.hanTraditional;
}

/**
 * Sắp xếp kết quả quét: cụm **CHƯA có** trong kho lên trước, cụm **ĐÃ có** xuống dưới.
 * `Array.sort` là stable ⇒ trong mỗi nhóm vẫn giữ ĐÚNG thứ tự đọc được trong ảnh. (2026-09-27)
 * Đồng thời DEDUPE theo `cluster.key` (VD user sửa 1 cụm thành từ đã có trong danh sách →
 * tránh trùng key/item).
 */
function sortScanGroups(list) {
    const seen = new Set();
    const unique = [];
    for (const g of list) {
        const key = g.cluster?.key;
        if (key) {
            if (seen.has(key)) continue;
            seen.add(key);
        }
        unique.push(g);
    }
    return unique.sort((a, b) => Number(Boolean(a.cluster?.exists)) - Number(Boolean(b.cluster?.exists)));
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
    { engine, lang, onScanningChange, onAddingChange, onImageChange, onSelectionChange },
    ref,
) {
    const { t } = useLocale();
    const { createVocabularyAwait } = useAppActions();

    const [image, setImage] = useState(null);
    const [scanning, setScanning] = useState(false);
    const [error, setError] = useState(null);
    const [groups, setGroups] = useState([]); // [{ cluster }] — chỉ CỤM TỪ (2026-09-27: bỏ members)
    const [selected, setSelected] = useState(() => new Map()); // key -> suggestion (deduped)
    const [adding, setAdding] = useState(false);
    const [addedCount, setAddedCount] = useState(null);
    const [scanned, setScanned] = useState(false);

    // Inline correction of OCR misreads: which suggestion is being edited,
    // the current input text, and whether a derive request is in flight.
    const [editing, setEditing] = useState(null); // { gi, oldKey } — sửa chữ Hán của 1 cluster
    const [editText, setEditText] = useState("");
    const [deriving, setDeriving] = useState(false);

    const fileInputRef = useRef(null);

    const applyImage = useCallback(
        async (dataUrl) => {
            try {
                const processed = await normalizeForOcr(dataUrl);
                setImage(processed);
                setGroups([]);
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
        setAddedCount(null);
        setScanned(false);
        try {
            const base64 = image.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "");
            const res = await api.ocrVocabulary(base64, engine, lang);
            // Sắp xếp: chưa có (cần thêm) lên trước, đã có xuống dưới.
            const list = sortScanGroups(res.groups ?? []);
            setGroups(list);
            // ⚠️ 2026-09-27: AUTO-CHECK TẤT CẢ cluster (kể cả từ đã có trong kho) — từ đã có
            // hiện checked + disabledđể trạng thái nhất quán; nút "Thêm" chỉ đếm cụm CHƯA có.
            const init = new Map();
            list.forEach((g) => init.set(g.cluster.key, g.cluster));
            setSelected(init);
            setScanned(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : t.addWord.ocrError);
            setScanned(true);
        } finally {
            setScanning(false);
        }
    }, [image, scanning, engine, t]);

    /** Toggle a cluster suggestion in the selected map, deduped by key. */
    const toggleItem = useCallback((sug) => {
        setSelected((prev) => {
            const next = new Map(prev);
            if (next.has(sug.key)) next.delete(sug.key);
            else next.set(sug.key, sug);
            return next;
        });
    }, []);

    /** Enter edit mode for a cluster suggestion (gi = group index). */
    const startEdit = useCallback((gi, sug) => {
        setEditing({ gi, oldKey: sug.key });
        setEditText(sug.hanTraditional);
        setDeriving(false);
    }, []);

    const cancelEdit = useCallback(() => {
        setEditing(null);
        setEditText("");
        setDeriving(false);
    }, []);

    /**
     * Apply a corrected cluster suggestion (from the backend derive endpoint) to both the
     * groups list and the selection map. Selection follows the old key: if the
     * corrected word is new, re-select it; if it already exists, drop it.
     */
    const applyEdit = useCallback(
        (newSug) => {
            setEditing(null);
            setEditText("");
            setDeriving(false);
            // Map theo index TRƯỚC (editing.gi tính trên mảng hiện tại), rồi mới sort lại.
            const edited = groups.map((g, i) => (i === editing.gi ? { cluster: newSug } : g));
            setGroups(sortScanGroups(edited));
            setSelected((prev) => {
                const next = new Map(prev);
                next.delete(editing.oldKey);
                if (!newSug.exists) next.set(newSug.key, newSug);
                return next;
            });
        },
        [editing, groups],
    );

    /** Confirm the edited han text — ask the backend to re-derive the full suggestion. */
    const confirmEdit = useCallback(async () => {
        const text = editText.trim();
        if (!text || deriving || !editing) return;
        setDeriving(true);
        try {
            const sug = await api.ocrDerive(text, lang);
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

    // Unique selected items that aren't in the bank yet (chỉ cluster/cụm từ).
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
                await createVocabularyAwait(
                    {
                        id: crypto.randomUUID(),
                        ...vocab,
                        favorite: false,
                        mastered: false,
                        studyProgress: 0,
                    },
                    lang,
                );
                added += 1;
                createdKeys.add(s.key);
            } catch {
                // Skip failures individually so one bad entry doesn't block the rest.
            }
        }
        setAdding(false);
        setAddedCount(added);
        if (added > 0) {
            const next = sortScanGroups(
                groups.map((g) => ({
                    cluster: createdKeys.has(g.cluster.key) ? { ...g.cluster, exists: true } : g.cluster,
                })),
            );
            setGroups(next);
            // Giữ trạng thái nhất quán: từ ĐÃ CÓ = checked + disabled ⇒ sau khi thêm,
            // chọn lại toàn bộ cụm đã có (gồm cụm vừa tạo) → nút "Thêm" về 0.
            setSelected(new Map(next.filter((g) => g.cluster.exists).map((g) => [g.cluster.key, g.cluster])));
        }
    }, [selected, adding, createVocabularyAwait]);

    // Expose controls so the modal footer can drive the scan flow.
    const reset = useCallback(() => {
        setImage(null);
        setGroups([]);
        setSelected(new Map());
        setAddedCount(null);
        setError(null);
        setScanned(false);
        setEditing(null);
        setEditText("");
        setDeriving(false);
    }, []);
    const chooseFile = useCallback(() => fileInputRef.current?.click(), []);
    // ⚠️ 2026-09-27: nút "Thêm N từ vựng" đã chuyển xuống FOOTER của panel (OcrScanPanel) →
    // expose qua ref + báo số đã chọn lên parent (onSelectionChange).
    useImperativeHandle(ref, () => ({ reset, scan: handleScan, chooseFile, addSelected: handleAddSelected }));

    // Report selection count cho footer panel (nút "Thêm N từ vựng").
    useEffect(() => {
        onSelectionChange?.(selectedCount);
    }, [selectedCount, onSelectionChange]);

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
        <section
            className={cn(
                "flex min-h-0 flex-1 flex-col rounded-xl",
                !image
                    ? // ⚠️ 2026-09-02: chưa có ảnh → section CHÍNH LÀ dropzone (1 lớp duy nhất,
                      // không còn lớp bg-muted lồng ngoài; hover áp lên CẢ section, nút quét đẩy nhau).
                      "group relative cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-primary/25 bg-linear-to-b from-primary/10 to-card px-6 py-10 text-center transition-all hover:border-primary hover:shadow-lg dark:from-primary/5 dark:to-card dark:hover:border-primary items-center justify-center gap-4"
                    : "rounded-xl border border-border bg-muted p-4",
            )}
            onClick={!image ? () => fileInputRef.current?.click() : undefined}
            onDragOver={!image ? handleDragOver : undefined}
            onDrop={!image ? handleDrop : undefined}
            role={!image ? "button" : undefined}
            tabIndex={!image ? 0 : undefined}
            onKeyDown={
                !image
                    ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              fileInputRef.current?.click();
                          }
                      }
                    : undefined
            }
        >
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
                aria-hidden="true"
            />

            {!image && (
                <>
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
                </>
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
                            <span className="text-sm text-muted-foreground">
                                {ocr.ocrResults.replace("{count}", String(groups.length))}
                            </span>
                        </div>
                    </div>

                    {addedCount != null && (
                        <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                            {ocr.ocrAdded.replace("{count}", String(addedCount))}
                        </p>
                    )}

                    <ul className="flex flex-col gap-2">
                        {groups.map((g, gi) => {
                            const s = g.cluster;
                            const checked = selected.has(s.key);
                            return (
                                <li key={s.key} className="w-full">
                                    <div
                                        className={cn(
                                            "flex items-start gap-4 rounded-xl border-2 border-slate-300 bg-card px-4 py-3 shadow-lg transition-all dark:border-slate-600",
                                            !(s.exists || adding) && "hover:border-primary hover:shadow-xl",
                                        )}
                                    >
                                        {/* ⚠️ 2026-09-27: bấm cả hàng = toggle chọn; Checkbox là component
                                            shadcn (màu semantic, KHÔNG dùng slate thô như trước). Từ đã có trong
                                            kho → checked + DISABLED (vẫn hiện dấu ✓ để rõ trạng thái). */}
                                        <div
                                            className={cn(
                                                "flex min-w-0 flex-1 items-start gap-4",
                                                s.exists || adding ? "cursor-default" : "cursor-pointer",
                                            )}
                                            onClick={() => {
                                                if (!s.exists && !adding) toggleItem(s);
                                            }}
                                        >
                                            <Checkbox
                                                className={cn(
                                                    "mt-1 size-6 rounded-lg",
                                                    // Từ ĐÃ CÓ trong kho → checkbox màu MUTED (xám) để phân biệt với
                                                    // cụm mới (primary). ⚠️ PHẢI dùng `!`: base Checkbox có
                                                    // `dark:data-checked:bg-primary` (specificity cao hơn) → nếu không
                                                    // `!` thì dark mode vẫn hiện màu primary. (2026-09-27)
                                                    s.exists &&
                                                        "border-muted! data-checked:border-muted! data-checked:bg-muted! data-checked:text-muted-foreground!",
                                                )}
                                                checked={checked}
                                                disabled={s.exists || adding}
                                                onCheckedChange={() => toggleItem(s)}
                                                onClick={(e) => e.stopPropagation()}
                                                aria-label={hanForLang(s, lang)}
                                            />
                                            <div className="min-w-0 flex-1">
                                                {s.sinoVietnamese && (
                                                    <div className="mb-1 text-sm text-viet uppercase">
                                                        {s.sinoVietnamese}
                                                    </div>
                                                )}
                                                {editing && editing.gi === gi ? (
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
                                                        <OcrHan s={s} lang={lang} className="text-xl" />
                                                        {lang === "cantonese" && s.pureCantonese && (
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
                                                                    startEdit(gi, s);
                                                                }}
                                                                aria-label={ocr.ocrEditHan}
                                                                title={ocr.ocrEditHint}
                                                            >
                                                                <IconEdit size={13} />
                                                            </button>
                                                        )}
                                                        {s.exists || adding ? (
                                                            <span className="ml-auto inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                                                {ocr.ocrExists}
                                                            </span>
                                                        ) : (
                                                            <span className="ml-auto inline-flex shrink-0 items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-foreground">
                                                                {ocr.ocrNotExists}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                                <div className="mt-2">
                                                    <OcrReading s={s} lang={lang} className="text-sm" />
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
                                        </div>
                                    </div>
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
