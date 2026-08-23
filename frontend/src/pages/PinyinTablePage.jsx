import { useMemo, useRef, useState } from "react";
import { SearchIcon } from "lucide-react";
import { useLocale } from "../store/localeStore.js";
import { cn } from "../lib/cn.js";
import { useDragToScroll } from "../hooks/useDragToScroll.js";
import { PINYIN_FINAL_NAMES, PINYIN_FINALS, PINYIN_ROWS } from "../data/pinyinTable.js";
import { PinyinSyllableDialog } from "../components/PinyinSyllableDialog.jsx";
import { Button } from "../components/shadcn/button.jsx";
import { Input } from "../components/shadcn/input.jsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/shadcn/table.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "../components/shadcn/card.jsx";
import { Alert, AlertDescription } from "../components/shadcn/alert.jsx";

export function PinyinTablePage() {
    const { t } = useLocale();
    const [selected, setSelected] = useState(null);
    const [activeInitial, setActiveInitial] = useState("all");
    const [search, setSearch] = useState("");
    const tableWrapRef = useRef(null);
    useDragToScroll(tableWrapRef);

    const query = search.trim().toLowerCase();

    const total = useMemo(() => PINYIN_ROWS.reduce((acc, row) => acc + row.cells.filter(Boolean).length, 0), []);

    const visibleRows = useMemo(
        () => (activeInitial === "all" ? PINYIN_ROWS : PINYIN_ROWS.filter((row) => row.initial === activeInitial)),
        [activeInitial],
    );

    // Lọc theo query: chỉ giữ hàng có âm khớp, các ô không khớp bị ẩn (thành trống)
    const filteredRows = useMemo(() => {
        if (!query) return visibleRows;
        return visibleRows
            .map((row) => ({
                ...row,
                cells: row.cells.map((s) => (s && s.toLowerCase().includes(query) ? s : "")),
            }))
            .filter((row) => row.cells.some(Boolean));
    }, [visibleRows, query]);

    // Chỉ hiện cột vận mẫu còn chứa âm khớp
    const filteredFinals = useMemo(() => {
        if (!query) return PINYIN_FINALS.map((final, index) => ({ final, index }));
        const matchedIdx = new Set();
        filteredRows.forEach((row) => {
            row.cells.forEach((s, i) => {
                if (s) matchedIdx.add(i);
            });
        });
        return PINYIN_FINALS.map((final, index) => ({ final, index })).filter(({ index }) => matchedIdx.has(index));
    }, [filteredRows, query]);

    // Danh sách thanh mẫu cho filter bar — Ø đứng đầu, còn lại theo bảng chữ cái (bảng vẫn giữ thứ tự chuẩn)
    const filterInitials = useMemo(() => {
        const others = PINYIN_ROWS.map((row) => row.initial)
            .filter((i) => i !== "Ø")
            .sort((a, b) => a.localeCompare(b));
        return ["Ø", ...others];
    }, []);

    const tones = [
        { mark: "ˉ", name: t.pinyin.tone1, desc: t.pinyin.tone1Desc },
        { mark: "ˊ", name: t.pinyin.tone2, desc: t.pinyin.tone2Desc },
        { mark: "ˇ", name: t.pinyin.tone3, desc: t.pinyin.tone3Desc },
        { mark: "ˋ", name: t.pinyin.tone4, desc: t.pinyin.tone4Desc },
    ];

    return (
        <main className="mx-auto flex-1 w-full max-w-280 px-4 py-8 pb-12">
            <div className="mb-6 flex flex-col items-center gap-1.5 text-center">
                <h1 className="text-2xl font-bold tracking-tight">{t.pinyin.title}</h1>
                <p className="text-sm text-muted-foreground">
                    {t.pinyin.subtitle} — <span className="font-medium text-foreground">{total}</span>{" "}
                    {t.pinyin.syllables}
                </p>
            </div>

            {/* Tìm kiếm pinyin */}
            <div className="mb-4">
                <div className="relative">
                    <SearchIcon
                        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                    />
                    <Input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t.pinyin.search}
                        className="pl-9"
                        aria-label={t.pinyin.search}
                    />
                </div>
            </div>

            {/* Lọc theo thanh mẫu */}
            <div className="mb-4 flex flex-wrap gap-1">
                <Button
                    type="button"
                    size="sm"
                    className="text-base"
                    variant={activeInitial === "all" ? "default" : "outline"}
                    onClick={() => setActiveInitial("all")}
                >
                    {t.pinyin.all}
                </Button>
                {filterInitials.map((initial) => (
                    <Button
                        key={initial}
                        type="button"
                        size="sm"
                        className="text-base"
                        variant={activeInitial === initial ? "default" : "outline"}
                        onClick={() => setActiveInitial(initial)}
                    >
                        {initial}
                    </Button>
                ))}
            </div>

            {/* Bảng Thanh mẫu × Vận mẫu — kéo chuột để di chuyển (2 hướng) */}
            <div
                ref={tableWrapRef}
                className="max-h-[70vh] cursor-grab overflow-auto rounded-xl border border-border bg-background [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
                {/* containerClassName overflow-visible: bỏ scroll ngang riêng của shadcn
                    để drag-to-scroll ở div ngoài xử lý được cả ngang lẫn dọc */}
                <Table containerClassName="overflow-visible">
                    <TableHeader>
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="sticky top-0 left-0 z-20 will-change-transform bg-background text-center text-base font-semibold text-viet shadow-[inset_-2px_0_0_0_var(--color-border),inset_0_-2px_0_0_var(--color-border)]">
                                {t.pinyin.initialHeader}
                            </TableHead>
                            {filteredFinals.map(({ final, index }) => (
                                <TableHead
                                    key={final}
                                    className="sticky top-0 z-10 will-change-transform bg-background px-2 text-center text-base font-semibold text-viet shadow-[inset_0_-2px_0_0_var(--color-border)]"
                                >
                                    {final}
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredRows.length === 0 && (
                            <TableRow className="hover:bg-transparent">
                                <TableCell
                                    colSpan={filteredFinals.length + 1}
                                    className="h-16 text-center text-sm text-muted-foreground"
                                >
                                    {t.pinyin.noResults}
                                </TableCell>
                            </TableRow>
                        )}
                        {filteredRows.map((row) => (
                            <TableRow key={row.initial} className="hover:bg-transparent">
                                <TableHead className="sticky left-0 z-10 will-change-transform bg-background px-2 text-center text-base font-semibold text-viet shadow-[inset_-2px_0_0_0_var(--color-border)]">
                                    {row.initial}
                                </TableHead>
                                {filteredFinals.map(({ final, index }) => {
                                    const s = row.cells[index] ?? "";
                                    return (
                                        <TableCell key={final} className="h-8 p-0.5 text-center">
                                            {s ? (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className={cn(
                                                        "h-7 w-full px-1 text-base font-medium",
                                                        query && "bg-primary/15 font-semibold text-foreground",
                                                    )}
                                                    onClick={() =>
                                                        setSelected({
                                                            syllable: s,
                                                            initial: row.initial,
                                                            final: PINYIN_FINAL_NAMES[index],
                                                        })
                                                    }
                                                >
                                                    {s}
                                                </Button>
                                            ) : null}
                                        </TableCell>
                                    );
                                })}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* Thanh điệu */}
            <section className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {tones.map((tone) => (
                    <Card key={tone.mark} size="sm">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <span className="text-5xl leading-none text-foreground" aria-hidden="true">
                                    {tone.mark}
                                </span>
                                {tone.name}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">{tone.desc}</CardContent>
                    </Card>
                ))}
            </section>

            <Alert className="mt-4">
                <AlertDescription>{t.pinyin.neutralTone}</AlertDescription>
            </Alert>

            {selected && (
                <PinyinSyllableDialog
                    syllable={selected.syllable}
                    initial={selected.initial}
                    final={selected.final}
                    onClose={() => setSelected(null)}
                />
            )}
        </main>
    );
}
