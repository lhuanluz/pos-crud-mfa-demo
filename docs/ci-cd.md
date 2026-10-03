# CI/CD seguro

Este projeto usa um único workflow GitHub Actions: CI automática e deploy automático somente após validação verde em push para `main`. A política é simples: qualquer falha em instalação, lint/typecheck, smoke test, build, auditoria de dependências, secret scan ou build Docker bloqueia promoção/deploy.

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

### Job `deploy` em `.github/workflows/ci.yml`

Gatilhos:

- Automático somente depois do job `validate` passar em um push para `main`.

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

## Evidência de validação

Validações locais executadas na revisão final:

- `npm ci`: instalação reprodutível concluída.
- `npm run lint`: passou (`tsc --noEmit`).
- `npm test`: passou; smoke validou health check, login com MFA, cookie `HttpOnly`, CRUD e auditoria.
- `npm run build`: passou; bundle Vite gerado.
- `npm run security:audit`: passou no critério configurado (`--audit-level=high`).
- `docker build --pull --no-cache`: imagem de produção construída com sucesso.

Validação real no GitHub Actions:

- [Run 34968436812](https://github.com/lhuanluz/pos-crud-mfa-demo/actions/runs/34968436812), para o commit `be1a641`: sucesso. O job de validação passou em `npm ci`, lint/typecheck, smoke test, build, auditoria de dependências, Gitleaks e build Docker. O job de deploy autenticou por SSH, implantou a revisão validada e confirmou o health check no Oracle Cloud.
