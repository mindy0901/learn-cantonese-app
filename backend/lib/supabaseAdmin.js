import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL?.replace(/\/rest\/v1\/?$/i, '').replace(/\/$/, '')
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim()

if (!url || !secretKey) {
  console.warn('Missing SUPABASE_URL or SUPABASE_SECRET_KEY — cloud routes will fail')
}

export const supabaseAdmin = url && secretKey
  ? createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null

export function requireAdmin() {
  if (!supabaseAdmin) throw Object.assign(new Error('Supabase not configured on server'), { status: 500 })
  return supabaseAdmin
}
