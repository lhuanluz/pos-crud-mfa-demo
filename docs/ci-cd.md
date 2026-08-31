# CI/CD seguro

Este projeto usa GitHub Actions com dois workflows separados: CI automática e deploy manual. A política é simples: qualquer falha em instalação, lint/typecheck, smoke test, build, auditoria de dependências, secret scan ou build Docker bloqueia promoção/deploy.

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

- Automático: conclusão verde do workflow `CI` em `main`, usando o SHA exato que foi validado.
- Manual: `workflow_dispatch` para recuperação controlada de um ref explícito.

Gate obrigatório:

- O job usa `environment: production`. Configure no GitHub: Settings → Environments → `production` → required reviewers e, se aplicável, wait timer. Sem esse gate configurado no repositório, o YAML não consegue impor aprovação humana sozinho. Na prática, o deploy só promove revisão validada pelo CI depois da aprovação do ambiente protegido.

Segredos obrigatórios no ambiente/repositório GitHub:

- `SERVER_HOST`: host ou IP do servidor.
- `SERVER_PORT`: porta SSH; opcional, assume `22` se vazio.
- `SERVER_USER`: usuário SSH sem privilégio direto de root quando possível.
- `SERVER_SSH_PRIVATE_KEY`: chave privada de deploy, idealmente exclusiva e com escopo mínimo.
- `SERVER_SSH_KNOWN_HOSTS`: linha(s) de `known_hosts` do servidor, coletadas previamente com verificação fora de banda.
- `APP_PATH`: caminho absoluto do clone no servidor.

Política de segredos:

- Nenhum segredo deve ser gravado em YAML, README, logs ou artefatos.
- O workflow falha se qualquer segredo obrigatório estiver ausente.
- SSH usa `StrictHostKeyChecking=yes`; não use `StrictHostKeyChecking=no` para “resolver rápido”.

## Política de promoção

- CI deve passar antes de considerar uma versão candidata.
- Todo push em `main` passa pela CI e, se verde, dispara automaticamente o deploy do SHA validado. O ambiente `production` pode exigir revisão humana adicional no GitHub.
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

- `npm ci`: passou.
- `npm run lint`: passou.
- `npm test`: passou.
- `npm run build`: passou.
- `npm run security:audit`: passou com 0 vulnerabilidades.
- `docker build --pull --no-cache --tag pos-crud-mfa-demo:ci .`: a executar/registrar conforme ambiente Docker local disponível.
- Validação sintática dos YAMLs via Ruby Psych: a executar/registrar.
