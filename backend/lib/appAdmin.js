export function getAdminEmails() {
  return new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function isAppAdmin(email) {
  if (!email) return false
  const admins = getAdminEmails()
  return admins.size > 0 && admins.has(email.toLowerCase())
}
