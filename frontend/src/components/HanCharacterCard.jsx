import { memo } from "react";
import { Link } from "react-router-dom";
import { cn } from "../lib/cn.js";
import { HanziiHanCellLink } from "./HanziiHanCellLink.jsx";
import { hanCharacterDetailPath } from "../lib/hanCharacterRoutes.js";

export const HanCharacterCard = memo(function HanCharacterCard({ item, index, canEdit, onSave, onDelete }) {
    const readings = Array.isArray(item.pinyin) ? item.pinyin : item.pinyin ? [item.pinyin] : [];
    const jyutpings = Array.isArray(item.jyutping) ? item.jyutping : item.jyutping ? [item.jyutping] : [];
    const hasDistinctSimplified = Boolean(item.hanSimplified && item.hanSimplified !== (item.hanTraditional ?? ""));
    // Convention: 🔵 xanh = simplified, 🔴 đỏ = traditional
    const han = hasDistinctSimplified ? item.hanSimplified : item.hanTraditional || "?";
    const hanTone = hasDistinctSimplified ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400";

    return (
        <div className="group relative flex flex-col items-center rounded-xl border border-border bg-surface p-5 transition-shadow duration-200 hover:shadow-lg hover:border-accent-border/50">
            {/* Character - large, centered */}
            <Link to={hanCharacterDetailPath(item.id)} className="no-underline">
                <span
                    className={cn(
                        "block text-[clamp(2.5rem,6vw,4rem)] font-semibold leading-none py-3 transition-transform duration-200 group-hover:scale-110",
                        hanTone,
                    )}
                >
                    {han}
                </span>
            </Link>

            {/* Pinyin readings */}
            {readings.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1 mt-3">
                    {readings.map((r, i) => (
                        <span
                            key={i}
                            className="text-xs font-medium text-jyutping bg-accent-bg/30 px-1.5 py-0.5 rounded"
                        >
                            {r}
                        </span>
                    ))}
                </div>
            )}

            {/* Jyutping readings */}
            {jyutpings.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1 mt-1.5">
                    {jyutpings.map((r, i) => (
                        <span key={i} className="text-[0.6875rem] text-text-muted bg-bg px-1.5 py-0.5 rounded">
                            {r}
                        </span>
                    ))}
                </div>
            )}

            {/* HSK Level */}
            {item.hskLevel && (
                <span className="mt-2 text-[0.6875rem] font-medium text-amber-700 dark:text-amber-400 bg-amber-100/50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">
                    {item.hskLevel}
                </span>
            )}

            {/* Hanzii link */}
            <div className="mt-2">
                <HanziiHanCellLink hanTraditional={han} displayText="" emphasis="secondary" />
            </div>
        </div>
    );
});
