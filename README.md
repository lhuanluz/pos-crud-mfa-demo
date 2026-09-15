# POS CRUD MFA Demo

Aplicação web didática para a disciplina **Projeto Aplicado: Práticas de Mercado**. Demonstra um fluxo de autenticação com MFA TOTP e CRUD básico, implantado em nuvem pública com controles de Secure by Design e Secure by Default.

## Acesso de produção

- Ambiente: Oracle Cloud Free Tier, Ubuntu Server 24.04 LTS
- Endereço público: `https://147.15.124.129` (após a emissão do certificado IP)
- Web server: Nginx instalado no host Ubuntu
- Aplicação: Node.js/Express + React, em Docker
- Banco demonstrativo: SQLite em volume Docker; não é publicado no repositório nem exposto à internet.

## Arquitetura

```text
Navegador
  └─ HTTPS :443
       └─ Nginx no host Ubuntu
            └─ 127.0.0.1:3001
                 └─ container Node/Express + React
                      └─ volume SQLite
```

A porta da aplicação (`3001`) é publicada somente no loopback. Na borda, a Oracle Security List e o UFW permitem somente SSH (`22`), HTTP (`80`) e HTTPS (`443`).

## Stack

- React, Vite e TypeScript
- Node.js 22 e Express
- SQLite / `better-sqlite3`
- Docker Compose
- Nginx no host Ubuntu
- Certbot / Let's Encrypt para TLS por endereço IP
- GitHub Actions para validação e deploy

## Controles de infraestrutura

| Controle | Implementação |
|---|---|
| Cloud pública | Oracle Cloud Free Tier com IP público |
| SO | Ubuntu Server 24.04 LTS |
| Administração remota | SSH por chave; `PasswordAuthentication no`; `PermitRootLogin no` |
| Proteção de SSH | Fail2Ban: 4 tentativas em 10 minutos e banimento de 24 horas |
| Firewall | UFW com entrada apenas para 22, 80 e 443; aplicação em `127.0.0.1:3001` |
| Web server | Nginx no host como reverse proxy |
| TLS | Certbot >= 5.4, certificado Let's Encrypt para IP, redirecionamento HTTP → HTTPS |
| Validação TLS | HTTPS por IP, TLS 1.3 e grupo híbrido PQC `X25519MLKEM768`; evidências em `docs/tls-evidence-ip.md` e `docs/evidence/` |

## Segurança da aplicação e OWASP Top 10:2025

A aplicação mitiga, no mínimo, estas categorias da OWASP Top 10:2025:

| Categoria | Mitigação aplicada | Evidência no código |
|---|---|---|
| **Broken Access Control** | Middleware de sessão e RBAC. Usuários e auditoria exigem perfil `admin`; CRUD de produtos exige autenticação. | `requireAuth`, `requireAdmin` e rotas `/api/users`, `/api/audit`, `/api/products` em `server/index.js` |
| **Authentication Failures** | Senhas armazenadas com bcrypt (cost 12), MFA TOTP obrigatório após senha, sessão JWT com expiração de 8h em cookie `HttpOnly`/`SameSite`, rate-limit de autenticação e logout que limpa o cookie. | `bcrypt.hashSync`, `/api/auth/login`, `/api/auth/verify-otp`, `setSessionCookie`, `express-rate-limit` em `server/index.js` |
| **Injection** | Validação e coerção com Zod antes das operações; consultas SQLite parametrizadas; constraints de unicidade e valores não negativos no schema. | `loginSchema`, `userSchema`, `productSchema`, `parse()` e `db.prepare(...).run(...)` em `server/index.js` |
| **Security Misconfiguration** | Helmet/CSP, `X-Frame-Options`, `nosniff`, segredo JWT obrigatório no startup e credenciais de seed obrigatórias em banco vazio. | Configuração Helmet, `requiredEnv()` e bootstrap em `server/index.js` |

Outros controles: logs de auditoria para login/MFA/logout/CRUD, CORS restrito em produção, cookie `Secure` habilitado no HTTPS e segredo/ambiente real fora do Git.

## Desenvolvimento assistido por IA

O desenvolvimento, depuração, auditoria de código e documentação técnica foram realizados com **Hermes Agent**, um ambiente similar baseado em IA, atendendo ao requisito de codificação assistida por IA. As decisões foram validadas com build TypeScript/Vite, smoke test de API e verificações operacionais no servidor.

## Executar localmente

