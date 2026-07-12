import { useLocale } from '../store/localeStore.js'
import { orderedHanVariants } from '../lib/hanScriptDisplay.js'
import { HanziiHanCellLink } from './HanziiHanCellLink.jsx'
import { cn } from '../lib/cn.js'

const sizeClasses = {
  md: {
    primary: 'text-[length:calc(1.375rem*var(--han-scale))]',
    secondary: 'text-[length:calc(1rem*var(--han-scale))]',
  },
  lg: {
    primary: 'text-[length:calc(1.75rem*var(--han-scale))]',
    secondary: 'text-[length:calc(1.125rem*var(--han-scale))]',
  },
}

function HanGlyph({ displayText, lookupTraditional, popularity, emphasis }) {
  return (
    <HanziiHanCellLink
      hanTraditional={lookupTraditional}
      displayText={displayText}
      popularity={popularity}
      emphasis={emphasis}
    />
  )
}

export function HanVariantsInline({
  traditional,
  simplified,
  popularity,
  size = 'md',
  className,
}) {
  const { t } = useLocale()
  const trad = String(traditional ?? '').trim()
  const simp = String(simplified ?? '').trim()
  const lookupTraditional = trad || simp
  const ordered = orderedHanVariants({ traditional: trad, simplified: simp })
  const sizes = sizeClasses[size] ?? sizeClasses.md

  if (!ordered.primary) return '—'

  if (ordered.same || !ordered.secondary) {
    return (
      <span className={cn(sizes.primary, 'leading-tight shrink-0', className)}>
        <HanGlyph
          displayText={ordered.primary}
          lookupTraditional={lookupTraditional}
          popularity={popularity}
          emphasis="primary"
        />
      </span>
    )
  }

  const primaryIsTraditional = ordered.primaryIsTraditional
  const primaryText = primaryIsTraditional ? trad : simp
  const secondaryText = primaryIsTraditional ? simp : trad

  return (
    <span className={cn('inline-flex flex-wrap items-baseline gap-x-4 gap-y-1', className)}>
      <span className={cn(sizes.primary, 'leading-tight shrink-0')}>
        <HanGlyph
          displayText={primaryText}
          lookupTraditional={lookupTraditional}
          popularity={popularity}
          emphasis="primary"
        />
      </span>
      <span className={cn(sizes.secondary, 'leading-tight shrink-0')}>
        <span className="sr-only">
          {primaryIsTraditional ? t.hanLookup.simplified : t.hanLookup.traditionalHk}:{' '}
        </span>
        <HanGlyph
          displayText={secondaryText}
          lookupTraditional={lookupTraditional}
          popularity={popularity}
          emphasis="secondary"
        />
      </span>
    </span>
  )
}
