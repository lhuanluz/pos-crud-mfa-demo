# CI/CD seguro

Este projeto usa GitHub Actions com CI automática e deploy automático somente após uma CI verde em `main`. A política é simples: qualquer falha em instalação, lint/typecheck, smoke test, build, auditoria de dependências, secret scan ou build Docker bloqueia promoção/deploy.

## Workflows

### `.github/workflows/ci.yml`

Gatilhos:

- `push` para `main`.
- `pull_request` para `main`.
- `workflow_dispatch` manual.

Validações executadas:

1. `npm ci` para instalação reprodutível a partir de `package-lock.json`.
2. `npm run lint`, atualmente typecheck estrito com `tsc --noEmit`.
3. `npm test`, que executa o smoke test com credenciais efêmeras geradas em runtime.
4. `npm run build` para typecheck + bundle Vite.
5. `npm run security:audit` com `npm audit --audit-level=high`.
6. Gitleaks para detecção de segredos versionados.
7. `docker build --pull --no-cache` para validar a imagem de produção.

Permissões mínimas:

- `contents: read`.
- O checkout usa `persist-credentials: false`.

### `.github/workflows/deploy.yml`

Gatilhos:

- Automático após CI verde em `main`; `workflow_dispatch` permanece como contingência controlada.

Gate obrigatório:

- O job usa `environment: production`. Configure no GitHub: Settings → Environments → `production` → required reviewers e, se aplicável, wait timer. Sem esse gate configurado no repositório, o YAML não consegue impor aprovação humana sozinho.

Segredos obrigatórios no ambiente/repositório GitHub:

- `SERVER_SSH_PRIVATE_KEY`: única credencial do workflow; chave privada exclusiva de deploy, com escopo mínimo.

Host/IP, porta, usuário, caminho da aplicação e fingerprint SSH são parâmetros operacionais públicos/fixos no workflow e não exigem cadastro manual.

Política de segredos:

- Nenhum segredo deve ser gravado em YAML, README, logs ou artefatos.
- O workflow falha se a única chave privada obrigatória estiver ausente.
- SSH usa `StrictHostKeyChecking=yes`; não use `StrictHostKeyChecking=no` para “resolver rápido”.

## Política de promoção

- CI deve passar antes de considerar uma versão candidata.
- Após CI verde em `main`, o deploy usa exatamente o SHA validado; o ambiente protegido `production` pode exigir aprovação humana se configurado.
- Falha em qualquer etapa do deploy interrompe a promoção.
- A validação pública final de TLS/Qualys/PQC é etapa separada de QA depois do endpoint publicado.

## Comandos locais equivalentes

```bash
npm ci
npm run lint
npm test
npm run build
npm run security:audit
docker build --pull --no-cache --tag pos-crud-mfa-demo:ci .
```

## Evidência coletada neste ajuste

Validações locais executadas em 2026-08-31:

- `npm ci`: passou, 278 pacotes instalados, 0 vulnerabilidades.
- `npm run lint`: passou (`tsc --noEmit`).
- `npm test`: passou; smoke retornou `health: ok`, `loginMfa: true`, `httpOnlyCookie: true`, `productCrud: ok`, `auditEvents: 6`.
- `npm run build`: passou; bundle Vite gerado.
- `npm run security:audit`: passou com 0 vulnerabilidades.
- Validação sintática dos YAMLs via Ruby Psych: `ci.yml` e `deploy.yml` carregaram sem erro.

Validações reais no GitHub Actions em 2026-08-31:

- Run CI `33402917384`: sucesso. Job “Install, lint, test, build and scan” passou em `npm ci`, lint/typecheck, smoke test, build, dependency audit, Gitleaks e Docker image build check.
- Run Deploy `33402996798`: falhou antes de qualquer SSH/deploy porque os secrets obrigatórios (`SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_PRIVATE_KEY`, `SERVER_SSH_KNOWN_HOSTS`, `APP_PATH`) não estavam configurados no ambiente/repositório. Isso bloqueou promoção sem expor credenciais.
