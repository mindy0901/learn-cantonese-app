import { logFail } from '../lib/actionLog.js'

export function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    logFail('auth', 'CHECK AUTH', 'not signed in (401)')
    return res.status(401).json({ error: 'Not signed in' })
  }
  next()
}

export function getUserId(req) {
  return req.session.userId
}
