import { spawn } from 'node:child_process'
import speakeasy from 'speakeasy'

const base = 'http://127.0.0.1:3001'
const env = { ...process.env, PORT: '3001', JWT_SECRET: 'smoke-secret', ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: 'Admin123!' }
const child = spawn('node', ['server/index.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
const wait = (ms) => new Promise(r => setTimeout(r, ms))
async function request(path, options={}) {
  const res = await fetch(base + path, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } })
  const text = await res.text()
  const body = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(`${res.status} ${path}: ${body?.error || text}`)
  return body
}
try {
  for (let i=0;i<50;i++) { try { await request('/api/health'); break } catch { await wait(100) } }
  const login = await request('/api/auth/login', { method:'POST', body: JSON.stringify({ email:'admin@example.com', password:'Admin123!' }) })
  const otp = speakeasy.totp({ secret: login.setup.secret, encoding:'base32' })
  const verified = await request('/api/auth/verify-otp', { method:'POST', body: JSON.stringify({ tempToken: login.tempToken, token: otp }) })
  const auth = { Authorization: `Bearer ${verified.token}` }
  const product = await request('/api/products', { method:'POST', headers: auth, body: JSON.stringify({ name:'Produto Smoke', sku:`SMOKE-${Date.now()}`, price:10.5, stock:2, description:'Criado pelo smoke test' }) })
  const updated = await request(`/api/products/${product.id}`, { method:'PUT', headers: auth, body: JSON.stringify({ ...product, price:12, stock:3 }) })
  await request(`/api/products/${product.id}`, { method:'DELETE', headers: auth })
  const users = await request('/api/users', { headers: auth })
  console.log(JSON.stringify({ health:'ok', loginMfa: login.mfaRequired, productCrud:'ok', userCount:users.length, updatedPrice:updated.price }, null, 2))
} finally {
  child.kill('SIGTERM')
}
