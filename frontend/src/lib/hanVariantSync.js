import { ensureHanVariants } from './opencc.js'

function resolveHan(word) {
  return ensureHanVariants({
    hanTraditional: word.hanTraditional,
    hanSimplified: word.hanSimplified,
    hanTrad: word.hanTrad,
    han: word.han,
  })
}

/** Preview OpenCC traditional/simplified updates for all words. */
export function previewHanVariantSync(words) {
  const updates = []

  for (const word of words ?? []) {
    const prevTrad = String(word.hanTraditional ?? word.hanTrad ?? word.han ?? '').trim()
    const prevSimp = String(word.hanSimplified ?? '').trim()
    if (!prevTrad && !prevSimp) continue

    const next = resolveHan(word)
    const nextTrad = next.hanTraditional.trim()
    const nextSimp = next.hanSimplified.trim()

    if (prevTrad !== nextTrad || prevSimp !== nextSimp) {
      updates.push({
        id: word.id,
        hanTraditional: prevTrad || nextTrad,
        prevHanTraditional: prevTrad,
        nextHanTraditional: nextTrad,
        prevHanSimplified: prevSimp,
        nextHanSimplified: nextSimp,
        popularity: word.popularity,
      })
    }
  }

  return { updates, wordCount: words?.length ?? 0 }
}

export function formatHanVariant(value) {
  const text = String(value ?? '').trim()
  return text || '—'
}
