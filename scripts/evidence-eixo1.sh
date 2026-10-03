#!/usr/bin/env bash
# Coleta evidências do Eixo 1 na VM OCI sem exibir arquivos ou valores sensíveis.
# Uso na VM: ~/evidence-eixo1.sh

set -euo pipefail

line() { printf '%*s\n' 76 '' | tr ' ' '='; }
section() {
  printf '\n'
  line
  printf ' %s\n' "$1"
  line
}
run() {
  printf '\n$ %s\n' "$1"
  eval "$1"
}

section 'EIXO 1 — EVIDÊNCIA DE INFRAESTRUTURA OCI'
printf 'Data UTC: '; date -u '+%Y-%m-%d %H:%M:%S UTC'
printf 'Host: '; hostname

section '1. SISTEMA OPERACIONAL'
run 'hostnamectl | sed -n "1,10p"'

section '2. FIREWALL — PORTAS EXPOSAS'
run 'sudo ufw status numbered'

section '3. PROTEÇÃO SSH — FAIL2BAN'
run 'printf "maxretry: "; sudo fail2ban-client get sshd maxretry'
run 'bantime="$(sudo fail2ban-client get sshd bantime)"; printf "bantime: %s segundos (24 horas)\n" "$bantime"'
run 'sudo fail2ban-client status sshd | grep -E "Currently (failed|banned)"'

section '4. POLÍTICA SSH — SOMENTE CHAVE PÚBLICA'
run 'sudo sshd -T | grep -E "^(passwordauthentication|permitrootlogin|pubkeyauthentication)"'

section '5. SERVIÇOS DE PRODUÇÃO'
run 'printf "nginx: "; systemctl is-active nginx'
run 'if systemctl is-active --quiet snap.certbot.renew.timer; then printf "renovação Certbot: active (snap.certbot.renew.timer)\n"; elif systemctl is-active --quiet certbot.timer; then printf "renovação Certbot: active (certbot.timer)\n"; else printf "renovação Certbot: INATIVA\n"; fi'

section '6. APLICAÇÃO PRIVADA ATRÁS DO NGINX'
run 'sudo ss -ltnp | grep -E "(:80|:443|:3001)" || true'
run 'curl -fsS --max-time 5 http://127.0.0.1:3001/api/health'

section 'FIM DA EVIDÊNCIA'
printf 'Nenhum segredo foi exibido por este script.\n'
