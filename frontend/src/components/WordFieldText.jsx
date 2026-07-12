import { cn } from '../lib/cn.js'
import { isWordFieldPending, wordFieldDisplayText } from '../lib/wordDisplay.js'

/** Pending fields stay readable (not muted) but italicized. */
export const wordFieldPendingClass = 'italic !text-text-h'

export function WordFieldText({
  word,
  field,
  updatingLabel,
  className,
  pendingClassName = wordFieldPendingClass,
}) {
  const pending = isWordFieldPending(word, field)
  const text = wordFieldDisplayText(word, field, updatingLabel)

  return <span className={cn(className, pending && pendingClassName)}>{text}</span>
}
