import { useState } from "react";
import { useLocale } from "../store/localeStore.js";
import { Button } from "../components/shadcn/button.jsx";
import { cn } from "../lib/cn.js";
import { PinyinTablePage } from "./PinyinTablePage.jsx";
import { JyutpingChartPage } from "./JyutpingChartPage.jsx";

/** Trang Bảng phiên âm — segmented control (2 nút pill) đổi giữa Pinyin / Jyutping (2026-08-18). */
export function PronunciationTablesPage() {
    const { t } = useLocale();
    const [useJyutping, setUseJyutping] = useState(false);

    const options = [
        { key: false, label: t.nav.pinyinTable },
        { key: true, label: t.nav.jyutpingTable },
    ];

    return (
        <div className="flex flex-col">
            <div className="mx-auto flex w-full max-w-280 justify-center px-4 pt-6 pb-2">
                <div className="flex items-center gap-0.5 rounded-full border border-border bg-background p-0.5">
                    {options.map((o) => (
                        <Button
                            key={o.label}
                            type="button"
                            size="sm"
                            variant={useJyutping === o.key ? "default" : "ghost"}
                            className={cn(
                                "h-7 rounded-full px-3 text-xs font-semibold",
                                useJyutping !== o.key && "text-muted-foreground hover:text-foreground",
                            )}
                            onClick={() => setUseJyutping(o.key)}
                            aria-pressed={useJyutping === o.key}
                        >
                            {o.label}
                        </Button>
                    ))}
                </div>
            </div>
            {useJyutping ? <JyutpingChartPage /> : <PinyinTablePage />}
        </div>
    );
}
