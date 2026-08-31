import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Box, CheckCircle2, ClipboardList, Cookie, Database, FileText, Globe2, KeyRound, LockKeyhole, LogOut, Package, Pencil, Server, Shield, ShieldCheck, Trash2, Users, X } from 'lucide-react'
import './styles.css'

type User = { id:number; name:string; email:string; role:'admin'|'operator'; mfaEnabled:boolean; createdAt:string; updatedAt:string }
type Product = { id:number; name:string; sku:string; price:number; stock:number; description?:string; created_at:string; updated_at:string }
type Tab = 'products' | 'users' | 'audit' | 'docs'
type ModalState<T> = { mode: 'create' | 'edit'; item?: T } | null
type AuditLog = { id:number; actorEmail?:string; action:string; entity:string; entityId?:string; success:number; ip?:string; userAgent?:string; details?:string; createdAt:string }

const api = async (path:string, options:RequestInit = {}) => {
  const res = await fetch(`/api${path}`, { ...options, credentials: 'include', headers: { 'Content-Type':'application/json', ...(options.headers || {}) } })
  if (!res.ok) throw new Error((await res.json().catch(()=>({error:'Erro'}))).error || 'Erro')
  if (res.status === 204) return null
  return res.json()
}

function Modal({ title, children, onClose, size = 'md' }:{ title:string; children:React.ReactNode; onClose:()=>void; size?:'sm'|'md'|'lg' }) {
  useEffect(() => {
    const onKey = (e:KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('modal-open')
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('modal-open') }
  }, [onClose])
  return <div className="modal-backdrop" onMouseDown={onClose}><section className={`modal modal-${size}`} onMouseDown={e=>e.stopPropagation()} role="dialog" aria-modal="true"><header className="modal-header"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Fechar"><X size={18}/></button></header>{children}</section></div>
}

function ConfirmModal({ title, description, dangerLabel, onCancel, onConfirm }:{title:string; description:string; dangerLabel:string; onCancel:()=>void; onConfirm:()=>void}) {
  return <Modal title={title} onClose={onCancel} size="sm"><div className="confirm-box"><div className="confirm-icon"><Trash2/></div><p>{description}</p><div className="modal-actions"><button className="ghost" onClick={onCancel}>Cancelar</button><button className="danger" onClick={onConfirm}>{dangerLabel}</button></div></div></Modal>
}

function Login({ onDone }:{ onDone:(u:User)=>void }) {
  const [email,setEmail]=useState(''), [password,setPassword]=useState('')
  const [temp,setTemp]=useState(''), [setup,setSetup]=useState<any>(null), [otp,setOtp]=useState(''), [error,setError]=useState('')
  async function login(e:React.FormEvent){ e.preventDefault(); setError(''); try { const r=await api('/auth/login',{method:'POST',body:JSON.stringify({email,password})}); setTemp(r.tempToken); setSetup(r.setup) } catch(err:any){ setError(err.message) } }
  async function verify(e:React.FormEvent){ e.preventDefault(); setError(''); try { const r=await api('/auth/verify-otp',{method:'POST',body:JSON.stringify({tempToken:temp,token:otp})}); onDone(r.user) } catch(err:any){ setError(err.message) } }
  return <main className="login-shell"><section className="login-card"><div className="brand"><ShieldCheck/><span>CRUD MFA Demo</span></div><h1>Autenticação com MFA OTP</h1><p>Entre com as credenciais configuradas fora do repositório e valide o OTP no autenticador.</p>{!temp ? <form onSubmit={login} className="form"><label>E-mail<input value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" /></label><label>Senha<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" /></label><button>Entrar</button></form> : <form onSubmit={verify} className="form"><h2>{setup ? 'Configurar MFA' : 'Validar MFA'}</h2>{setup && <><img className="qr" src={setup.qrDataUrl}/><small>Secret: <code>{setup.secret}</code></small></>}<label>Código de 6 dígitos<input value={otp} onChange={e=>setOtp(e.target.value)} placeholder="123456" /></label><button>Validar OTP</button></form>}{error && <p className="error">{error}</p>}<p className="hint">Não há credencial padrão: gere valores próprios no arquivo de ambiente local ou no cofre de produção.</p></section></main>
}

