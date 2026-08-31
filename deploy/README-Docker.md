# Deploy Docker em Debian/Ubuntu Server

Objetivo: rodar a aplicação em containers e expor publicamente apenas o Nginx.
O Mac Studio fica apenas como estação de desenvolvimento; não precisa receber NAT ou porta pública.

## Local seguro no Mac

```bash
cp .env.docker.example .env.docker
docker compose up -d --build
curl http://127.0.0.1:8088/api/health
```

No compose local, o Nginx publica somente `127.0.0.1:8088:80`, então outro dispositivo da rede não acessa seu Mac por essa porta.

## Produção no servidor Debian/Ubuntu

1. Instalar Docker Engine e Compose Plugin.
2. Clonar o repositório público.
3. Criar `.env.docker` a partir de `.env.docker.example` e trocar `JWT_SECRET`/senha admin.
4. Subir HTTP inicial:

```bash
docker compose -f compose.yml -f compose.prod.yml up -d --build app nginx
```

5. Emitir certificado com Certbot conforme IP/domínio disponível.
6. Ajustar `deploy/nginx/conf.d/prod.conf` com o caminho real do certificado.
7. Definir `COOKIE_SECURE=true` em `.env.docker`.
8. Reiniciar:

```bash
docker compose -f compose.yml -f compose.prod.yml up -d
```

## Segurança operacional exigida pelo escopo

Mesmo com Docker, ainda precisa configurar no host Debian/Ubuntu:

- SSH somente por chave.
- Senha SSH desabilitada.
- Fail2Ban para sshd com `maxretry = 4` e `bantime = 24h`.
- Firewall expondo apenas 80/443 publicamente e SSH restrito.
- Qualys SSL Labs nota A e PQC depois do HTTPS ativo.
