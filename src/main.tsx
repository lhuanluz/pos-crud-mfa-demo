import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Box, FileText, LogOut, Package, ShieldCheck, Users } from 'lucide-react'
import './styles.css'

type User = { id:number; name:string; email:string; role:'admin'|'operator'; mfaEnabled:boolean; createdAt:string; updatedAt:string }
type Product = { id:number; name:string; sku:string; price:number; stock:number; description?:string; created_at:string; updated_at:string }
type Tab = 'products' | 'users' | 'docs'

const api = async (path:string, options:RequestInit = {}) => {
  const token = localStorage.getItem('token')
  const res = await fetch(`/api${path}`, { ...options, headers: { 'Content-Type':'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } })
  if (!res.ok) throw new Error((await res.json().catch(()=>({error:'Erro'}))).error || 'Erro')
  if (res.status === 204) return null
  return res.json()
}

function Login({ onDone }:{ onDone:(u:User)=>void }) {
  const [email,setEmail]=useState('admin@example.com'), [password,setPassword]=useState('Admin123!')
  const [temp,setTemp]=useState(''), [setup,setSetup]=useState<any>(null), [otp,setOtp]=useState(''), [error,setError]=useState('')
  async function login(e:React.FormEvent){ e.preventDefault(); setError(''); try { const r=await api('/auth/login',{method:'POST',body:JSON.stringify({email,password})}); setTemp(r.tempToken); setSetup(r.setup) } catch(err:any){ setError(err.message) } }
  async function verify(e:React.FormEvent){ e.preventDefault(); setError(''); try { const r=await api('/auth/verify-otp',{method:'POST',body:JSON.stringify({tempToken:temp,token:otp})}); localStorage.setItem('token',r.token); onDone(r.user) } catch(err:any){ setError(err.message) } }
  return <main className="login-shell"><section className="login-card"><div className="brand"><ShieldCheck/><span>CRUD MFA Demo</span></div><h1>Autenticação com MFA OTP</h1><p>Use o login inicial, configure o código no Google/Microsoft Authenticator e valide o OTP.</p>{!temp ? <form onSubmit={login} className="form"><label>E-mail<input value={email} onChange={e=>setEmail(e.target.value)} /></label><label>Senha<input type="password" value={password} onChange={e=>setPassword(e.target.value)} /></label><button>Entrar</button></form> : <form onSubmit={verify} className="form"><h2>{setup ? 'Configurar MFA' : 'Validar MFA'}</h2>{setup && <><img className="qr" src={setup.qrDataUrl}/><small>Secret: <code>{setup.secret}</code></small></>}<label>Código de 6 dígitos<input value={otp} onChange={e=>setOtp(e.target.value)} placeholder="123456" /></label><button>Validar OTP</button></form>}{error && <p className="error">{error}</p>}<p className="hint">Credencial seed: admin@example.com / Admin123! — troque em produção.</p></section></main>
}

function Products() {
  const empty={name:'',sku:'',price:0,stock:0,description:''}; const [items,setItems]=useState<Product[]>([]),[form,setForm]=useState<any>(empty),[editing,setEditing]=useState<number|null>(null),[error,setError]=useState('')
  const load=()=>{ api('/products').then(setItems).catch(e=>setError(e.message)) }; useEffect(()=>{ load() },[])
  async function submit(e:React.FormEvent){e.preventDefault(); setError(''); try { await api(editing?`/products/${editing}`:'/products',{method:editing?'PUT':'POST',body:JSON.stringify(form)}); setForm(empty); setEditing(null); load() } catch(err:any){setError(err.message)}}
  async function remove(id:number){ if(confirm('Remover produto?')) { await api(`/products/${id}`,{method:'DELETE'}); load() } }
  return <section className="panel"><h2><Package/> Produtos</h2><form onSubmit={submit} className="grid-form"><input placeholder="Nome" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><input placeholder="SKU" value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})}/><input type="number" step="0.01" placeholder="Preço" value={form.price} onChange={e=>setForm({...form,price:Number(e.target.value)})}/><input type="number" placeholder="Estoque" value={form.stock} onChange={e=>setForm({...form,stock:Number(e.target.value)})}/><input className="wide" placeholder="Descrição" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/><button>{editing?'Salvar':'Adicionar'}</button></form>{error && <p className="error">{error}</p>}<table><thead><tr><th>Nome</th><th>SKU</th><th>Preço</th><th>Estoque</th><th>Ações</th></tr></thead><tbody>{items.map(p=><tr key={p.id}><td>{p.name}<small>{p.description}</small></td><td>{p.sku}</td><td>R$ {Number(p.price).toFixed(2)}</td><td>{p.stock}</td><td><button className="ghost" onClick={()=>{setEditing(p.id);setForm(p)}}>Editar</button><button className="danger" onClick={()=>remove(p.id)}>Excluir</button></td></tr>)}</tbody></table></section>
}

