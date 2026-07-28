import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useVocabularyCount, useLessons, useAppActions } from "../store/appStore.js";
import { useLocale } from "../store/localeStore.js";
import { useConfirmDialog } from "../hooks/useConfirmDialog.jsx";
import { useIsAdmin } from "../store/authStore.js";
import { btnClass } from "../components/ui/buttonStyles.js";
import { cn } from "../lib/cn.js";
import { EmptyState } from "../components/ui/EmptyState.jsx";
import { IconLessons, IconBook, IconVocab, IconGrammar } from "../components/NavIcons.jsx";

const HSK_COLORS = {
    "HSK 1": {
        bg: "bg-emerald-50 dark:bg-emerald-950/40",
        border: "border-emerald-200 dark:border-emerald-800",
        accent: "text-emerald-700 dark:text-emerald-400",
        dot: "bg-emerald-500",
    },
    "HSK 2": {
        bg: "bg-blue-50 dark:bg-blue-950/40",
        border: "border-blue-200 dark:border-blue-800",
        accent: "text-blue-700 dark:text-blue-400",
        dot: "bg-blue-500",
    },
    "HSK 3": {
        bg: "bg-amber-50 dark:bg-amber-950/40",
        border: "border-amber-200 dark:border-amber-800",
        accent: "text-amber-700 dark:text-amber-400",
        dot: "bg-amber-500",
    },
    "HSK 4": {
        bg: "bg-purple-50 dark:bg-purple-950/40",
        border: "border-purple-200 dark:border-purple-800",
        accent: "text-purple-700 dark:text-purple-400",
        dot: "bg-purple-500",
    },
    "HSK 5": {
        bg: "bg-rose-50 dark:bg-rose-950/40",
        border: "border-rose-200 dark:border-rose-800",
        accent: "text-rose-700 dark:text-rose-400",
        dot: "bg-rose-500",
    },
    "HSK 6": {
        bg: "bg-slate-50 dark:bg-slate-800/40",
        border: "border-slate-200 dark:border-slate-700",
        accent: "text-slate-700 dark:text-slate-400",
        dot: "bg-slate-500",
    },
    "HSK 7": {
        bg: "bg-cyan-50 dark:bg-cyan-950/40",
        border: "border-cyan-200 dark:border-cyan-800",
        accent: "text-cyan-700 dark:text-cyan-400",
        dot: "bg-cyan-500",
    },
    "HSK 7-9": {
        bg: "bg-teal-50 dark:bg-teal-950/40",
        border: "border-teal-200 dark:border-teal-800",
        accent: "text-teal-700 dark:text-teal-400",
        dot: "bg-teal-500",
    },
};

function levelStats(lessons) {
    const vocabIds = new Set();
    const grammarIds = new Set();
    for (const l of lessons) {
        for (const id of l.wordIds || []) vocabIds.add(id);
        for (const g of l.grammar || []) grammarIds.add(g.id);
    }
    return { lessonCount: lessons.length, vocabCount: vocabIds.size, grammarCount: grammarIds.size };
}

