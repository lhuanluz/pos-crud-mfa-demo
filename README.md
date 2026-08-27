# POS CRUD MFA Demo

Mini aplicação didática com autenticação, MFA OTP/TOTP e CRUD básico de **usuários** e **produtos**.

## Objetivo

Servir como base exposta à internet para uma disciplina de pós-graduação e, depois, planejar uma camada de segurança realista sem depender de VPN.

## Stack

- React + Vite + TypeScript
- Node.js + Express
- SQLite local (`data.db`) para demo
- MFA TOTP compatível com Google Authenticator, Microsoft Authenticator, 1Password etc.
- bcrypt para senha
- Sessão JWT em **cookie HttpOnly/SameSite**
- Helmet com headers de segurança e CSP
- Auditoria de autenticação e CRUD

## Como rodar localmente

```bash
npm install
cp .env.example .env
npm run build
npm start
```

Acesse: http://localhost:3001

Credencial inicial:

- E-mail: `admin@example.com`
- Senha: `Admin123!`

No primeiro login o sistema exibirá QR Code/secret para configurar MFA OTP.

## Scripts

```bash
npm run dev     # API em :3001 + Vite em :5173
npm run build   # typecheck + build frontend
npm start       # produção local, Express serve dist/
npm run smoke   # teste API com login, cookie HttpOnly, OTP, CRUD e auditoria
```

## Funcionalidades

- Login com senha + MFA OTP obrigatório.
- Setup inicial de MFA no primeiro login.
- Sessão protegida por cookie HttpOnly/SameSite; o frontend não salva JWT em localStorage.
- Logout server-side com limpeza do cookie.
- CRUD de usuários com perfil `admin` ou `operator`.
- CRUD de produtos.
- Aba **Auditoria** com últimos 100 eventos para admin.
- Página interna **Arquitetura** com inventário de controles e diagrama simples.

## Controles já implementados

- Senhas com bcrypt.
- MFA TOTP.
- JWT de sessão em cookie HttpOnly/SameSite.
- Cookie `Secure` habilitável via `COOKIE_SECURE=true` para HTTPS.
- RBAC básico: usuários e auditoria apenas para `admin`.
- Validação de entrada com Zod.
- Rate limit em `/api/auth`.
- Constraints SQLite para unicidade e valores não negativos.
- Helmet com CSP e headers de segurança.
- Auditoria de login, falhas de login/MFA, logout e CRUDs.

## Diagrama resumido

```text
Professor/Navegador -> Reverse Proxy HTTPS -> Express API + React SPA -> SQLite
```

A documentação detalhada fica dentro da área logada, na aba **Arquitetura**.

## Exposição pública com HTTPS

Existe um exemplo em `deploy/Caddyfile.example`.

Recomendação para publicação:

- Node escutando localmente em `127.0.0.1:3001`.
- Publicar apenas `80/TCP` e `443/TCP` no roteador/firewall.
- Usar Caddy/Nginx como reverse proxy com TLS válido.
- Definir `COOKIE_SECURE=true` quando o acesso for HTTPS.
- Não expor banco ou porta direta da aplicação.

## Ainda recomendado para evolução

- PostgreSQL com backups no lugar do SQLite para produção real.
- CSRF token se a política de cookies for ampliada ou se houver integrações cross-site.
- Lockout por conta/IP e alertas.
- Logs estruturados centralizados.
- Pipeline com SAST/dependency scan.
- Checklist OWASP ASVS para o relatório final.
