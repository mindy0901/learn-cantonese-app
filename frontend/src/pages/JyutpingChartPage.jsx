import { useRef } from "react";
import { useLocale } from "../store/localeStore.js";
import { cn } from "../lib/cn.js";
import { useDragToScroll } from "../hooks/useDragToScroll.js";
import {
    JYUTPING_FINALS,
    JYUTPING_FINAL_COLS,
    JYUTPING_INITIAL_GRID,
    JYUTPING_TONES,
    jyutpingFinalAudioUrl,
    jyutpingFinalCdnUrl,
    jyutpingInitialAudioUrl,
    jyutpingInitialCdnUrl,
    jyutpingToneAudioUrl,
    jyutpingToneCdnUrl,
} from "../data/jyutpingTable.js";
import { Button } from "../components/shadcn/button.jsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/shadcn/table.jsx";
import { ToneDiagram } from "../components/ToneDiagram.jsx";
import { JyutpingSyllableGrid } from "../components/JyutpingSyllableGrid.jsx";
import {
    JYUTPING_SYL_INITIAL_COUNT,
    JYUTPING_SYL_FINAL_COUNT,
    JYUTPING_SYL_TOTAL,
} from "../data/jyutpingSyllableTable.js";

/** Phát âm click-to-speech — ngắt phát trước nếu đang chạy, không gắn vào DOM.
 *  Nhận danh sách nguồn (local trước, CDN sau); nguồn trước lỗi → thử nguồn sau. */
function useJyutpingAudio() {
    const audioRef = useRef(null);
    const play = (...urls) => {
        audioRef.current?.pause();
        const queue = urls.filter(Boolean);
        const playNext = (i) => {
            const url = queue[i];
            if (!url) return;
            const audio = new Audio(url);
            audioRef.current = audio;
            audio.onerror = () => playNext(i + 1);
            audio.play().catch(() => playNext(i + 1));
        };
        playNext(0);
    };
    return play;
}

