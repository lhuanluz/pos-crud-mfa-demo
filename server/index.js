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
const isProd = process.env.NODE_ENV === 'production'
const COOKIE_NAME = 'crud_mfa_session'

const INSECURE_PLACEHOLDERS = new Set([
  'GENERATE_A_LONG_RANDOM_SECRET_BEFORE_RUNNING',
  'GENERATE_A_STRONG_ADMIN_PASSWORD',
  'YOUR_ADMIN_EMAIL',
  ['troque', 'este', 'segredo', 'em', 'producao'].join('-'),
  ['troque', 'este', 'segredo', 'antes', 'do', 'deploy'].join('-'),
  ['dev', 'only', 'change', 'me'].join('-'),
  ['smoke', 'secret'].join('-'),
  ['Admin', '123!'].join(''),
  ['admin', 'example.com'].join('@'),
])

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`)
  if (INSECURE_PLACEHOLDERS.has(value)) throw new Error(`Variável obrigatória contém placeholder inseguro: ${name}`)
  return value
}

function requiredBooleanEnv(name, fallback) {
  const value = process.env[name]?.trim().toLowerCase()
  if (!value) return fallback
  if (value !== 'true' && value !== 'false') throw new Error(`Variável booleana inválida: ${name}`)
  return value === 'true'
}

const JWT_SECRET = requiredEnv('JWT_SECRET')
if (JWT_SECRET.length < 32) throw new Error('JWT_SECRET deve ter pelo menos 32 caracteres aleatórios')
const cookieSecure = requiredBooleanEnv('COOKIE_SECURE', isProd)

app.set('trust proxy', 1)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", 'data:'],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'"],
      upgradeInsecureRequests: cookieSecure ? [] : null,
    }
  },
  crossOriginEmbedderPolicy: false,
  frameguard: { action: 'deny' }
}))
app.use(cors({ origin: isProd ? false : ['http://localhost:5173', 'http://127.0.0.1:5173'], credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use('/api/auth', rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false }))

const db = new Database(process.env.DB_PATH || path.join(process.cwd(), 'data.db'))
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
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER,
  actor_email TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  success INTEGER NOT NULL,
  ip TEXT,
  user_agent TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`)