function ProductForm({ initial, submitLabel, onCancel, onSubmit }:{ initial:Partial<Product>; submitLabel:string; onCancel:()=>void; onSubmit:(form:any)=>Promise<void> }) {
  const [form,setForm]=useState<any>({name:'',sku:'',price:0,stock:0,description:'',...initial})
  const [busy,setBusy]=useState(false), [error,setError]=useState('')
  async function submit(e:React.FormEvent){ e.preventDefault(); setBusy(true); setError(''); try { await onSubmit(form) } catch(err:any){ setError(err.message) } finally { setBusy(false) } }
  return <form onSubmit={submit} className="modal-form"><label>Nome<input placeholder="Nome do produto" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>SKU<input placeholder="SKU único" value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})}/></label><div className="form-row"><label>Preço<input type="number" step="0.01" value={form.price} onChange={e=>setForm({...form,price:Number(e.target.value)})}/></label><label>Estoque<input type="number" value={form.stock} onChange={e=>setForm({...form,stock:Number(e.target.value)})}/></label></div><label>Descrição<textarea rows={4} placeholder="Descrição opcional" value={form.description || ''} onChange={e=>setForm({...form,description:e.target.value})}/></label>{error && <p className="error">{error}</p>}<div className="modal-actions"><button type="button" className="ghost" onClick={onCancel}>Cancelar</button><button disabled={busy}>{busy?'Salvando...':submitLabel}</button></div></form>
}

function Products() {
  const [items,setItems]=useState<Product[]>([]),[modal,setModal]=useState<ModalState<Product>>(null),[deleting,setDeleting]=useState<Product|null>(null),[error,setError]=useState('')
  const load=()=>{ api('/products').then(setItems).catch(e=>setError(e.message)) }; useEffect(()=>{ load() },[])
  async function save(form:any){ await api(modal?.mode==='edit'?`/products/${modal.item?.id}`:'/products',{method:modal?.mode==='edit'?'PUT':'POST',body:JSON.stringify(form)}); setModal(null); load() }
  async function remove(){ if (!deleting) return; await api(`/products/${deleting.id}`,{method:'DELETE'}); setDeleting(null); load() }
  return <section className="panel"><div className="panel-title"><h2><Package/> Produtos</h2><button onClick={()=>setModal({mode:'create'})}>Novo produto</button></div>{error && <p className="error">{error}</p>}<table><thead><tr><th>Nome</th><th>SKU</th><th>Preço</th><th>Estoque</th><th>Ações</th></tr></thead><tbody>{items.map(p=><tr key={p.id}><td>{p.name}<small>{p.description}</small></td><td>{p.sku}</td><td>R$ {Number(p.price).toFixed(2)}</td><td>{p.stock}</td><td className="actions"><button className="ghost" onClick={()=>setModal({mode:'edit',item:p})}><Pencil size={15}/> Editar</button><button className="danger" onClick={()=>setDeleting(p)}><Trash2 size={15}/> Excluir</button></td></tr>)}</tbody></table>{modal && <Modal title={modal.mode==='edit'?'Editar produto':'Novo produto'} onClose={()=>setModal(null)}><ProductForm initial={modal.item || {}} submitLabel={modal.mode==='edit'?'Salvar alterações':'Criar produto'} onCancel={()=>setModal(null)} onSubmit={save}/></Modal>}{deleting && <ConfirmModal title="Excluir produto" description={`Tem certeza que deseja excluir o produto ${deleting.name}? Essa ação não pode ser desfeita.`} dangerLabel="Excluir produto" onCancel={()=>setDeleting(null)} onConfirm={remove}/>}</section>
}

function UserForm({ initial, submitLabel, onCancel, onSubmit }:{ initial:Partial<User>; submitLabel:string; onCancel:()=>void; onSubmit:(form:any)=>Promise<void> }) {
  const [form,setForm]=useState<any>({name:'',email:'',password:'',role:'operator',...initial})
  const [busy,setBusy]=useState(false), [error,setError]=useState('')
  async function submit(e:React.FormEvent){ e.preventDefault(); setBusy(true); setError(''); const body={...form}; if(initial.id && !body.password) delete body.password; try { await onSubmit(body) } catch(err:any){ setError(err.message) } finally { setBusy(false) } }
  return <form onSubmit={submit} className="modal-form"><label>Nome<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>E-mail<input value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>{initial.id?'Nova senha opcional':'Senha'}<input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label><label>Perfil<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="operator">operator</option><option value="admin">admin</option></select></label>{initial.id && <p className="form-note">O estado do MFA não é resetado ao editar nome/e-mail/perfil.</p>}{error && <p className="error">{error}</p>}<div className="modal-actions"><button type="button" className="ghost" onClick={onCancel}>Cancelar</button><button disabled={busy}>{busy?'Salvando...':submitLabel}</button></div></form>
}

