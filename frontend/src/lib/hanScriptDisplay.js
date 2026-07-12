/**
 * Han display helpers — always traditional (phồn) primary with jyutping.
 */

export function displayRomanization(word) {
  return String(word.jyutping ?? '').trim()
}

export function displayHanPrimary(entity) {
  const trad = String(entity.hanTraditional ?? entity.han_traditional ?? '').trim()
  const simp = String(entity.hanSimplified ?? entity.han_simplified ?? '').trim()
  return trad || simp
}

/**
 * Order Han forms for display — traditional primary, simplified secondary.
 * @param {{ traditional?: string, simplified?: string }} options
 */
export function orderedHanVariants({ traditional, simplified }) {
  const trad = String(traditional ?? '').trim()
  const simp = String(simplified ?? '').trim()
  const value = trad || simp

  if (!value) {
    return { primary: '', secondary: '', primaryIsTraditional: true, same: true }
  }

  if (!trad || !simp || trad === simp) {
    return { primary: value, secondary: '', primaryIsTraditional: true, same: true }
  }

  return { primary: trad, secondary: simp, primaryIsTraditional: true, same: false }
}