1. Copie o template e preencha valores aleatórios fortes. Nunca versione o arquivo criado.

```bash
cp .env.example .env
openssl rand -base64 48  # use a saída em JWT_SECRET
# edite JWT_SECRET, ADMIN_EMAIL e ADMIN_PASSWORD
npm ci
npm run build
npm start
```

A aplicação falha ao iniciar se `JWT_SECRET` estiver ausente, tiver menos de 32 caracteres ou ainda contiver placeholder/valor didático antigo. Se o banco estiver vazio, `ADMIN_EMAIL` e `ADMIN_PASSWORD` também são obrigatórios; `ADMIN_EMAIL` precisa ser um e-mail válido e `ADMIN_PASSWORD` precisa ter pelo menos 12 caracteres. Não existem credenciais padrão em runtime.

### Docker local

```bash
cp .env.docker.example .env.docker
# edite as três variáveis obrigatórias
npm run docker:up
npm run docker:health
```

O compose local publica apenas `127.0.0.1:8088`, portanto não expõe o Mac na rede local.

## Scripts e verificações

```bash
npm run lint            # typecheck estrito sem emitir arquivos
npm test                # smoke test: health, login/MFA, cookie HttpOnly, CRUD e auditoria
npm run build           # typecheck e build do frontend
npm run security:audit  # npm audit bloqueando vulnerabilidades high/critical
```

O smoke test cria dados isolados e credenciais aleatórias apenas para sua execução.

## Deploy de produção

No servidor, o arquivo `.env.docker` tem permissão restrita e não é commitado. Use um cofre de segredos ou o mecanismo protegido do provedor para armazenar `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` e chaves SSH; em arquivo local, aplique `chmod 600 .env.docker`. Para rotação, gere novo `JWT_SECRET`, atualize o segredo no cofre/servidor, recrie o container e invalide sessões antigas. O Nginx do host encaminha para a app Docker apenas no loopback:

```bash
docker compose -f compose.yml -f compose.host-nginx.yml --env-file .env.docker up -d --build app
```

O arquivo `compose.host-nginx.yml` é o modo oficial de produção. `compose.prod.yml` permanece como exemplo de proxy em container para desenvolvimento/referência, mas não é usado na VM da entrega.

## CI/CD com GitHub Actions

Os workflows ficam em `.github/workflows/`:

```text
ci.yml      push/PR para main: validação completa; em push no main e validação verde, deploy Oracle automático
```

A única credencial configurada em **GitHub Actions Secrets** é:

```text
SERVER_SSH_PRIVATE_KEY
```

IP público, porta SSH, usuário, caminho da aplicação e fingerprint SSH são parâmetros operacionais não secretos, fixados no workflow para reduzir o setup manual.

Nenhuma chave privada, senha, `.env` ou banco local é versionado. Configure `production` em Settings → Environments com required reviewers; sem esse gate no GitHub, o YAML sozinho não impõe aprovação humana. Detalhes em `docs/ci-cd.md`.

## Higiene do repositório

O `.gitignore` bloqueia `.env`, `.env.*`, bancos SQLite, `node_modules`, `dist` e arquivos de cobertura. Apenas templates sem valores reais (`.env.example` e `.env.docker.example`) são versionados.

## Checklist de entrega e evidências

Esta checklist segue o escopo da disciplina. **Concluído** indica evidência versionada ou uma verificação externa registrada; **pendente** indica uma prova de terceiro que ainda precisa ser anexada, sem alegar conformidade sem evidência.

### Eixo 1 — Cloud e infraestrutura

