import { Link } from "react-router-dom";
import {
    useVocabularyCount,
    useLessonCount,
    useMasteredVocabularyCount,
    useGrammarCount,
    useSentenceCount,
    useLessons,
} from "../store/appStore.js";
import { useLocale } from "../store/localeStore.js";
import { FlashcardStatsPanel } from "../components/FlashcardStatsPanel.jsx";
import { btnClass } from "../components/ui/buttonStyles.js";
import { IconWordBank, IconGrammar, IconSentences, IconLessons, IconFlashcard } from "../components/NavIcons.jsx";

export function HomePage() {
    const wordCount = useVocabularyCount();
    const grammarCount = useGrammarCount();
    const sentenceCount = useSentenceCount();
    const lessonCount = useLessonCount();
    const masteredCount = useMasteredVocabularyCount();
    const lessons = useLessons();
    const { t, fmt } = useLocale();

    const remaining = wordCount - masteredCount;
    const recentLessons = [...lessons].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4);
    const pct = wordCount > 0 ? Math.round((masteredCount / wordCount) * 100) : 0;

    return (
        <main className="flex-1 w-full">
            {/* ── Hero Section ── */}
            <section className="relative overflow-hidden bg-gradient-to-br from-accent/8 via-surface to-accent/5 border-b border-border">
                <div className="max-w-[1800px] w-full mx-auto px-5 py-10 sm:py-14">
                    <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
                        <div className="max-w-2xl">
                            <p className="text-xs font-semibold tracking-widest uppercase text-accent mb-2">
                                {t.brandTagline}
                            </p>
                            <h1 className="!text-[clamp(1.75rem,5vw,2.75rem)] !font-bold !leading-[1.1] !tracking-tight">
                                {t.home.title} <span className="text-accent">{t.home.titleAccent}</span>
                            </h1>
                            <p className="mt-3 text-text-muted text-base max-w-lg">{t.home.subtitle}</p>
                        </div>
                        {/* Big stat ring */}
                        <div className="flex items-center gap-5 shrink-0">
                            <div className="relative flex items-center justify-center size-28 sm:size-32">
                                <svg className="absolute inset-0 size-full -rotate-90" viewBox="0 0 100 100">
                                    <circle cx="50" cy="50" r="44" fill="none" stroke="var(--border)" strokeWidth="8" />
                                    <circle
                                        cx="50"
                                        cy="50"
                                        r="44"
                                        fill="none"
                                        stroke="var(--accent)"
                                        strokeWidth="8"
                                        strokeLinecap="round"
                                        strokeDasharray={`${pct * 2.765} 276.5`}
                                        className="transition-[stroke-dasharray] duration-700 ease-out"
                                    />
                                </svg>
                                <div className="flex flex-col items-center text-center">
                                    <span className="text-2xl sm:text-3xl font-extrabold text-accent tabular-nums">
                                        {pct}%
                                    </span>
                                    <span className="text-[0.625rem] text-text-muted leading-tight mt-0.5 max-w-[4rem]">
                                        {t.home.progress}
                                    </span>
                                </div>
                            </div>
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    <span className="size-2.5 rounded-full bg-accent" />
                                    <span className="text-sm text-text-h font-medium">
                                        {fmt(t.home.wordCountMeta, { count: wordCount })}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="size-2.5 rounded-full bg-success-text" />
                                    <span className="text-sm text-text-h font-medium">
                                        {t.home.masteredWords}: {masteredCount}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="size-2.5 rounded-full bg-amber-500" />
                                    <span className="text-sm text-text-h font-medium">
                                        {t.home.wordsRemaining}: {remaining}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <div className="max-w-[1800px] w-full mx-auto px-5 pb-12">
                {/* ── Stats ── */}
                <section className="mt-7 mb-7">
                    <FlashcardStatsPanel />
                </section>

                {/* ── Quick Nav ── */}
                <section className="mb-7">
                    <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">
                        {t.home.quickNav}
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        <Link
                            to="/vocabulary"
                            className="group flex flex-col gap-1.5 p-4 bg-surface border border-border rounded-xl no-underline text-text-h shadow-sm transition-all duration-200 hover:border-accent-border hover:shadow-theme hover:-translate-y-0.5"
                        >
                            <IconWordBank
                                className="text-accent transition-transform duration-200 group-hover:scale-110"
                                size={22}
                            />
                            <span className="font-semibold text-sm">{t.home.goWordBank}</span>
                            <span className="text-[0.75rem] text-text-muted">
                                {fmt(t.home.wordCountMeta, { count: wordCount })}
                            </span>
                        </Link>
                        <Link
                            to="/grammar"
                            className="group flex flex-col gap-1.5 p-4 bg-surface border border-border rounded-xl no-underline text-text-h shadow-sm transition-all duration-200 hover:border-accent-border hover:shadow-theme hover:-translate-y-0.5"
                        >
                            <IconGrammar
                                className="text-accent transition-transform duration-200 group-hover:scale-110"
                                size={22}
                            />
                            <span className="font-semibold text-sm">{t.home.goGrammar}</span>
                            <span className="text-[0.75rem] text-text-muted">
                                {fmt(t.home.grammarCountMeta, { count: grammarCount })}
                            </span>
                        </Link>
                        <Link
                            to="/sentences"
                            className="group flex flex-col gap-1.5 p-4 bg-surface border border-border rounded-xl no-underline text-text-h shadow-sm transition-all duration-200 hover:border-accent-border hover:shadow-theme hover:-translate-y-0.5"
                        >
                            <IconSentences
                                className="text-accent transition-transform duration-200 group-hover:scale-110"
                                size={22}
                            />
                            <span className="font-semibold text-sm">{t.nav.sentenceBank}</span>
                            <span className="text-[0.75rem] text-text-muted">
                                {sentenceCount} {t.nav.sentenceBank.toLowerCase()}
                            </span>
                        </Link>
                        <Link
                            to="/lessons"
                            className="group flex flex-col gap-1.5 p-4 bg-surface border border-border rounded-xl no-underline text-text-h shadow-sm transition-all duration-200 hover:border-accent-border hover:shadow-theme hover:-translate-y-0.5"
                        >
                            <IconLessons
                                className="text-accent transition-transform duration-200 group-hover:scale-110"
                                size={22}
                            />
                            <span className="font-semibold text-sm">{t.home.goLessons}</span>
                            <span className="text-[0.75rem] text-text-muted">
                                {fmt(t.home.lessonCountMeta, { count: lessonCount })}
                            </span>
                        </Link>
                        <Link
                            to="/flashcard"
                            className="group flex flex-col gap-1.5 p-4 border-2 border-accent-border rounded-xl no-underline text-text-h bg-accent-bg/60 shadow-sm transition-all duration-200 hover:border-accent hover:shadow-theme hover:-translate-y-0.5"
                        >
                            <IconFlashcard
                                className="text-accent transition-transform duration-200 group-hover:scale-110"
                                size={22}
                            />
                            <span className="font-semibold text-sm">{t.home.goFlashcard}</span>
                            <span className="text-[0.75rem] text-text-muted">
                                {fmt(t.home.flashcardMeta, { remaining })}
                            </span>
                        </Link>
                    </div>
                </section>

                {/* ── Recent Lessons ── */}
                {recentLessons.length > 0 && (
                    <section className="mb-7">
                        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">
                            {t.home.recentLessons}
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            {recentLessons.map((lesson) => (
                                <Link
                                    key={lesson.id}
                                    to={`/lessons/${lesson.id}`}
                                    className="group flex flex-col gap-2 p-4 bg-surface border border-border rounded-xl no-underline text-text-h shadow-sm transition-all duration-200 hover:border-accent-border hover:shadow-theme hover:-translate-y-0.5"
                                >
                                    <span className="font-semibold text-sm leading-snug group-hover:text-accent transition-colors">
                                        {lesson.name}
                                    </span>
                                    <div className="flex items-center gap-3 text-[0.75rem] text-text-muted">
                                        <span>
                                            {lesson.wordIds.length} {t.lessons.newWords}
                                        </span>
                                        <span className="text-border">·</span>
                                        <span>
                                            {lesson.grammar.filter((g) => g.title || g.content).length}{" "}
                                            {t.lessons.grammar}
                                        </span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </section>
                )}

                {/* ── CTA ── */}
                <section className="flex justify-center gap-3 mt-2 flex-wrap">
                    <Link to="/flashcard" className={btnClass("primary", "lg")}>
                        <IconFlashcard size={20} /> {t.home.startFlashcard}
                    </Link>
                </section>
            </div>
        </main>
    );
}