function UsersCrud() {
  const empty={name:'',email:'',password:'',role:'operator'}; const [items,setItems]=useState<User[]>([]),[form,setForm]=useState<any>(empty),[editing,setEditing]=useState<number|null>(null),[error,setError]=useState('')
  const load=()=>{ api('/users').then(setItems).catch(e=>setError(e.message)) }; useEffect(()=>{ load() },[])
  async function submit(e:React.FormEvent){e.preventDefault(); setError(''); const body={...form}; if(editing && !body.password) delete body.password; try { await api(editing?`/users/${editing}`:'/users',{method:editing?'PUT':'POST',body:JSON.stringify(body)}); setForm(empty); setEditing(null); load() } catch(err:any){setError(err.message)}}
  async function remove(id:number){ if(confirm('Remover usuário?')) { await api(`/users/${id}`,{method:'DELETE'}); load() } }
  return <section className="panel"><h2><Users/> Usuários</h2><form onSubmit={submit} className="grid-form"><input placeholder="Nome" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><input placeholder="E-mail" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/><input placeholder={editing?'Nova senha opcional':'Senha'} type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/><select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="operator">operator</option><option value="admin">admin</option></select><button>{editing?'Salvar':'Adicionar'}</button></form>{error && <p className="error">{error}</p>}<table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>MFA</th><th>Ações</th></tr></thead><tbody>{items.map(u=><tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td>{u.role}</td><td>{u.mfaEnabled?'ativo':'pendente'}</td><td><button className="ghost" onClick={()=>{setEditing(u.id);setForm({...u,password:''})}}>Editar</button><button className="danger" onClick={()=>remove(u.id)}>Excluir</button></td></tr>)}</tbody></table></section>
}

function Docs(){return <section className="panel docs"><h2><FileText/> Documentação e diagrama de arquitetura</h2><p>Esta mini aplicação foi criada para estudo de exposição pública e posterior planejamento de hardening. Ela já tem controles didáticos mínimos: senha com hash bcrypt, sessão JWT, MFA TOTP, validação de entrada, rate limit no login e CRUD autenticado.</p><pre>{`┌──────────────────────────── Internet ────────────────────────────┐
│ Professor / navegador HTTPS                                      │
└───────────────┬──────────────────────────────────────────────────┘
                │
        ┌───────▼────────┐
        │ Reverse proxy  │  TLS, headers, logs, WAF/rate-limit
        │ Nginx/Caddy    │
        └───────┬────────┘
                │
┌───────────────▼────────────────┐
│ Node.js Express API + React SPA │
│ - /api/auth/login               │
│ - /api/auth/verify-otp          │
│ - /api/users CRUD               │
│ - /api/products CRUD            │
└───────────────┬────────────────┘
                │
        ┌───────▼────────┐
        │ SQLite demo DB │
        │ users/products │
        └────────────────┘`}</pre><h3>Fluxo de autenticação</h3><ol><li>Usuário informa e-mail e senha.</li><li>API valida hash bcrypt.</li><li>Se MFA ainda não existe, gera secret TOTP e QR Code.</li><li>Usuário informa OTP de 6 dígitos.</li><li>API valida TOTP e emite JWT de sessão por 8h.</li></ol><h3>Backlog de segurança para a próxima etapa</h3><ul><li>Publicar atrás de HTTPS obrigatório com domínio dedicado.</li><li>Trocar SQLite por banco gerenciado ou PostgreSQL com backups.</li><li>Cookies HttpOnly/SameSite em vez de JWT no localStorage.</li><li>RBAC mais granular e auditoria de ações administrativas.</li><li>Proteção contra brute force por IP + conta, lockout e alertas.</li><li>Secrets em cofre/variáveis seguras, nunca commitados.</li><li>Pipeline SAST/dependency scan e logs centralizados.</li></ul></section>}

function App(){ const [user,setUser]=useState<User|null>(null),[tab,setTab]=useState<Tab>('products'); useEffect(()=>{ if(localStorage.getItem('token')) api('/me').then(setUser).catch(()=>localStorage.removeItem('token')) },[]); const nav=useMemo(()=>[{id:'products',label:'Produtos',icon:<Package/>},{id:'users',label:'Usuários',icon:<Users/>},{id:'docs',label:'Arquitetura',icon:<FileText/>}],[]); if(!user) return <Login onDone={setUser}/>; return <main className="app"><aside><div className="brand"><Box/><span>POS CRUD MFA</span></div>{nav.map(n=><button key={n.id} className={tab===n.id?'active':''} onClick={()=>setTab(n.id as Tab)}>{n.icon}{n.label}</button>)}<button className="logout" onClick={()=>{localStorage.removeItem('token');setUser(null)}}><LogOut/> Sair</button></aside><section className="content"><header><div><h1>Área logada</h1><p>{user.name} · {user.email} · MFA {user.mfaEnabled?'ativo':'pendente'}</p></div></header>{tab==='products'&&<Products/>}{tab==='users'&&<UsersCrud/>}{tab==='docs'&&<Docs/>}</section></main> }

createRoot(document.getElementById('root')!).render(<App />)