export function LessonsPage() {
    const wordCount = useVocabularyCount();
    const lessons = useLessons();
    const { removeLesson } = useAppActions();
    const { t, fmt } = useLocale();
    const isAdmin = useIsAdmin();
    const { ask, dialog } = useConfirmDialog();
    const [selectedLevel, setSelectedLevel] = useState(null);

    // Group by level
    const { levels, allLevelStats } = useMemo(() => {
        const map = new Map();
        for (const l of lessons) {
            const lvl = l.hskLevel || "Khác";
            if (!map.has(lvl)) map.set(lvl, []);
            map.get(lvl).push(l);
        }
        const entries = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        const stats = entries.map(([lvl, ls]) => ({ level: lvl, ...levelStats(ls) }));
        return { levels: entries, allLevelStats: stats };
    }, [lessons]);

    const filteredLessons = useMemo(() => {
        const pool = selectedLevel ? levels.find(([l]) => l === selectedLevel)?.[1] || [] : lessons;
        // Sort by number in title: "Bài 1", "Bài 2", ...
        return [...pool].sort((a, b) => {
            const na = parseInt((a.name || "").match(/\d+/)?.[0] || "0", 10);
            const nb = parseInt((b.name || "").match(/\d+/)?.[0] || "0", 10);
            return na - nb;
        });
    }, [lessons, levels, selectedLevel]);

    const handleDeleteLesson = (lesson) => {
        ask({
            title: t.confirm.deleteTitle,
            message: fmt(t.confirm.deleteLesson, { label: lesson.name }),
            onConfirm: () => removeLesson(lesson.id),
        });
    };

    return (
        <main className="flex-1 max-w-[1800px] w-full mx-auto px-5 py-8 pb-12">
            <div className="flex items-start justify-between gap-4 mb-6 max-sm:flex-col">
                <div>
                    <h1>{t.lessons.title}</h1>
                    <p className="mt-1 text-text-muted text-sm">{t.lessons.subtitle}</p>
                </div>
                {isAdmin && (
                    <div className="flex gap-2 shrink-0">
                        <Link to="/lessons/new" className={btnClass("success")}>
                            + {t.lessons.create}
                        </Link>
                    </div>
                )}
            </div>

            {wordCount === 0 ? (
                <EmptyState
                    icon={<IconLessons size={28} />}
                    title={t.lessons.emptyWords}
                    description={isAdmin ? t.lessons.emptyWordsAdminHint : undefined}
                    action={
                        <Link to="/vocabulary" className={btnClass("primary")}>
                            {t.lessons.goWordBank}
                        </Link>
                    }
                />
            ) : lessons.length === 0 ? (
                <EmptyState
                    icon={<IconLessons size={28} />}
                    title={t.lessons.emptyLessons}
                    description={isAdmin ? t.lessons.emptyLessonsAdminHint : undefined}
                    action={
                        isAdmin && (
                            <Link to="/lessons/new" className={btnClass("primary")}>
                                + {t.lessons.create}
                            </Link>
                        )
                    }
                />
            ) : (
                <>
                    {/* Level Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-8">
                        {/* All levels card */}
                        <button
                            type="button"
                            onClick={() => setSelectedLevel(null)}
                            className={cn(
                                "flex flex-col gap-2 p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer active:enabled:scale-[0.97]",
                                "bg-surface border-border hover:border-accent-border hover:shadow-theme hover:-translate-y-0.5",
                                !selectedLevel && "ring-2 ring-accent border-accent",
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <IconBook size={18} className="text-accent" />
                                <span className="font-bold text-text-h text-sm">Tất cả</span>
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
                                <span>{lessons.length} bài</span>
                                <span>{allLevelStats.reduce((s, x) => s + x.vocabCount, 0)} từ</span>
                            </div>
                        </button>

                        {allLevelStats.map(({ level, lessonCount, vocabCount, grammarCount }) => {
                            const c = HSK_COLORS[level] || {
                                bg: "bg-surface",
                                border: "border-border",
                                accent: "text-text-h",
                                dot: "bg-accent",
                            };
                            return (
                                <button
                                    key={level}
                                    type="button"
                                    onClick={() => setSelectedLevel(selectedLevel === level ? null : level)}
                                    className={cn(
                                        "flex flex-col gap-2 p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer active:enabled:scale-[0.97]",
                                        c.bg,
                                        c.border,
                                        "hover:shadow-theme hover:-translate-y-0.5",
                                        selectedLevel === level && "ring-2 ring-accent border-accent shadow-theme",
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", c.dot)} />
                                        <span className={cn("font-bold text-sm", c.accent)}>{level}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
                                        <span title={`${lessonCount} bài học`} className="flex items-center gap-1">
                                            <IconBook size={12} />
                                            {lessonCount}
                                        </span>
                                        <span title={`${vocabCount} từ vựng`} className="flex items-center gap-1">
                                            <IconVocab size={12} />
                                            {vocabCount}
                                        </span>
                                        <span title={`${grammarCount} ngữ pháp`} className="flex items-center gap-1">
                                            <IconGrammar size={12} />
                                            {grammarCount}
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    <ul className="list-none m-0 p-0 flex flex-col gap-3">
                        {filteredLessons.map((lesson) => (
                            <li
                                key={lesson.id}
                                className={cn(
                                    "flex items-center justify-between gap-4 px-6 py-5 bg-surface border border-border rounded-[0.625rem] transition-all duration-200 hover:border-accent-border hover:shadow-theme hover:-translate-y-0.5",
                                    "max-sm:flex-col max-sm:items-start",
                                )}
                            >
                                <Link
                                    to={`/lessons/${lesson.id}`}
                                    className="flex-1 min-w-0 flex flex-col gap-1.5 no-underline text-inherit group"
                                >
                                    <h3 className="m-0 font-bold leading-tight text-text-h text-lg group-hover:text-accent transition-colors">
                                        {lesson.name}
                                    </h3>
                                    <div className="text-[0.8125rem] text-text-muted flex gap-1.5">
                                        <span>
                                            {lesson.wordIds.length} {t.lessons.newWords}
                                        </span>
                                        <span>·</span>
                                        <span>
                                            {lesson.grammar.filter((g) => g.title || g.content).length}{" "}
                                            {t.lessons.grammar}
                                        </span>
                                    </div>
                                </Link>
                                {isAdmin && (
                                    <div className="flex shrink-0 gap-2">
                                        <Link to={`/lessons/${lesson.id}/edit`} className={btnClass("outline", "sm")}>
                                            {t.lessons.edit}
                                        </Link>
                                        <button
                                            type="button"
                                            className={btnClass("ghost", "sm")}
                                            onClick={() => handleDeleteLesson(lesson)}
                                        >
                                            {t.lessons.delete}
                                        </button>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                </>
            )}
            {dialog}
        </main>
    );
}
