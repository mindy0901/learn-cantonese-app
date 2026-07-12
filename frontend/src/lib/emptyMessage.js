export function withAdminHint(base, adminHint, isAdmin) {
  if (!isAdmin || !adminHint) return base
  return `${base} ${adminHint}`
}
