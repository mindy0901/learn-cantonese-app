import 'dotenv/config'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import session from 'express-session'
import { authRouter } from './routes/auth.js'
import { cedictRouter } from './routes/cedict.js'
import { dataRouter } from './routes/data.js'
import { hanvietRouter } from './routes/hanviet.js'

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173'
const cookieSecure =
  process.env.COOKIE_SECURE != null
    ? process.env.COOKIE_SECURE === 'true'
    : process.env.NODE_ENV === 'production'

const app = express()
app.set('trust proxy', 1)

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  }),
)
app.use(express.json({ limit: '50mb' }))
app.use(cookieParser())
app.use(
  session({
    name: 'cantonese.sid',
    secret: process.env.SESSION_SECRET ?? 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: cookieSecure ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
)

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/auth', authRouter)
app.use('/api/cedict', cedictRouter)
app.use('/api/hanviet', hanvietRouter)
app.use('/api', dataRouter)

app.use((err, _req, res, _next) => {
  console.error('[server] Request handler error —', err.message ?? err)
  res.status(err.status ?? 500).json({ error: err.message ?? 'Server error' })
})

import { warmCedictIndex } from './lib/cedictSearch.js'
import { warmHanVietCognatesIndex } from './lib/hanVietCognates.js'

warmCedictIndex()
warmHanVietCognatesIndex()

export default app
