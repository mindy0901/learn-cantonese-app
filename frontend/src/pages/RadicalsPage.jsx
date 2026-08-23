import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../store/localeStore.js";
import { useIsSignedIn } from "../store/authStore.js";
import { cn } from "../lib/cn.js";
import { speak } from "../lib/speech.js";
import { api } from "../lib/api.js";
import { strokeOrderRules, strokeOrderNote } from "../data/radicals.js";
import { Button } from "../components/shadcn/button.jsx";
import { Badge } from "../components/shadcn/badge.jsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/shadcn/dialog.jsx";

const KNOWN_KEY = "learn-cantonese:radicals-known";

/* ── Tiny inline SVG icons (không dùng emoji — theo design system) ── */
function Svg({ className, size = 18, children, strokeWidth = 2 }) {
    return (
        <svg
            className={className}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            {children}
        </svg>
    );
}

const IconChevronLeft = (p) => (
    <Svg {...p}>
        <path d="m15 18-6-6 6-6" />
    </Svg>
);
const IconChevronRight = (p) => (
    <Svg {...p}>
        <path d="m9 18 6-6-6-6" />
    </Svg>
);
const IconShuffle = (p) => (
    <Svg {...p}>
        <path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.8-1.1 2-1.7 3.3-1.7H22" />
        <path d="m18 2 4 4-4 4" />
        <path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2" />
        <path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8" />
        <path d="m18 14 4 4-4 4" />
    </Svg>
);
const IconPlay = (p) => (
    <Svg {...p}>
        <polygon points="6 3 20 12 6 21 6 3" />
    </Svg>
);
const IconPause = (p) => (
    <Svg {...p}>
        <rect x="6" y="4" width="4" height="16" rx="1" />
        <rect x="14" y="4" width="4" height="16" rx="1" />
    </Svg>
);
const IconSettings = (p) => (
    <Svg {...p}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Svg>
);
const IconSpeaker = (p) => (
    <Svg {...p}>
        <path d="M11 5 6 9H2v6h4l5 4z" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </Svg>
);
const IconMouseClick = (p) => (
    <Svg {...p}>
        <path d="M9 9c0-3.3 2.7-6 6-6s6 2.7 6 6a6 6 0 0 1-6 6c-1.3 0-2.5-.4-3.5-1.1L9 15l-3 3-2-2 3-3-1.1-1.5C5.4 11.5 9 11 9 9z" />
        <path d="M4 20l3-3" />
    </Svg>
);
const IconCheck = (p) => (
    <Svg {...p}>
        <path d="M20 6 9 17l-5-5" />
    </Svg>
);
const IconLayers = (p) => (
    <Svg {...p}>
        <path d="m12 2 10 5.5-10 5.5L2 7.5z" />
        <path d="m2 12.5 10 5.5 10-5.5" />
        <path d="m2 17.5 10 5.5 10-5.5" />
    </Svg>
);
const IconPrinter = (p) => (
    <Svg {...p}>
        <path d="M6 9V3h12v6" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" rx="1" />
    </Svg>
);
const IconPenTool = (p) => (
    <Svg {...p}>
        <path d="M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414z" />
        <path d="m18 13-1.375-6.874a1 1 0 0 0-.746-.776L3.235 2.028a1 1 0 0 0-1.207 1.207L5.35 15.879a1 1 0 0 0 .776.746L13 18" />
        <path d="m2.3 2.3 7.286 7.286" />
        <circle cx="11" cy="11" r="2" />
    </Svg>
);
const IconClose = (p) => (
    <Svg {...p}>
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
    </Svg>
);

/* ── Helpers ── */

// Helper phát âm dùng chung: ../lib/speech.js (speak, loadVoices, pickZhVoice)

function loadKnown() {
    try {
        const raw = JSON.parse(localStorage.getItem(KNOWN_KEY) || "[]");
        if (Array.isArray(raw)) return new Set(raw.map(Number).filter(Boolean));
    } catch {
        /* ignore */
    }
    return new Set();
}
function persistKnown(set) {
    try {
        localStorage.setItem(KNOWN_KEY, JSON.stringify([...set]));
    } catch {
        /* ignore */
    }
}

const AUTOPLAY_SPEEDS = [2, 3, 5];