- [x] **Cloud pública / Free Tier:** Oracle Cloud Free Tier com IP público. **Evidência:** [Acesso de produção](#acesso-de-produção) e [arquitetura](#arquitetura).
- [x] **Sistema operacional suportado:** Ubuntu Server 24.04 LTS. **Evidência:** [Controles de infraestrutura](#controles-de-infraestrutura) e `docs/tls-evidence-ip.md`.
- [x] **Web server obrigatório:** Nginx no host como reverse proxy para a aplicação Docker em `127.0.0.1:3001`. **Evidência:** [Arquitetura](#arquitetura) e `compose.host-nginx.yml`.
- [x] **Aplicação pública por IP:** `https://147.15.124.129`. **Evidência:** [Acesso de produção](#acesso-de-produção), health check e `docs/tls-evidence-ip.md`.
- [x] **Administração remota segura:** SSH por chave, sem login por senha/root. **Evidência:** [Controles de infraestrutura](#controles-de-infraestrutura).
- [x] **Firewall e Fail2Ban:** portas 22/80/443 e Fail2Ban com 4 tentativas em 10 min / banimento de 24 h. **Evidência:** [Controles de infraestrutura](#controles-de-infraestrutura) e comandos de reprodução em `docs/tls-evidence-ip.md`.
- [x] **HTTPS por IP + redirect HTTP → HTTPS:** certificado Let's Encrypt, Certbot e redirecionamento. **Evidência:** `docs/tls-evidence-ip.md`.
- [x] **TLS 1.3 e PQC:** negociação real `X25519MLKEM768`; DigiCert PQC Checker retornou **Pass**. **Evidência:** `docs/tls-evidence-ip.md`, [captura do DigiCert](docs/evidence/digicert-pqc-2026-09-14.png) e [workflow de ativação](https://github.com/lhuanluz/pos-crud-mfa-demo/actions/runs/34890566508).
- [ ] **SSL.org para certificado IP:** falta anexar o resultado com `Certificate Trusted: YES` e assinatura aceitável. **Ação:** executar contra `147.15.124.129` e adicionar a captura em `docs/evidence/`.

### Eixo 2 — Repositório e segredos

- [x] **Repositório público no GitHub:** [lhuanluz/pos-crud-mfa-demo](https://github.com/lhuanluz/pos-crud-mfa-demo).
- [x] **README técnico:** este arquivo descreve arquitetura, execução, controles, OWASP, CI/CD e evidências.
- [x] **Higiene de segredos:** `.gitignore` bloqueia `.env`, `.env.*`, SQLite, builds e cobertura; somente templates sem segredos são versionados. **Evidência:** [.gitignore](.gitignore), `.env.example`, `.env.docker.example` e job Gitleaks em `.github/workflows/ci.yml`.
- [x] **Credencial de deploy protegida:** `SERVER_SSH_PRIVATE_KEY` é consumida como GitHub Actions Secret e removida ao final do job. **Evidência:** `.github/workflows/ci.yml`.

### Eixo 3 — Aplicação e Secure by Design

- [x] **Tela de login, área interna e logout:** implementados e cobertos pelo smoke test. **Evidência:** `src/`, rotas `/api/auth/login`, `/api/auth/verify-otp`, `/api/auth/logout` em `server/index.js` e `scripts/smoke.mjs`.
- [x] **MFA obrigatório:** TOTP após validação de senha, com token temporário de 5 minutos. **Evidência:** `server/index.js` (`/api/auth/login` e `/api/auth/verify-otp`).
- [x] **CRUD autenticado:** produtos exigem sessão; gestão de usuários/auditoria exige `admin`. **Evidência:** `requireAuth`, `requireAdmin` e rotas `/api/products`, `/api/users`, `/api/audit` em `server/index.js`.
- [x] **Três ou mais categorias OWASP Top 10:2025 mitigadas:** Broken Access Control, Authentication Failures, Injection e Security Misconfiguration. **Evidência:** [Segurança da aplicação e OWASP Top 10:2025](#segurança-da-aplicação-e-owasp-top-102025) e `server/index.js`.
- [x] **Desenvolvimento assistido por IA:** Hermes Agent, ambiente similar baseado em IA, usado para desenvolvimento, auditoria e documentação. **Evidência:** [Desenvolvimento assistido por IA](#desenvolvimento-assistido-por-ia).

### CI/CD e validação

- [x] **GitHub Actions em push para `main`:** validação e deploy automatizados. **Evidência:** `.github/workflows/ci.yml` e [run verde de validação/deploy](https://github.com/lhuanluz/pos-crud-mfa-demo/actions/runs/33424238582).
- [x] **Validações automatizadas:** `npm ci`, lint, smoke test, build, `npm audit` (bloqueio high/critical), Gitleaks e Docker build. **Evidência:** `.github/workflows/ci.yml` e [Scripts e verificações](#scripts-e-verificações).
- [x] **Versão exata promovida:** o deploy usa `github.sha`, faz `git reset --hard` nesse SHA e aguarda o health check. **Evidência:** `.github/workflows/ci.yml`.

> Para a entrega, o único item explicitamente pendente nesta checklist é anexar a captura do **SSL.org**. O requisito de PQC já possui evidência técnica e evidência externa do DigiCert.
