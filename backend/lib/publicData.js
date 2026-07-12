import { getAdminEmails } from './appAdmin.js'
import { findUserByEmail } from './dataService.js'

let cachedPublicUserId = null

export async function getPublicDataUserId(db) {
  if (cachedPublicUserId) return cachedPublicUserId

  const email = process.env.PUBLIC_DATA_EMAIL?.trim() || [...getAdminEmails()][0]
  if (!email) {
    const err = new Error('PUBLIC_DATA_EMAIL or ADMIN_EMAILS must be configured')
    err.status = 503
    throw err
  }

  const user = await findUserByEmail(db, email)
  if (!user) {
    const err = new Error(`Public data owner not found: ${email}`)
    err.status = 503
    throw err
  }

  cachedPublicUserId = user.id
  return cachedPublicUserId
}

/** Anonymous visitors read the public catalog; signed-in users read their own data. */
export async function resolveReadUserId(req, db) {
  if (req.session?.userId) return req.session.userId
  return getPublicDataUserId(db)
}