export function RadicalsPage() {
    const { t, fmt } = useLocale();
    const isSignedIn = useIsSignedIn();

    const [groups, setGroups] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);

    const loadRadicals = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const data = await api.fetchRadicals();
            setGroups(Array.isArray(data?.groups) ? data.groups : []);
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadRadicals();
    }, [loadRadicals]);

    const allRadicals = useMemo(() => (groups ?? []).flatMap((g) => g.radicals), [groups]);
    const groupsTotal = useMemo(() => allRadicals.length, [allRadicals]);
    const byNo = useMemo(() => new Map(allRadicals.map((r) => [r.no, r])), [allRadicals]);

    const [order, setOrder] = useState(() => []);
    const [index, setIndex] = useState(0);
    const [flipped, setFlipped] = useState(false);
    const [auto, setAuto] = useState(false);
    const [flipDelay, setFlipDelay] = useState(3);
    const [nextDelay, setNextDelay] = useState(3);
    const [showSpeed, setShowSpeed] = useState(false);
    const [known, setKnown] = useState(loadKnown);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [rulesOpen, setRulesOpen] = useState(false);
    const phaseRef = useRef(0);

    const current = order[index] != null ? byNo.get(order[index]) : allRadicals[0];

    const goNext = useCallback(() => {
        setIndex((i) => (order.length ? (i + 1) % order.length : 0));
        setFlipped(false);
    }, [order.length]);

    const goPrev = useCallback(() => {
        setIndex((i) => (order.length ? (i - 1 + order.length) % order.length : 0));
        setFlipped(false);
    }, [order.length]);

    const markKnown = useCallback((no) => {
        setKnown((prev) => {
            const next = new Set(prev);
            next.add(no);
            persistKnown(next);
            return next;
        });
    }, []);

    const markUnknown = useCallback((no) => {
        setKnown((prev) => {
            const next = new Set(prev);
            next.delete(no);
            persistKnown(next);
            return next;
        });
    }, []);

    const shuffle = useCallback(() => {
        const arr = [...allRadicals.map((r) => r.no)];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        setOrder(arr);
        setIndex(0);
        setFlipped(false);
    }, [allRadicals]);

    // Autoplay — lật thẻ sau flipDelay(s) → hiện mặt sau → sang thẻ kế tiếp sau nextDelay(s)
    useEffect(() => {
        if (!auto) return;
        phaseRef.current = 0;
        let flipId;
        let nextId;
        flipId = setTimeout(() => {
            phaseRef.current = 1;
            setFlipped(true);
            if (current) speak(current.char);
            nextId = setTimeout(() => {
                phaseRef.current = 0;
                setFlipped(false);
                goNext();
            }, nextDelay * 1000);
        }, flipDelay * 1000);
        return () => {
            clearTimeout(flipId);
            clearTimeout(nextId);
        };
    }, [auto, flipDelay, nextDelay, goNext, current]);

    // Keyboard: ←/A prev, →/D next, Space flip
    useEffect(() => {
        const onKey = (e) => {
            if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
            if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") {
                e.preventDefault();
                setFlipped(false);
                goPrev();
            } else if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") {
                e.preventDefault();
                setFlipped(false);
                goNext();
            } else if (e.key === " ") {
                e.preventDefault();
                setFlipped((f) => !f);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [goPrev, goNext]);

    // Reset index if order somehow becomes empty
    useEffect(() => {
        if (order.length && index >= order.length) setIndex(0);
    }, [order, index]);

    // Khi dữ liệu từ API về, khởi tạo thứ tự thẻ nếu chưa có
    useEffect(() => {
        if (order.length === 0 && allRadicals.length > 0) {
            setOrder(allRadicals.map((r) => r.no));
            setIndex(0);
            setFlipped(false);
        }
    }, [order, allRadicals]);

    const knownCount = useMemo(() => allRadicals.filter((r) => known.has(r.no)).length, [allRadicals, known]);

    if (loading) {
        return (
            <main className="radicals-page radicals-grid-bg flex-1 w-full">
                <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
                    <div className="space-y-3">
                        <div className="radicals-card h-4 w-1/3 animate-pulse" />
                        <div className="radicals-card h-12 w-2/3 animate-pulse" />
                        <div className="radicals-card h-4 w-1/2 animate-pulse" />
                    </div>
                    <div className="radicals-card h-72 animate-pulse" />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: 9 }).map((_, i) => (
                            <div key={i} className="radicals-card h-16 animate-pulse" />
                        ))}
                    </div>
                </div>
            </main>
        );
    }

    if (loadError) {
        return (
            <main className="radicals-page radicals-grid-bg flex-1 w-full">
                <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-4 px-4 py-16 text-center">
                    <p className="text-muted-foreground" role="alert">
                        {loadError}
                    </p>
                    <Button type="button" variant="default" onClick={loadRadicals}>
                        {t.radicals.retry}
                    </Button>
                </div>
            </main>
        );
    }

    if (!current) return null;

    const isKnown = known.has(current.no);

    return (
        <main className="radicals-page radicals-grid-bg flex-1 w-full">
            <div className="mx-auto w-full max-w-5xl flex flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
                {/* Header */}
                <header className="flex flex-col items-center gap-1.5 text-center">
                    <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{t.radicals.title}</h1>
                    <p className="text-sm text-muted-foreground">
                        {t.radicals.subtitle}
                        {!isSignedIn && ` ${t.radicals.subtitleLogin}`}
                    </p>
                </header>

                {/* ── Flashcard section ── */}
                <section className="flex flex-col gap-4" aria-label={t.radicals.flashcard}>
                    {/* Toolbar */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <Button type="button" variant="default" onClick={() => setSheetOpen(true)}>
                                <IconLayers size={16} />
                                <span className="hidden sm:inline">{t.radicals.createSheet}</span>
                                <span className="sm:hidden">{groupsTotal}</span>
                            </Button>
                            <Button type="button" variant="outline" onClick={() => setRulesOpen(true)}>
                                <IconPenTool size={16} />
                                {t.radicals.strokeOrderTitle}
                            </Button>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-1 font-heading text-sm">
                                {fmt(t.radicals.of, { current: index + 1, total: order.length })}
                            </span>
                            <Button
                                type="button"
                                variant={auto ? "default" : "outline"}
                                onClick={() => setAuto((v) => !v)}
                                aria-pressed={auto}
                            >
                                {auto ? <IconPause size={15} /> : <IconPlay size={15} />}
                                {t.radicals.auto}
                            </Button>
                            <Button type="button" variant="outline" onClick={shuffle} title={t.radicals.shuffle}>
                                <IconShuffle size={15} />
                                {t.radicals.shuffle}
                            </Button>
                            <div className="relative">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setShowSpeed((v) => !v)}
                                    aria-label={t.radicals.autoplaySettings}
                                    aria-expanded={showSpeed}
                                >
                                    <IconSettings size={16} />
                                </Button>
                                {showSpeed && (
                                    <div
                                        className="radicals-card absolute right-0 z-30 mt-2 flex w-60 flex-col gap-3 p-3"
                                        role="menu"
                                    >
                                        <span className="px-1 text-sm font-medium text-muted-foreground">
                                            {t.radicals.autoplaySettings}
                                        </span>
                                        <div
                                            className="flex flex-col gap-1.5"
                                            role="group"
                                            aria-label={t.radicals.autoplayFlipLabel}
                                        >
                                            <span className="px-1 text-xs text-muted-foreground">
                                                {t.radicals.autoplayFlipLabel}
                                            </span>
                                            <div className="flex gap-1">
                                                {AUTOPLAY_SPEEDS.map((s) => (
                                                    <Button
                                                        key={s}
                                                        type="button"
                                                        role="menuitemradio"
                                                        aria-checked={flipDelay === s}
                                                        variant={flipDelay === s ? "default" : "ghost"}
                                                        size="sm"
                                                        className="flex-1"
                                                        onClick={() => setFlipDelay(s)}
                                                    >
                                                        {fmt(t.radicals.seconds, { n: s })}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                        <div
                                            className="flex flex-col gap-1.5"
                                            role="group"
                                            aria-label={t.radicals.autoplayNextLabel}
                                        >
                                            <span className="px-1 text-xs text-muted-foreground">
                                                {t.radicals.autoplayNextLabel}
                                            </span>
                                            <div className="flex gap-1">
                                                {AUTOPLAY_SPEEDS.map((s) => (
                                                    <Button
                                                        key={s}
                                                        type="button"
                                                        role="menuitemradio"
                                                        aria-checked={nextDelay === s}
                                                        variant={nextDelay === s ? "default" : "ghost"}
                                                        size="sm"
                                                        className="flex-1"
                                                        onClick={() => setNextDelay(s)}
                                                    >
                                                        {fmt(t.radicals.seconds, { n: s })}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Card + pronounce (nút audio ở góc trên phải card) */}
                    <div className="relative">
                        <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            className="absolute right-2 top-2 z-10 size-11"
                            onClick={() => speak(current.char)}
                            aria-label={t.radicals.pronounce}
                            title={t.radicals.pronounce}
                        >
                            <IconSpeaker size={20} />
                        </Button>

                        <div className="flex-1">
                            <div
                                className={cn("radicals-flip cursor-pointer", flipped && "radicals-flip--flipped")}
                                onClick={() => setFlipped((f) => !f)}
                                role="button"
                                tabIndex={0}
                                aria-label={`${current.char} — ${t.radicals.clickToFlip}`}
                                onKeyDown={(e) => {
                                    if (e.key === " " || e.key === "Enter") {
                                        e.preventDefault();
                                        setFlipped((f) => !f);
                                    }
                                }}
                            >
                                <div className="radicals-flip__inner">
                                    {/* Mặt trước */}
                                    <div className="radicals-flip__face">
                                        <p
                                            lang="ja"
                                            className="max-w-full text-7xl font-heading leading-none wrap-break-word sm:text-8xl"
                                        >
                                            {current.char}
                                        </p>
                                        <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
                                            <IconMouseClick size={16} />
                                            {t.radicals.clickToFlip}
                                        </p>
                                    </div>
                                    {/* Mặt sau */}
                                    <div className="radicals-flip__face radicals-flip__face--back">
                                        <p lang="ja" className="text-5xl font-heading leading-none">
                                            {current.char}
                                        </p>
                                        {current.pinyin && (
                                            <p className="text-lg text-muted-foreground">{current.pinyin}</p>
                                        )}
                                        <p className="text-sm font-heading uppercase tracking-wide text-muted-foreground">
                                            {current.name}
                                        </p>
                                        <p className="max-w-md text-lg font-heading leading-snug text-foreground">
                                            {current.desc}
                                        </p>
                                        <p className="mt-2 text-xs text-muted-foreground">#{current.no}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                setFlipped(false);
                                goPrev();
                            }}
                        >
                            <IconChevronLeft size={16} />
                            {t.radicals.prev}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={!isSignedIn}
                            onClick={() => {
                                markUnknown(current.no);
                                goNext();
                            }}
                        >
                            <IconClose size={14} />
                            {t.radicals.notKnown}
                        </Button>
                        <Button
                            type="button"
                            variant="secondary"
                            disabled={!isSignedIn}
                            onClick={() => {
                                markKnown(current.no);
                                goNext();
                            }}
                        >
                            <IconCheck size={14} />
                            {t.radicals.known}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                setFlipped(false);
                                goNext();
                            }}
                        >
                            {t.radicals.next}
                            <IconChevronRight size={16} />
                        </Button>
                    </div>

                    {/* Progress summary */}
                    <p className="text-center text-xs text-muted-foreground">
                        {fmt(t.radicals.knownTitle)}: {knownCount} / {groupsTotal}
                    </p>
                    <p className="hidden text-center text-xs text-muted-foreground sm:block">
                        {t.radicals.keyboardHint}
                    </p>
                </section>

                {/* ── Danh sách bộ thủ theo số nét ── */}
                <section className="flex flex-col gap-6" aria-label={t.radicals.title}>
                    {(groups ?? []).map((group) => (
                        <div key={group.strokes} className="flex flex-col gap-3">
                            <div className="flex items-center gap-2.5">
                                <Badge>{fmt(t.radicals.strokesN, { n: group.strokes })}</Badge>
                                <span className="text-sm text-muted-foreground">
                                    {fmt(t.radicals.countN, { n: group.radicals.length })}
                                </span>
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {group.radicals.map((r) => {
                                    const rKnown = known.has(r.no);
                                    return (
                                        <button
                                            key={r.no}
                                            type="button"
                                            title={t.radicals.listen}
                                            className="radicals-card radicals-card--hover group flex cursor-pointer items-start gap-3 p-3 text-left"
                                            onClick={() => speak(r.char)}
                                        >
                                            <span className="relative flex size-12 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-2xl text-primary">
                                                <span lang="ja">{r.char}</span>
                                                {rKnown && (
                                                    <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-primary/25 bg-primary text-white">
                                                        <IconCheck size={12} strokeWidth={3} />
                                                    </span>
                                                )}
                                            </span>
                                            <span className="min-w-0">
                                                <span className="flex flex-wrap items-baseline gap-x-2">
                                                    <b className="font-heading text-foreground">{r.name}</b>
                                                    <span className="text-xs text-muted-foreground">#{r.no}</span>
                                                    {r.variants.map((v) => (
                                                        <Badge key={v} variant="outline" lang="zh">
                                                            {v}
                                                        </Badge>
                                                    ))}
                                                </span>
                                                <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
                                                    {r.desc}
                                                </span>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </section>

                <footer className="pb-4 text-center text-xs text-muted-foreground">
                    {t.radicals.title} · {fmt(t.radicals.countN, { n: groupsTotal })}
                </footer>
            </div>

            {/* ── Dialog Quy tắc thuận bút ── */}
            <Dialog open={rulesOpen} onOpenChange={(open) => !open && setRulesOpen(false)}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{t.radicals.strokeOrderTitle}</DialogTitle>
                        <DialogDescription>{t.radicals.strokeOrderSubtitle}</DialogDescription>
                    </DialogHeader>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {strokeOrderRules.map((rule, i) => (
                            <div key={rule.rule} className="radicals-card flex items-center gap-3 p-3">
                                <span className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 font-heading text-2xl text-primary">
                                    <span lang="ja">{rule.char}</span>
                                </span>
                                <span className="min-w-0">
                                    <span className="flex items-center gap-2">
                                        <b className="font-heading text-foreground">{rule.rule}</b>
                                        <span lang="zh" className="text-xs text-muted-foreground">
                                            {rule.zh}
                                        </span>
                                    </span>
                                    <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
                                        {rule.desc}
                                    </span>
                                    <span className="mt-1 block text-xs text-muted-foreground">Quy tắc {i + 1}</span>
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Lưu ý bộ viết sau cùng */}
                    <div className="radicals-card flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-4">
                        <div className="flex gap-2">
                            {strokeOrderNote.chars.map((ch) => (
                                <span
                                    key={ch}
                                    lang="ja"
                                    className="flex size-12 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 font-heading text-2xl text-primary"
                                >
                                    {ch}
                                </span>
                            ))}
                        </div>
                        <p className="text-sm font-heading leading-snug text-foreground">{strokeOrderNote.text}</p>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── Sheet luyện viết (in được) ── */}
            <div
                className={cn("radicals-sheet", sheetOpen && "radicals-sheet--open")}
                role="dialog"
                aria-modal="true"
                aria-label={t.radicals.sheetTitle}
            >
                <div className="radicals-sheet__inner">
                    <div className="radicals-sheet__toolbar sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-card py-3">
                        <div>
                            <h2 className="text-xl font-heading text-foreground">{t.radicals.sheetTitle}</h2>
                            <p className="text-xs text-muted-foreground">{t.radicals.sheetHint}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button type="button" variant="default" onClick={() => window.print()}>
                                <IconPrinter size={16} />
                                {t.radicals.print}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => setSheetOpen(false)}
                                aria-label={t.common.close}
                            >
                                <IconClose size={16} />
                            </Button>
                        </div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                        {allRadicals.map((r) => (
                            <div
                                key={r.no}
                                className="flex flex-col items-center gap-1 border border-border p-2 text-center"
                            >
                                <span lang="ja" className="font-heading text-3xl leading-none text-foreground">
                                    {r.char}
                                </span>
                                <span className="text-xs text-muted-foreground">{r.name}</span>
                                <span className="text-xs text-muted-foreground">#{r.no}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </main>
    );
}
