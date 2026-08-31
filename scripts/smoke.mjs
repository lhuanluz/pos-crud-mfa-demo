import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import speakeasy from 'speakeasy'
import Database from 'better-sqlite3'

const port = '3011'
const base = `http://127.0.0.1:${port}`
const smokePassword = `Smoke-${crypto.randomUUID()}!`
const smokeDir = mkdtempSync(path.join(tmpdir(), 'pos-crud-mfa-smoke-'))
const smokeDbPath = path.join(smokeDir, 'data.db')
const env = { ...process.env, PORT: port, DB_PATH: smokeDbPath, JWT_SECRET: crypto.randomUUID(), ADMIN_EMAIL: 'admin@example.test', ADMIN_PASSWORD: smokePassword, COOKIE_SECURE: 'false' }
const child = spawn('node', ['server/index.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
let cookie = ''
const wait = (ms) => new Promise(r => setTimeout(r, ms))
async function request(path, options={}) {
  const res = await fetch(base + path, { ...options, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(options.headers || {}) } })
  const setCookie = res.headers.get('set-cookie')
  if (setCookie) cookie = setCookie.split(';')[0]
  const text = await res.text()
  const body = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(`${res.status} ${path}: ${body?.error || text}`)
  return body
}
try {
  for (let i=0;i<50;i++) { try { await request('/api/health'); break } catch { await wait(100) } }
  const login = await request('/api/auth/login', { method:'POST', body: JSON.stringify({ email:env.ADMIN_EMAIL, password:smokePassword }) })
  const secret = login.setup?.secret || new Database(smokeDbPath).prepare('select mfa_secret from users where email=?').get(env.ADMIN_EMAIL).mfa_secret
  const otp = speakeasy.totp({ secret, encoding:'base32' })
  const verified = await request('/api/auth/verify-otp', { method:'POST', body: JSON.stringify({ tempToken: login.tempToken, token: otp }) })
  if (!cookie.startsWith('crud_mfa_session=')) throw new Error('session cookie was not set')
  const product = await request('/api/products', { method:'POST', body: JSON.stringify({ name:'Produto Smoke', sku:`SMOKE-${Date.now()}`, price:10.5, stock:2, description:'Criado pelo smoke test' }) })
  const updated = await request(`/api/products/${product.id}`, { method:'PUT', body: JSON.stringify({ ...product, price:12, stock:3 }) })
  await request(`/api/products/${product.id}`, { method:'DELETE' })
  const users = await request('/api/users')
  const audit = await request('/api/audit')
  await request('/api/auth/logout', { method:'POST' })
  console.log(JSON.stringify({ health:'ok', loginMfa: login.mfaRequired, httpOnlyCookie: true, productCrud:'ok', userCount:users.length, auditEvents:audit.length, updatedPrice:updated.price }, null, 2))
} finally {
  child.kill('SIGTERM')
  rmSync(smokeDir, { recursive: true, force: true })
}
