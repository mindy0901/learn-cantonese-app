import { cn } from "../lib/cn.js";
import { isVocabularyFieldPending, vocabularyFieldDisplayText } from "../lib/wordDisplay.js";

/** Pending fields stay readable (not muted) but italicized. */
export const wordFieldPendingClass = "italic !text-text-h";

export function WordFieldText({
    vocab,
    word,
    field,
    updatingLabel,
    className,
    pendingClassName = wordFieldPendingClass,
}) {
    const item = vocab ?? word;
    const pending = isVocabularyFieldPending(item, field);
    const text = vocabularyFieldDisplayText(item, field, updatingLabel);

    return <span className={cn(className, pending && pendingClassName)}>{text}</span>;
}