export function JyutpingChartPage() {
    const { t } = useLocale();
    const tableWrapRef = useRef(null);
    useDragToScroll(tableWrapRef);
    const play = useJyutpingAudio();

    return (
        <main className="mx-auto flex-1 w-full max-w-280 px-4 py-8 pb-12">
            <div className="mb-6 flex flex-col items-center gap-1.5 text-center">
                <h1 className="text-2xl font-bold tracking-tight">{t.jyutping.title}</h1>
                <p className="text-sm text-muted-foreground">
                    {t.jyutping.subtitle} — <span className="font-medium text-foreground">{JYUTPING_SYL_TOTAL}</span>{" "}
                    {t.jyutping.syllables}
                </p>
            </div>

            {/* 6 Thanh điệu — bảng giống Open Cantonese: Tone Number / Tone Name / Diagram */}
            <section className="mb-6" aria-label={t.jyutping.tonesLabel}>
                <h2 className="mb-4 text-lg font-semibold">
                    {t.jyutping.tonesTitle}{" "}
                    <span className="text-sm font-normal text-muted-foreground">({JYUTPING_TONES.length})</span>
                </h2>
                <div className="overflow-x-auto rounded-xl border border-border bg-background">
                    <Table containerClassName="overflow-visible">
                        <TableBody>
                            {/* Hàng 1: Tone Number */}
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="w-28 bg-muted/40 text-center font-semibold text-viet">
                                    {t.jyutping.toneNumber}
                                </TableHead>
                                {JYUTPING_TONES.map((tn) => (
                                    <TableCell key={tn} className="h-12 text-center">
                                        <button
                                            type="button"
                                            className="font-mono text-base font-semibold text-foreground underline-offset-2 hover:underline"
                                            onClick={() => play(jyutpingToneAudioUrl(tn), jyutpingToneCdnUrl(tn))}
                                        >
                                            {t.jyutping.toneNumbers[tn - 1]}
                                        </button>
                                    </TableCell>
                                ))}
                            </TableRow>
                            {/* Hàng 2: Ví dụ jyutping */}
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="bg-muted/40 text-center font-semibold text-viet">
                                    {t.jyutping.toneExample}
                                </TableHead>
                                {JYUTPING_TONES.map((tn) => (
                                    <TableCell key={tn} className="h-10 text-center">
                                        <button
                                            type="button"
                                            className="font-mono text-base font-medium text-foreground underline-offset-2 hover:underline"
                                            onClick={() => play(jyutpingToneAudioUrl(tn), jyutpingToneCdnUrl(tn))}
                                        >
                                            {t.jyutping.toneExamples[tn - 1]}
                                        </button>
                                    </TableCell>
                                ))}
                            </TableRow>
                            {/* Hàng 3: Diagram */}
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="bg-muted/40 text-center font-semibold text-viet">
                                    {t.jyutping.toneDiagram}
                                </TableHead>
                                {JYUTPING_TONES.map((tn) => (
                                    <TableCell key={tn} className="h-20 text-center">
                                        <button
                                            type="button"
                                            className="text-foreground transition-colors hover:text-primary/70"
                                            onClick={() => play(jyutpingToneAudioUrl(tn), jyutpingToneCdnUrl(tn))}
                                        >
                                            <ToneDiagram tone={tn} />
                                        </button>
                                    </TableCell>
                                ))}
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>
            </section>

            {/* Thanh mẫu (Initials) — grid 5×5 giống Open Cantonese */}
            <section className="mb-6" aria-label={t.jyutping.initialsLabel}>
                <h2 className="mb-4 text-lg font-semibold">
                    {t.jyutping.initialsTitle}{" "}
                    <span className="text-sm font-normal text-muted-foreground">({JYUTPING_SYL_INITIAL_COUNT})</span>
                </h2>
                <div className="max-w-xl overflow-x-auto rounded-xl border border-border bg-background">
                    <Table containerClassName="overflow-visible">
                        <TableHeader>
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="bg-muted/40 text-center font-semibold text-viet">
                                    {t.jyutping.unaspirated}
                                </TableHead>
                                <TableHead className="bg-muted/40 text-center font-semibold text-viet">
                                    {t.jyutping.aspirated} 💨
                                </TableHead>
                                <TableHead className="bg-muted/40" />
                                <TableHead className="bg-muted/40" />
                                <TableHead className="bg-muted/40" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {JYUTPING_INITIAL_GRID.map((row, ri) => (
                                <TableRow key={ri} className="hover:bg-transparent">
                                    {row.map((initial, ci) => (
                                        <TableCell key={ci} className="h-12 text-center">
                                            {initial ? (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-9 min-w-12 px-2 font-mono text-base"
                                                    onClick={() =>
                                                        play(
                                                            jyutpingInitialAudioUrl(initial),
                                                            jyutpingInitialCdnUrl(initial),
                                                        )
                                                    }
                                                >
                                                    {initial}
                                                </Button>
                                            ) : null}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </section>

            {/* Vận mẫu (Finals) — kéo chuột để di chuyển */}
            <section aria-label={t.jyutping.finalsLabel}>
                <h2 className="mb-4 text-lg font-semibold">
                    {t.jyutping.finalsTitle}{" "}
                    <span className="text-sm font-normal text-muted-foreground">({JYUTPING_SYL_FINAL_COUNT})</span>
                </h2>
                <div
                    ref={tableWrapRef}
                    className="max-h-[60vh] cursor-grab overflow-auto rounded-xl border border-border bg-background [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                    <Table containerClassName="overflow-visible">
                        <TableHeader>
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="sticky top-0 left-0 z-20 will-change-transform bg-background text-center font-semibold text-viet shadow-[inset_-2px_0_0_0_var(--color-border),inset_0_-2px_0_0_var(--color-border)]">
                                    {t.jyutping.codaHeader}
                                </TableHead>
                                {JYUTPING_FINAL_COLS.map((final, index) => {
                                    const hasAudio = final && jyutpingFinalAudioUrl(final);
                                    return (
                                        <TableHead
                                            key={index}
                                            className="sticky top-0 z-10 will-change-transform bg-background px-2 text-center shadow-[inset_0_-2px_0_0_var(--color-border)]"
                                        >
                                            {final ? (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className={cn(
                                                        "h-7 w-full px-1 font-mono text-base font-semibold text-viet",
                                                        !hasAudio &&
                                                            "cursor-default text-muted-foreground/40 hover:bg-transparent hover:text-muted-foreground/40",
                                                    )}
                                                    onClick={() =>
                                                        hasAudio &&
                                                        play(jyutpingFinalAudioUrl(final), jyutpingFinalCdnUrl(final))
                                                    }
                                                >
                                                    {final}
                                                </Button>
                                            ) : null}
                                        </TableHead>
                                    );
                                })}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {JYUTPING_FINALS.map((row) => (
                                <TableRow key={row.coda} className="hover:bg-transparent">
                                    <TableHead className="sticky left-0 z-10 will-change-transform bg-background px-2 text-center font-mono text-base font-semibold text-viet shadow-[inset_-2px_0_0_0_var(--color-border)]">
                                        {row.coda}
                                    </TableHead>
                                    {JYUTPING_FINAL_COLS.map((final, index) => {
                                        const f = row.finals[index] ?? null;
                                        const hasAudio = f && jyutpingFinalAudioUrl(f);
                                        const isVowelOnly = index === JYUTPING_FINAL_COLS.length - 1 && !final;
                                        return (
                                            <TableCell key={index} className="h-8 p-0.5 text-center">
                                                {f ? (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className={cn(
                                                            "h-7 w-full px-1 font-mono text-base font-medium",
                                                            !hasAudio &&
                                                                "cursor-default text-muted-foreground/40 hover:bg-transparent hover:text-muted-foreground/40",
                                                        )}
                                                        onClick={() =>
                                                            hasAudio &&
                                                            play(jyutpingFinalAudioUrl(f), jyutpingFinalCdnUrl(f))
                                                        }
                                                    >
                                                        {f}
                                                    </Button>
                                                ) : isVowelOnly ? (
                                                    <span className="text-xs text-muted-foreground/25">·</span>
                                                ) : null}
                                            </TableCell>
                                        );
                                    })}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </section>

            {/* Bảng âm tiết tổng hợp (Thanh mẫu × Vận mẫu) */}
            <section className="mt-6">
                <JyutpingSyllableGrid play={play} />
            </section>
        </main>
    );
}