function UsersCrud() {
  const [items,setItems]=useState<User[]>([]),[modal,setModal]=useState<ModalState<User>>(null),[deleting,setDeleting]=useState<User|null>(null),[error,setError]=useState('')
  const load=()=>{ api('/users').then(setItems).catch(e=>setError(e.message)) }; useEffect(()=>{ load() },[])
  async function save(form:any){ await api(modal?.mode==='edit'?`/users/${modal.item?.id}`:'/users',{method:modal?.mode==='edit'?'PUT':'POST',body:JSON.stringify(form)}); setModal(null); load() }
  async function remove(){ if (!deleting) return; await api(`/users/${deleting.id}`,{method:'DELETE'}); setDeleting(null); load() }
  return <section className="panel"><div className="panel-title"><h2><Users/> Usuários</h2><button onClick={()=>setModal({mode:'create'})}>Novo usuário</button></div>{error && <p className="error">{error}</p>}<table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>MFA</th><th>Ações</th></tr></thead><tbody>{items.map(u=><tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td><span className="pill">{u.role}</span></td><td>{u.mfaEnabled?<span className="pill ok">ativo</span>:<span className="pill warn">pendente</span>}</td><td className="actions"><button className="ghost" onClick={()=>setModal({mode:'edit',item:u})}><Pencil size={15}/> Editar</button><button className="danger" onClick={()=>setDeleting(u)}><Trash2 size={15}/> Excluir</button></td></tr>)}</tbody></table>{modal && <Modal title={modal.mode==='edit'?'Editar usuário':'Novo usuário'} onClose={()=>setModal(null)}><UserForm initial={modal.item || {}} submitLabel={modal.mode==='edit'?'Salvar alterações':'Criar usuário'} onCancel={()=>setModal(null)} onSubmit={save}/></Modal>}{deleting && <ConfirmModal title="Excluir usuário" description={`Tem certeza que deseja excluir ${deleting.name}? Usuários removidos perdem acesso imediatamente.`} dangerLabel="Excluir usuário" onCancel={()=>setDeleting(null)} onConfirm={remove}/>}</section>
}

function AuditTrail() {
  const [items,setItems]=useState<AuditLog[]>([]),[error,setError]=useState('')
  useEffect(()=>{ api('/audit').then(setItems).catch(e=>setError(e.message)) },[])
  return <section className="panel"><div className="panel-title"><h2><ClipboardList/> Auditoria</h2><span className="pill ok">últimos 100 eventos</span></div>{error && <p className="error">{error}</p>}<table><thead><tr><th>Data</th><th>Ator</th><th>Ação</th><th>Entidade</th><th>Status</th><th>IP</th></tr></thead><tbody>{items.map(a=><tr key={a.id}><td>{new Date(a.createdAt).toLocaleString('pt-BR')}</td><td>{a.actorEmail || 'anônimo'}</td><td><code>{a.action}</code></td><td>{a.entity}{a.entityId ? <small>ID: {a.entityId}</small> : null}</td><td>{a.success ? <span className="pill ok">sucesso</span> : <span className="pill warn">falha</span>}</td><td>{a.ip || '-'}</td></tr>)}</tbody></table></section>
}


