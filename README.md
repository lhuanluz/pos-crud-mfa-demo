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
- JWT para sessão

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
npm run smoke   # teste API com login, OTP, CRUD produto
```

## Funcionalidades

- Login com senha + MFA OTP obrigatório.
- Setup inicial de MFA no primeiro login.
- CRUD de usuários com perfil `admin` ou `operator`.
- CRUD de produtos.
- Página interna "Arquitetura" com documentação e diagrama textual.

## Diagrama resumido

```text
Professor/Navegador -> HTTPS/Reverse Proxy -> Express API + React SPA -> SQLite
```

A documentação detalhada fica dentro da área logada, na aba **Arquitetura**.

## Importante para produção

Este projeto é uma base didática. Antes de expor em produção real, planejar e implementar pelo menos:

- HTTPS obrigatório com domínio público.
- Secrets fora do código.
- Cookies HttpOnly/SameSite para sessão.
- Banco com backup e usuário limitado.
- Rate limit por conta/IP e lockout.
- Logs/auditoria.
- Headers seguros e CSP revisada.
- Pipeline com SAST/dependency scan.
```
