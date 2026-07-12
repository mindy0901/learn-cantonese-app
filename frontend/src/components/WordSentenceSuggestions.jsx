import { useMemo } from 'react'
import { cn } from '../lib/cn.js'
import { filterSentencePatternsForWord } from '../lib/sentencePatternMatch.js'
import { displayHanPrimary } from '../lib/hanScriptDisplay.js'
import { useLocale } from '../store/localeStore.js'
import { useSentencePatterns } from '../store/appStore.js'

const itemClass =
  'w-full rounded-xl border border-border/70 bg-bg/50 px-4 py-3 text-left'

export function WordSentenceSuggestions({ word }) {
  const { t } = useLocale()
  const sentencePatterns = useSentencePatterns()

  const suggestions = useMemo(
    () => filterSentencePatternsForWord(sentencePatterns, word),
    [sentencePatterns, word],
  )

  if (suggestions.length === 0) return null

  return (
    <section className="w-full min-w-0 pt-4 text-left">
      <h4 className="m-0 mb-3 text-center text-sm font-semibold uppercase tracking-wide text-text-muted">
        {t.wordDetail.sentenceSuggestions}
      </h4>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {suggestions.map((item) => (
          <li key={item.id} className={itemClass}>
            <p className={cn('m-0 font-semibold text-text-h')}>{displayHanPrimary(item)}</p>
            {item.jyutping && (
              <p className={cn('m-0 mt-1 text-sm font-semibold text-jyutping')}>{item.jyutping}</p>
            )}
            <p className={cn('m-0 mt-1 text-sm text-viet')}>{item.vietnamese}</p>
            {item.english && <p className={cn('m-0 mt-0.5 text-sm text-text-muted')}>{item.english}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}