function Docs(){
  const controls = [
    { where:'Cliente / navegador', name:'Área logada', control:'Telas internas só aparecem após sessão válida.', detail:'O frontend chama /api/me e só renderiza produtos, usuários, auditoria e arquitetura se o cookie de sessão for aceito.', status:'Implementado' },
    { where:'Cliente / sessão', name:'Sem JWT no localStorage', control:'Sessão migrou para cookie HttpOnly/SameSite.', detail:'O JavaScript do navegador não lê o token; a API envia e limpa a sessão por Set-Cookie.', status:'Novo' },
    { where:'API / autenticação', name:'Senha com bcrypt', control:'A senha não é gravada em texto claro.', detail:'O login compara a senha enviada com o hash bcrypt salvo na tabela users.', status:'Implementado' },
    { where:'API / autenticação', name:'MFA OTP/TOTP', control:'Exige segundo fator de 6 dígitos.', detail:'No primeiro acesso gera QR Code/secret; nos próximos acessos valida o código do app autenticador.', status:'Implementado' },
    { where:'API / sessão', name:'Cookie HttpOnly', control:'Acesso às APIs internas exige cookie assinado por JWT.', detail:'Cookie SameSite=Lax, HttpOnly, Secure em produção; token temporário do MFA expira em 5min.', status:'Novo' },
    { where:'API / autorização', name:'RBAC básico', control:'CRUD de usuários e auditoria restritos a administradores.', detail:'Produtos exigem usuário autenticado; usuários e auditoria exigem role admin.', status:'Implementado' },
    { where:'API / entrada', name:'Validação com Zod', control:'Dados inválidos são bloqueados antes do banco.', detail:'E-mail, senha, papel, preço, estoque e SKU passam por schemas de validação.', status:'Implementado' },
    { where:'API / abuso', name:'Rate limit no login', control:'Reduz tentativa automatizada contra endpoints de autenticação.', detail:'A rota /api/auth tem limite por janela de tempo.', status:'Implementado' },
    { where:'Servidor HTTP', name:'Headers + CSP com Helmet', control:'Aplica cabeçalhos de segurança e política CSP.', detail:'Inclui frame-ancestors none, object-src none, default-src self e upgrade-insecure-requests em produção.', status:'Novo' },
    { where:'Banco / integridade', name:'Constraints SQLite', control:'Evita duplicidade e valores inválidos.', detail:'E-mail e SKU são únicos; preço e estoque não podem ser negativos.', status:'Implementado' },
    { where:'Banco / auditoria', name:'Trilha auditável', control:'Registra login, falha de login/MFA, logout e CRUDs.', detail:'Eventos guardam ator, ação, entidade, status, IP, user-agent e detalhes não sensíveis.', status:'Novo' },
    { where:'Perímetro / deploy', name:'Reverse proxy HTTPS', control:'Projeto recebeu exemplo Caddy para publicar só 80/443.', detail:'A aplicação deve ficar em 127.0.0.1 atrás do proxy; banco e porta Node não devem ser expostos.', status:'Preparado' },
  ]
  const map = [
    { zone:'Navegador', items:['Área logada', 'sem token no JS', 'credentials include'], note:'Controla experiência e envia cookie automaticamente.' },
    { zone:'Auth API', items:['bcrypt', 'MFA OTP', 'tempToken 5min', 'rate limit', 'audit login'], note:'Protege o processo de entrada no sistema.' },
    { zone:'Business API', items:['requireAuth', 'requireAdmin', 'Zod', 'audit CRUD'], note:'Protege usuários, produtos e auditoria.' },
    { zone:'HTTP/Perímetro', items:['Helmet', 'CSP', 'Caddyfile', 'TLS no proxy'], note:'Reduz exposição HTTP e prepara publicação segura.' },
    { zone:'Banco SQLite', items:['unique email', 'unique SKU', 'CHECK preço/estoque', 'audit_logs'], note:'Mantém integridade e trilha de eventos.' },
  ]
  return <section className="controls-page">
    <div className="controls-hero">
      <span className="eyebrow">Controles existentes</span>
      <h2>Controles já implementados na aplicação</h2>
      <p>A aplicação agora documenta os controles atuais e mostra onde cada um atua: sessão, autenticação, autorização, perímetro HTTP, integridade e auditoria.</p>
    </div>

    <div className="controls-summary">
      <div><strong>{controls.length}</strong><span>controles documentados</span></div>
      <div><strong>HttpOnly</strong><span>sessão fora do localStorage</span></div>
      <div><strong>Audit</strong><span>login, MFA, logout e CRUDs</span></div>
    </div>

    <article className="controls-panel">
      <div className="section-heading"><ShieldCheck/><div><h3>Inventário de controles atuais</h3><p>Lista objetiva para o professor entender o que já existe antes do relatório final de hardening.</p></div></div>
      <div className="controls-table">
        {controls.map(c=><div className="control-row" key={`${c.where}-${c.name}`}>
          <div className="control-place">{c.where}</div>
          <div><h4>{c.name}</h4><p>{c.control}</p><small>{c.detail}</small></div>
          <span className={c.status === 'Novo' ? 'control-status new' : c.status === 'Preparado' ? 'control-status prep' : 'control-status'}>{c.status}</span>
        </div>)}
      </div>
    </article>

    <article className="controls-panel">
      <div className="section-heading"><FileText/><div><h3>Diagrama simples: onde cada controle está</h3><p>Da esquerda para a direita: acesso público, autenticação, autorização, perímetro HTTP e persistência.</p></div></div>
      <div className="control-diagram wide-diagram">
        <div className="diagram-actor"><Globe2/><strong>Professor</strong><span>Navegador público</span></div>
        <div className="diagram-arrow">→</div>
        {map.map((m,idx)=><React.Fragment key={m.zone}>
          <div className="diagram-zone">
            <div className="zone-number">0{idx+1}</div>
            <h4>{m.zone}</h4>
            <p>{m.note}</p>
            <div className="zone-controls">{m.items.map(i=><span key={i}>{i}</span>)}</div>
          </div>
          {idx < map.length - 1 && <div className="diagram-arrow">→</div>}
        </React.Fragment>)}
      </div>
    </article>

    <div className="controls-two-col">
      <article className="controls-panel">
        <div className="section-heading"><Cookie/><div><h3>Sessão resolvida</h3><p>O gap de localStorage foi substituído por cookie HttpOnly.</p></div></div>
        <ol className="control-steps">
          <li><strong>Antes</strong><span>JWT era salvo no localStorage e ficava acessível ao JavaScript.</span></li>
          <li><strong>Agora</strong><span>/api/auth/verify-otp define cookie HttpOnly/SameSite.</span></li>
          <li><strong>Logout</strong><span>/api/auth/logout limpa o cookie no servidor.</span></li>
          <li><strong>Produção</strong><span>COOKIE_SECURE=true força envio apenas sobre HTTPS.</span></li>
        </ol>
      </article>
      <article className="controls-panel">
        <div className="section-heading"><ClipboardList/><div><h3>Auditoria resolvida</h3><p>Eventos sensíveis viraram trilha consultável por admin.</p></div></div>
        <ol className="control-steps">
          <li><strong>Auth</strong><span>login_failed, password_validated, mfa_failed, login_success, logout.</span></li>
          <li><strong>CRUD</strong><span>create, update e delete de usuários/produtos.</span></li>
          <li><strong>Contexto</strong><span>ator, entidade, ID, sucesso/falha, IP e user-agent.</span></li>
          <li><strong>UI</strong><span>Aba Auditoria mostra os últimos 100 eventos.</span></li>
        </ol>
      </article>
    </div>

    <article className="controls-panel exposure-note">
      <div className="section-heading"><LockKeyhole/><div><h3>O que ainda depende do deploy público</h3><p>O código está preparado, mas a validação final exige domínio/HTTPS reais.</p></div></div>
      <div className="gap-grid">
        <div><strong>Domínio</strong><p>Apontar um domínio público para o host escolhido.</p></div>
        <div><strong>TLS</strong><p>Subir reverse proxy Caddy/Nginx com certificado válido.</p></div>
        <div><strong>Exposição</strong><p>Publicar apenas 80/443; manter Node e banco privados.</p></div>
        <div><strong>Validação</strong><p>Testar DNS, certificado, headers, CSP, cookie Secure e health público.</p></div>
      </div>
    </article>
  </section>
}

