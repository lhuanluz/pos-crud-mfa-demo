import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import speakeasy from 'speakeasy'
import QRCode from 'qrcode'
import { z } from 'zod'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const app = express()
const PORT = Number(process.env.PORT || 3001)
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me'
const isProd = process.env.NODE_ENV === 'production'

app.use(helmet({ contentSecurityPolicy: false }))
app.use(cors({ origin: isProd ? false : ['http://localhost:5173', 'http://127.0.0.1:5173'], credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use('/api/auth', rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false }))

const db = new Database(path.join(process.cwd(), 'data.db'))
db.pragma('journal_mode = WAL')
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator',
  mfa_secret TEXT,
  mfa_enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  price REAL NOT NULL CHECK(price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`)

const countUsers = db.prepare('SELECT COUNT(*) as total FROM users').get().total
if (countUsers === 0) {
  const email = process.env.ADMIN_EMAIL || 'admin@example.com'
  const password = process.env.ADMIN_PASSWORD || 'Admin123!'
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run('Administrador', email, bcrypt.hashSync(password, 12), 'admin')
}
const countProducts = db.prepare('SELECT COUNT(*) as total FROM products').get().total
if (countProducts === 0) {
  const insert = db.prepare('INSERT INTO products (name, sku, price, stock, description) VALUES (?, ?, ?, ?, ?)')
  insert.run('Notebook Corporativo', 'NOTE-001', 5499.9, 8, 'Produto de exemplo para validar CRUD')
  insert.run('Token FIDO2', 'SEC-KEY-001', 299.9, 30, 'Chave de segurança para futura evolução MFA')
}

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) })
const otpSchema = z.object({ tempToken: z.string(), token: z.string().regex(/^\d{6}$/) })
const userSchema = z.object({ name: z.string().min(2), email: z.string().email(), role: z.enum(['admin','operator']).default('operator'), password: z.string().min(8).optional() })
const productSchema = z.object({ name: z.string().min(2), sku: z.string().min(2), price: z.coerce.number().nonnegative(), stock: z.coerce.number().int().nonnegative(), description: z.string().optional().nullable() })

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email, role: row.role, mfaEnabled: Boolean(row.mfa_enabled), createdAt: row.created_at, updatedAt: row.updated_at }
}
function signSession(user) { return jwt.sign({ sub: user.id, email: user.email, role: user.role, type: 'session' }, JWT_SECRET, { expiresIn: '8h' }) }
function signTemp(userId) { return jwt.sign({ sub: userId, type: 'mfa' }, JWT_SECRET, { expiresIn: '5m' }) }
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    if (payload.type !== 'session') throw new Error('invalid token type')
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub)
    if (!user) return res.status(401).json({ error: 'Sessão inválida' })
    req.user = user
    next()
  } catch { return res.status(401).json({ error: 'Autenticação necessária' }) }
}
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores' })
  next()
}
function parse(schema, body, res) {
  const result = schema.safeParse(body)
  if (!result.success) { res.status(400).json({ error: 'Entrada inválida', details: result.error.flatten() }); return null }
  return result.data
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'pos-crud-mfa-demo' }))
app.post('/api/auth/login', async (req, res) => {
  const body = parse(loginSchema, req.body, res); if (!body) return
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(body.email.toLowerCase())
  if (!user || !bcrypt.compareSync(body.password, user.password_hash)) return res.status(401).json({ error: 'Credenciais inválidas' })
  let setup = null
  if (!user.mfa_enabled || !user.mfa_secret) {
    const secret = speakeasy.generateSecret({ name: `CRUD MFA Demo (${user.email})`, issuer: 'POS CRUD MFA Demo' })
    db.prepare('UPDATE users SET mfa_secret = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(secret.base32, user.id)
    setup = { secret: secret.base32, otpauthUrl: secret.otpauth_url, qrDataUrl: await QRCode.toDataURL(secret.otpauth_url) }
  }
  res.json({ mfaRequired: true, setupRequired: Boolean(setup), tempToken: signTemp(user.id), setup })
})
app.post('/api/auth/verify-otp', (req, res) => {
  const body = parse(otpSchema, req.body, res); if (!body) return
  try {
    const payload = jwt.verify(body.tempToken, JWT_SECRET)
    if (payload.type !== 'mfa') throw new Error('invalid token type')
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub)
    if (!user?.mfa_secret) return res.status(401).json({ error: 'MFA não inicializado' })
    const ok = speakeasy.totp.verify({ secret: user.mfa_secret, encoding: 'base32', token: body.token, window: 1 })
    if (!ok) return res.status(401).json({ error: 'Código OTP inválido' })
    if (!user.mfa_enabled) db.prepare('UPDATE users SET mfa_enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id)
    res.json({ token: signSession(user), user: publicUser({ ...user, mfa_enabled: 1 }) })
  } catch { return res.status(401).json({ error: 'Token MFA expirado ou inválido' }) }
})
app.get('/api/me', requireAuth, (req, res) => res.json(publicUser(req.user)))

app.get('/api/users', requireAuth, requireAdmin, (_req, res) => res.json(db.prepare('SELECT * FROM users ORDER BY id DESC').all().map(publicUser)))
app.post('/api/users', requireAuth, requireAdmin, (req, res) => {
  const body = parse(userSchema.extend({ password: z.string().min(8) }), req.body, res); if (!body) return
  try {
    const info = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(body.name, body.email.toLowerCase(), bcrypt.hashSync(body.password, 12), body.role)
    res.status(201).json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)))
  } catch (e) { res.status(409).json({ error: 'E-mail já cadastrado' }) }
})
app.put('/api/users/:id', requireAuth, requireAdmin, (req, res) => {
  const body = parse(userSchema, req.body, res); if (!body) return
  const exists = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
  if (!exists) return res.status(404).json({ error: 'Usuário não encontrado' })
  try {
    if (body.password) db.prepare('UPDATE users SET name=?, email=?, role=?, password_hash=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(body.name, body.email.toLowerCase(), body.role, bcrypt.hashSync(body.password, 12), req.params.id)
    else db.prepare('UPDATE users SET name=?, email=?, role=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(body.name, body.email.toLowerCase(), body.role, req.params.id)
    res.json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)))
  } catch { res.status(409).json({ error: 'E-mail já cadastrado' }) }
})
app.delete('/api/users/:id', requireAuth, requireAdmin, (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'Não remova o próprio usuário logado' })
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id)
  if (!info.changes) return res.status(404).json({ error: 'Usuário não encontrado' })
  res.status(204).send()
})

app.get('/api/products', requireAuth, (_req, res) => res.json(db.prepare('SELECT * FROM products ORDER BY id DESC').all()))
app.post('/api/products', requireAuth, (req, res) => {
  const body = parse(productSchema, req.body, res); if (!body) return
  try { const info = db.prepare('INSERT INTO products (name, sku, price, stock, description) VALUES (?, ?, ?, ?, ?)').run(body.name, body.sku, body.price, body.stock, body.description || null); res.status(201).json(db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid)) }
  catch { res.status(409).json({ error: 'SKU já cadastrado' }) }
})
app.put('/api/products/:id', requireAuth, (req, res) => {
  const body = parse(productSchema, req.body, res); if (!body) return
  try { const info = db.prepare('UPDATE products SET name=?, sku=?, price=?, stock=?, description=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(body.name, body.sku, body.price, body.stock, body.description || null, req.params.id); if (!info.changes) return res.status(404).json({ error: 'Produto não encontrado' }); res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id)) }
  catch { res.status(409).json({ error: 'SKU já cadastrado' }) }
})
app.delete('/api/products/:id', requireAuth, (req, res) => {
  const info = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id)
  if (!info.changes) return res.status(404).json({ error: 'Produto não encontrado' })
  res.status(204).send()
})

if (isProd) {
  const dist = path.join(__dirname, '..', 'dist')
  app.use(express.static(dist))
  app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

app.listen(PORT, () => console.log(`API disponível em http://localhost:${PORT}`))
