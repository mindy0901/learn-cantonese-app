import { useRef } from "react";
import { useLocale } from "../store/localeStore.js";
import { useDragToScroll } from "../hooks/useDragToScroll.js";
import { JYUTPING_SYL_FINALS, JYUTPING_SYL_ROWS, JYUTPING_SYL_TOTAL } from "../data/jyutpingSyllableTable.js";
import { jyutpingFinalAudioUrl, jyutpingFinalCdnUrl } from "../data/jyutpingTable.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./shadcn/table.jsx";

/** Bảng âm tiết Jyutping — thanh mẫu × vận mẫu (giống bảng Pinyin).
 *  Click ô → phát âm vận mẫu (final) — vì không có file MP3 riêng cho từng tổ hợp. */
export function JyutpingSyllableGrid({ play }) {
    const { t } = useLocale();
    const wrapRef = useRef(null);
    useDragToScroll(wrapRef);

    return (
        <section aria-label={t.jyutping.syllableGridLabel}>
            <h2 className="mb-4 text-lg font-semibold">
                {t.jyutping.syllableGridTitle}{" "}
                <span className="text-sm font-normal text-muted-foreground">({JYUTPING_SYL_TOTAL})</span>
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">{t.jyutping.syllableGridSubtitle}</p>
            <div
                ref={wrapRef}
                className="max-h-[65vh] cursor-grab overflow-auto rounded-xl border border-border bg-background [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
                <Table containerClassName="overflow-visible">
                    <TableHeader>
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="sticky top-0 left-0 z-20 will-change-transform bg-background text-center font-semibold text-primary shadow-[inset_-2px_0_0_0_var(--color-border),inset_0_-2px_0_0_var(--color-border)]">
                                {t.jyutping.syllableGridCorner}
                            </TableHead>
                            {JYUTPING_SYL_FINALS.map((f) => (
                                <TableHead
                                    key={f}
                                    className="sticky top-0 z-10 will-change-transform bg-background px-2 text-center font-mono text-xs font-semibold text-primary shadow-[inset_0_-2px_0_0_var(--color-border)]"
                                >
                                    {f}
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {JYUTPING_SYL_ROWS.map((row) => (
                            <TableRow key={row.initial} className="hover:bg-transparent">
                                <TableHead className="sticky left-0 z-10 will-change-transform bg-background px-2 text-center font-mono font-semibold text-primary shadow-[inset_-2px_0_0_0_var(--color-border)]">
                                    {row.initial}
                                </TableHead>
                                {row.cells.map((s, i) => {
                                    const final = JYUTPING_SYL_FINALS[i];
                                    const url = jyutpingFinalAudioUrl(final);
                                    return (
                                        <TableCell key={i} className="h-8 p-0.5 text-center">
                                            {s ? (
                                                <button
                                                    type="button"
                                                    title={t.jyutping.syllableGridPlay}
                                                    className="h-7 w-full rounded-md px-1 font-mono text-sm font-medium transition-colors hover:bg-muted hover:text-foreground"
                                                    onClick={() => url && play(url, jyutpingFinalCdnUrl(final))}
                                                >
                                                    {s}
                                                </button>
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
    );
}
