import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useVocabularies, useLesson, useAppActions } from "../store/appStore.js";
import { useLocale } from "../store/localeStore.js";
import { useIsAdmin, useIsSignedIn } from "../store/authStore.js";
import { WordFieldText } from "../components/WordFieldText.jsx";
import { HanziiHanCellLink } from "../components/HanziiHanCellLink.jsx";
import { btnClass } from "../components/ui/buttonStyles.js";
import { cn } from "../lib/cn.js";
import { useOpenWordDetail } from "../hooks/useOpenWordDetail.js";
import { logWarn } from "../lib/actionLog.js";

export function LessonDetailPage() {
    const { id } = useParams();
    const words = useVocabularies();
    const lesson = useLesson(id);
    const { ensureVocabulariesByIds } = useAppActions();
    const { t, fmt } = useLocale();
    const isAdmin = useIsAdmin();
    const canMark = useIsSignedIn();
    const openWordDetail = useOpenWordDetail();
    const [hideMastered, setHideMastered] = useState(true);

    useEffect(() => {
        if (!lesson?.wordIds?.length) return;
        ensureVocabulariesByIds(lesson.wordIds).catch((err) => {
            logWarn("Load lesson words failed", err instanceof Error ? err.message : err);
        });
    }, [lesson, ensureVocabulariesByIds]);

    if (!lesson) {
        return (
            <main className="flex-1 max-w-[1800px] w-full mx-auto px-5 py-8 pb-12">
                <div className="text-center py-12 px-6 text-text-muted flex flex-col items-center gap-4">
                    <p>{t.lessons.notFound}</p>
                    <Link to="/lessons" className={btnClass("primary")}>
                        {t.lessons.backToList}
                    </Link>
                </div>
            </main>
        );
    }

    const lessonWords = lesson.wordIds.map((wid) => words.find((w) => w.id === wid)).filter(Boolean);
    const visibleWords = hideMastered ? lessonWords.filter((w) => !w.mastered) : lessonWords;
    const grammarSections = lesson.grammar.filter((g) => g.title.trim() || g.content.trim());
    const visibleGrammar = hideMastered ? grammarSections.filter((g) => !g.mastered) : grammarSections;
    const masteredWordCount = lessonWords.filter((w) => w.mastered).length;

    return (
        <main className="flex-1 max-w-[1800px] w-full mx-auto px-5 py-8 pb-12">
            <div className="flex items-start justify-between gap-4 mb-6 max-sm:flex-col">
                <div>
                    <h1>{lesson.name}</h1>
                    <p className="mt-1 text-text-muted text-sm">
                        {fmt(t.lessonDetail.meta, { words: lessonWords.length, grammar: grammarSections.length })}
                        {masteredWordCount > 0 &&
                            ` · ${fmt(t.lessonDetail.masteredCount, { count: masteredWordCount })}`}
                    </p>
                </div>
                <div className="flex gap-2 shrink-0">
                    {isAdmin && (
                        <Link to={`/lessons/${lesson.id}/edit`} className={btnClass("outline")}>
                            {t.common.edit}
                        </Link>
                    )}
                </div>
            </div>

            <section className="bg-surface border border-border rounded-xl px-5 sm:px-6 py-5 mb-5 shadow-theme-sm [&_h2]:mb-3">
                <h2>{t.lessonDetail.vocabTitle}</h2>
                {lessonWords.length === 0 ? (
                    <p className="text-text-muted text-sm">
                        {lessonWords.length > 0 ? t.lessonDetail.allWordsMastered : t.lessonDetail.noVocab}
                    </p>
                ) : (
                    <div className="overflow-auto border border-border rounded-xl bg-surface">
                        <table className="w-full border-collapse text-sm">
                            <thead>
                                <tr>
                                    <th className="px-2 py-2.5 text-center border-b border-border bg-bg text-text-muted font-medium text-xs uppercase tracking-wide w-10">
                                        #
                                    </th>
                                    <th className="px-3.5 py-2.5 text-left border-b border-border bg-bg text-text-muted font-medium text-xs uppercase tracking-wide">
                                        {t.wordBank.colSinoVietnamese}
                                    </th>
                                    <th
                                        className="px-2 py-2.5 text-center border-b border-border bg-bg text-text-muted font-medium text-xs uppercase tracking-wide"
                                        colSpan={2}
                                    >
                                        Hán tự
                                    </th>
                                    <th className="px-3.5 py-2.5 text-left border-b border-border bg-bg text-text-muted font-medium text-xs uppercase tracking-wide">
                                        {t.wordBank.colJyutping}
                                    </th>
                                    <th className="px-3.5 py-2.5 text-left border-b border-border bg-bg text-text-muted font-medium text-xs uppercase tracking-wide">
                                        Pinyin
                                    </th>
                                    <th className="px-3.5 py-2.5 text-left border-b border-border bg-bg text-text-muted font-medium text-xs uppercase tracking-wide min-w-[200px]">
                                        {t.wordBank.colVietMeanings}
                                    </th>
                                    <th className="px-3.5 py-2.5 text-left border-b border-border bg-bg text-text-muted font-medium text-xs uppercase tracking-wide min-w-[200px]">
                                        {t.wordBank.colEngMeanings}
                                    </th>
                                    {canMark && (
                                        <th className="px-3.5 py-2.5 text-left border-b border-border bg-bg text-text-muted font-medium text-xs uppercase tracking-wide">
                                            {t.wordBank.colStar}
                                        </th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="[&_tr:last-child]:border-b-0">
                                {lessonWords.map((word, idx) => {
                                    const simp = word.hanSimplified || word.hanTraditional;
                                    const trad = word.hanTraditional || word.hanSimplified;
                                    const same = simp === trad;
                                    return (
                                        <tr
                                            key={word.id}
                                            className={cn(
                                                "border-b border-border cursor-pointer hover:bg-accent-bg",
                                                word.mastered && "opacity-75",
                                            )}
                                            onClick={() => openWordDetail(word)}
                                            title={t.wordBank.clickToView}
                                        >
                                            <td className="px-2 py-2.5 align-middle text-center text-text-muted text-xs w-10">
                                                {idx + 1}
                                            </td>
                                            <td className="px-3.5 py-2.5 align-middle whitespace-nowrap">
                                                <WordFieldText
                                                    word={word}
                                                    field="sinoVietnamese"
                                                    updatingLabel={t.wordBank.fieldUpdating}
                                                />
                                            </td>
                                            <td
                                                className={cn(
                                                    "px-2 py-2.5 align-middle text-center whitespace-nowrap text-2xl",
                                                    "text-han",
                                                )}
                                                colSpan={2}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <HanziiHanCellLink hanTraditional={simp} />
                                                {!same && (
                                                    <span className="text-accent text-xl mx-1.5 font-light opacity-60">
                                                        /
                                                    </span>
                                                )}
                                                {!same && <HanziiHanCellLink hanTraditional={trad} />}
                                            </td>
                                            <td className="px-3.5 py-2.5 align-middle text-jyutping font-semibold text-[calc(0.9375rem*var(--jyutping-scale))] leading-snug tracking-wide whitespace-nowrap">
                                                {word.jyutping ?? "—"}
                                            </td>
                                            <td className="px-3.5 py-2.5 align-middle text-pinyin leading-snug whitespace-nowrap">
                                                {word.pinyin || "—"}
                                            </td>
                                            <td className="px-3.5 py-2.5 align-middle text-viet min-w-[200px]">
                                                <WordFieldText
                                                    word={word}
                                                    field="vietMeanings"
                                                    updatingLabel={t.wordBank.fieldUpdating}
                                                />
                                            </td>
                                            <td className="px-3.5 py-2.5 align-middle leading-snug">
                                                <WordFieldText
                                                    word={word}
                                                    field="engMeanings"
                                                    updatingLabel={t.wordBank.fieldUpdating}
                                                />
                                            </td>
                                            {canMark && (
                                                <td className="px-3.5 py-2.5 align-middle">
                                                    {word.important ? "★" : ""}
                                                    {word.mastered ? " ✓" : ""}
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className="bg-surface border border-border rounded-xl px-5 sm:px-6 py-5 mb-5 shadow-theme-sm [&_h2]:mb-3">
                <h2>{t.lessonDetail.grammarTitle}</h2>
                {grammarSections.length === 0 ? (
                    <p className="text-text-muted text-sm">
                        {lessonWords.length > 0 && grammarSections.length > 0
                            ? t.lessonDetail.allGrammarMastered
                            : t.lessonDetail.noGrammar}
                    </p>
                ) : (
                    <div className="flex flex-col gap-4">
                        {grammarSections.map((section) => (
                            <article
                                key={section.id}
                                className={cn(
                                    "px-6 py-5 border border-border rounded-xl bg-surface",
                                    section.mastered && "opacity-80 border-success-border",
                                )}
                            >
                                <div
                                    className="prose max-w-none text-text leading-relaxed whitespace-pre-line
                                    [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-text-h [&_h1]:mt-0 [&_h1]:mb-4
                                    [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-text-h [&_h2]:mt-6 [&_h2]:mb-3
                                    [&_h3]:text-base [&_h3]:font-medium [&_h3]:text-text-h [&_h3]:mt-4 [&_h3]:mb-2
                                    [&_p]:my-2 [&_p]:leading-relaxed
                                    [&_hr]:my-5 [&_hr]:border-border
                                    [&_strong]:text-text-h [&_strong]:font-semibold
                                    [&_ul]:my-3 [&_ul]:pl-5 [&_li]:my-1 [&_li]:text-text
                                    [&_ol]:my-3 [&_ol]:pl-5
                                    [&_table]:w-full [&_table]:border-collapse [&_table]:my-4
                                    [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:bg-bg [&_th]:text-text-h [&_th]:text-sm [&_th]:font-medium
                                    [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:text-sm
                                    [&_code]:bg-bg [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-accent [&_code]:text-sm"
                                >
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        components={{
                                            p: ({ children }) => {
                                                const text = String(children);
                                                if (/^[A-C]:/.test(text)) {
                                                    const speaker = text[0];
                                                    const colors = {
                                                        A: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30",
                                                        B: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30",
                                                        C: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30",
                                                    };
                                                    return (
                                                        <p
                                                            className={`my-1 px-3 py-1.5 rounded-md leading-relaxed ${colors[speaker] || ""}`}
                                                        >
                                                            {children}
                                                        </p>
                                                    );
                                                }
                                                return <p className="my-2 leading-relaxed">{children}</p>;
                                            },
                                        }}
                                    >
                                        {section.content
                                            .replace(/([。？！])\s*([A-C]:)/g, "$1\n\n$2")
                                            .replace(/\n(?=[A-C]:)/g, "\n\n")}
                                    </ReactMarkdown>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>

            <Link to="/lessons" className={btnClass("ghost")}>
                {t.lessonDetail.back}
            </Link>
        </main>
    );
}