function App(){ const [user,setUser]=useState<User|null>(null),[tab,setTab]=useState<Tab>('products'); useEffect(()=>{ api('/me').then(setUser).catch(()=>setUser(null)) },[]); const nav=useMemo(()=>[{id:'products',label:'Produtos',icon:<Package/>},{id:'users',label:'Usuários',icon:<Users/>},{id:'audit',label:'Auditoria',icon:<ClipboardList/>},{id:'docs',label:'Arquitetura',icon:<FileText/>}],[]); async function logout(){ await api('/auth/logout',{method:'POST'}).catch(()=>null); setUser(null); setTab('products') } if(!user) return <Login onDone={setUser}/>; return <main className="app"><aside><div className="brand"><Box/><span>POS CRUD MFA</span></div>{nav.map(n=><button key={n.id} className={tab===n.id?'active':''} onClick={()=>setTab(n.id as Tab)}>{n.icon}{n.label}</button>)}<button className="logout" onClick={logout}><LogOut/> Sair</button></aside><section className="content"><header><div><h1>Área logada</h1><p>{user.name} · {user.email} · MFA {user.mfaEnabled?'ativo':'pendente'}</p></div></header>{tab==='products'&&<Products/>}{tab==='users'&&<UsersCrud/>}{tab==='audit'&&<AuditTrail/>}{tab==='docs'&&<Docs/>}</section></main> }

createRoot(document.getElementById('root')!).render(<App />)
