import { logStep } from './lib/actionLog.js'
import { warmCedictIndex } from './lib/cedictSearch.js'
import { warmHanVietCognatesIndex } from './lib/hanVietCognates.js'
import app from './app.js'

const BACKEND_PORT = Number(process.env.BACKEND_PORT ?? process.env.PORT) || 3001
const BACKEND_HOST = process.env.BACKEND_HOST ?? process.env.HOST ?? '127.0.0.1'

app.listen(BACKEND_PORT, BACKEND_HOST, () => {
  logStep('server', `Server running on port ${BACKEND_PORT}`, `http://${BACKEND_HOST}:${BACKEND_PORT}`)
  warmCedictIndex()
  warmHanVietCognatesIndex()
})
