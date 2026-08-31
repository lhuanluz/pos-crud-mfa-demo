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
| Validação TLS | Qualys SSL Labs: alvo Nota A e suporte PQC |

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
ci.yml      push/PR para main: npm ci → lint/typecheck → smoke test → build → npm audit → Gitleaks → Docker build
deploy.yml  somente workflow_dispatch: ambiente protegido production → SSH com chave → Docker Compose → health check
```

Segredos são configurados exclusivamente em **GitHub Actions Secrets** ou Environment Secrets:

```text
SERVER_HOST
SERVER_PORT
SERVER_USER
SERVER_SSH_PRIVATE_KEY
SERVER_SSH_KNOWN_HOSTS
APP_PATH
```

Nenhuma chave privada, senha, `.env` ou banco local é versionado. Configure `production` em Settings → Environments com required reviewers; sem esse gate no GitHub, o YAML sozinho não impõe aprovação humana. Detalhes em `docs/ci-cd.md`.

## Higiene do repositório

O `.gitignore` bloqueia `.env`, `.env.*`, bancos SQLite, `node_modules`, `dist` e arquivos de cobertura. Apenas templates sem valores reais (`.env.example` e `.env.docker.example`) são versionados.

## Evidências finais a registrar

- URL HTTPS acessível e redirecionamento HTTP → HTTPS;
- saída de `sudo nginx -t`, `sudo ufw status numbered` e `sudo fail2ban-client status sshd`;
- execução verde do GitHub Actions após um push real;
- relatório Qualys SSL Labs com nota A e indicação de PQC.
