/** Build char → reading map from phienam API payload (array or record). */
export function buildCharHanVietMapFromPhienam(source) {
  const map = new Map()
  if (!source) return map

  if (source instanceof Map) return new Map(source)

  if (Array.isArray(source)) {
    for (const item of source) {
      if (!item?.char || !item?.reading) continue
      if (!map.has(item.char)) map.set(item.char, item.reading)
    }
    return map
  }

  for (const [ch, reading] of Object.entries(source)) {
    if (!ch || reading == null || reading === '') continue
    if (!map.has(ch)) map.set(ch, String(reading))
  }
  return map
}

/** Primary map wins over secondary when both define the same character. */
export function mergeCharHanVietMaps(primary, secondary) {
  const merged = new Map(secondary)
  for (const [ch, reading] of primary ?? []) merged.set(ch, reading)
  return merged
}
