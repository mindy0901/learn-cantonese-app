import { isAppAdmin } from '../lib/appAdmin.js'
import { logFail } from '../lib/actionLog.js'

export function requireAppAdmin(req, res, next) {
  if (!isAppAdmin(req.session?.email)) {
    logFail('auth', 'CHECK ADMIN', `${req.session?.email?.split('@')[0] ?? 'guest'} (403)`)
    return res.status(403).json({ error: 'Admin only' })
  }
  next()
}