const countUsers = db.prepare('SELECT COUNT(*) as total FROM users').get().total
if (countUsers === 0) {
  const email = requiredEnv('ADMIN_EMAIL').toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('ADMIN_EMAIL deve ser um e-mail válido')
  const password = requiredEnv('ADMIN_PASSWORD')
  if (password.length < 12) throw new Error('ADMIN_PASSWORD deve ter pelo menos 12 caracteres')
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
function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(part => {
    const index = part.indexOf('=')
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))]
  }))
}
function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, { httpOnly: true, sameSite: 'lax', secure: cookieSecure, maxAge: 8 * 60 * 60 * 1000, path: '/' })
}
function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: cookieSecure, path: '/' })
}
function audit(req, { action, entity, entityId = null, success = true, details = null, actor = req.user || null }) {
  try {
    db.prepare('INSERT INTO audit_logs (actor_user_id, actor_email, action, entity, entity_id, success, ip, user_agent, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(actor?.id || null, actor?.email || null, action, entity, entityId == null ? null : String(entityId), success ? 1 : 0, req.ip, req.headers['user-agent'] || null, details ? JSON.stringify(details) : null)
  } catch (e) { console.warn('audit failed', e.message) }
}
function requireAuth(req, res, next) {
  const cookies = parseCookies(req)
  const auth = req.headers.authorization || ''
  const token = cookies[COOKIE_NAME] || (auth.startsWith('Bearer ') ? auth.slice(7) : '')
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
  if (req.user.role !== 'admin') { audit(req, { action: 'forbidden', entity: req.path, success: false }); return res.status(403).json({ error: 'Apenas administradores' }) }
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
  if (!user || !bcrypt.compareSync(body.password, user.password_hash)) { audit(req, { action: 'login_failed', entity: 'auth', success: false, details: { email: body.email.toLowerCase() }, actor: user }); return res.status(401).json({ error: 'Credenciais inválidas' }) }
  audit(req, { action: 'password_validated', entity: 'auth', success: true, actor: user })
  let setup = null
  if (!user.mfa_enabled || !user.mfa_secret) {
    const secret = speakeasy.generateSecret({ name: `CRUD MFA Demo (${user.email})`, issuer: 'POS CRUD MFA Demo' })
    db.prepare('UPDATE users SET mfa_secret = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(secret.base32, user.id)
    audit(req, { action: 'mfa_setup_started', entity: 'auth', success: true, actor: user })
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
    if (!user?.mfa_secret) { audit(req, { action: 'mfa_not_initialized', entity: 'auth', success: false, actor: user }); return res.status(401).json({ error: 'MFA não inicializado' }) }
    const ok = speakeasy.totp.verify({ secret: user.mfa_secret, encoding: 'base32', token: body.token, window: 1 })
    if (!ok) { audit(req, { action: 'mfa_failed', entity: 'auth', success: false, actor: user }); return res.status(401).json({ error: 'Código OTP inválido' }) }
    if (!user.mfa_enabled) db.prepare('UPDATE users SET mfa_enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id)
    const sessionToken = signSession(user)
    setSessionCookie(res, sessionToken)
    audit(req, { action: 'login_success', entity: 'auth', success: true, actor: user })
    res.json({ user: publicUser({ ...user, mfa_enabled: 1 }) })
  } catch { audit(req, { action: 'mfa_token_invalid', entity: 'auth', success: false }); return res.status(401).json({ error: 'Token MFA expirado ou inválido' }) }
})
app.post('/api/auth/logout', requireAuth, (req, res) => { audit(req, { action: 'logout', entity: 'auth' }); clearSessionCookie(res); res.status(204).send() })
app.get('/api/me', requireAuth, (req, res) => res.json(publicUser(req.user)))
app.get('/api/audit', requireAuth, requireAdmin, (_req, res) => res.json(db.prepare('SELECT id, actor_email as actorEmail, action, entity, entity_id as entityId, success, ip, user_agent as userAgent, details, created_at as createdAt FROM audit_logs ORDER BY id DESC LIMIT 100').all()))

app.get('/api/users', requireAuth, requireAdmin, (_req, res) => res.json(db.prepare('SELECT * FROM users ORDER BY id DESC').all().map(publicUser)))
app.post('/api/users', requireAuth, requireAdmin, (req, res) => {
  const body = parse(userSchema.extend({ password: z.string().min(8) }), req.body, res); if (!body) return
  try {
    const info = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(body.name, body.email.toLowerCase(), bcrypt.hashSync(body.password, 12), body.role)
    audit(req, { action: 'create', entity: 'user', entityId: info.lastInsertRowid, details: { email: body.email.toLowerCase(), role: body.role } })
    res.status(201).json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)))
  } catch (e) { audit(req, { action: 'create_failed', entity: 'user', success: false, details: { email: body.email.toLowerCase() } }); res.status(409).json({ error: 'E-mail já cadastrado' }) }
})
app.put('/api/users/:id', requireAuth, requireAdmin, (req, res) => {
  const body = parse(userSchema, req.body, res); if (!body) return
  const exists = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
  if (!exists) return res.status(404).json({ error: 'Usuário não encontrado' })
  try {
    if (body.password) db.prepare('UPDATE users SET name=?, email=?, role=?, password_hash=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(body.name, body.email.toLowerCase(), body.role, bcrypt.hashSync(body.password, 12), req.params.id)
    else db.prepare('UPDATE users SET name=?, email=?, role=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(body.name, body.email.toLowerCase(), body.role, req.params.id)
    audit(req, { action: 'update', entity: 'user', entityId: req.params.id, details: { email: body.email.toLowerCase(), role: body.role, passwordChanged: Boolean(body.password) } })
    res.json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)))
  } catch { audit(req, { action: 'update_failed', entity: 'user', entityId: req.params.id, success: false }); res.status(409).json({ error: 'E-mail já cadastrado' }) }
})
app.delete('/api/users/:id', requireAuth, requireAdmin, (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'Não remova o próprio usuário logado' })
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id)
  if (!info.changes) return res.status(404).json({ error: 'Usuário não encontrado' })
  audit(req, { action: 'delete', entity: 'user', entityId: req.params.id })
  res.status(204).send()
})

app.get('/api/products', requireAuth, (_req, res) => res.json(db.prepare('SELECT * FROM products ORDER BY id DESC').all()))
app.post('/api/products', requireAuth, (req, res) => {
  const body = parse(productSchema, req.body, res); if (!body) return
  try { const info = db.prepare('INSERT INTO products (name, sku, price, stock, description) VALUES (?, ?, ?, ?, ?)').run(body.name, body.sku, body.price, body.stock, body.description || null); audit(req, { action: 'create', entity: 'product', entityId: info.lastInsertRowid, details: { sku: body.sku } }); res.status(201).json(db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid)) }
  catch { audit(req, { action: 'create_failed', entity: 'product', success: false, details: { sku: body.sku } }); res.status(409).json({ error: 'SKU já cadastrado' }) }
})
app.put('/api/products/:id', requireAuth, (req, res) => {
  const body = parse(productSchema, req.body, res); if (!body) return
  try { const info = db.prepare('UPDATE products SET name=?, sku=?, price=?, stock=?, description=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(body.name, body.sku, body.price, body.stock, body.description || null, req.params.id); if (!info.changes) return res.status(404).json({ error: 'Produto não encontrado' }); audit(req, { action: 'update', entity: 'product', entityId: req.params.id, details: { sku: body.sku } }); res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id)) }
  catch { audit(req, { action: 'update_failed', entity: 'product', entityId: req.params.id, success: false }); res.status(409).json({ error: 'SKU já cadastrado' }) }
})
app.delete('/api/products/:id', requireAuth, (req, res) => {
  const info = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id)
  if (!info.changes) return res.status(404).json({ error: 'Produto não encontrado' })
  audit(req, { action: 'delete', entity: 'product', entityId: req.params.id })
  res.status(204).send()
})

if (isProd) {
  const dist = path.join(__dirname, '..', 'dist')
  app.use(express.static(dist))
  app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

app.listen(PORT, () => console.log(`API disponível em http://localhost:${PORT}`))
