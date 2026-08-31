# Evidência TLS — endereço IP público

**Aplicação:** POS CRUD MFA Demo  
**Alvo:** `147.15.124.129`  
**Coleta:** 31 de agosto de 2026  
**Método:** verificação externa TCP/HTTPS e verificação operacional autenticada na VM Oracle.

## Resultado executivo

O endpoint público está acessível por HTTPS, possui certificado Let's Encrypt emitido para o próprio endereço IP, redireciona HTTP para HTTPS e responde ao health check com HTTP 200.

```text
https://147.15.124.129/api/health
HTTP 200
{"ok":true,"service":"pos-crud-mfa-demo"}
```

## Evidências externas

| Verificação | Resultado coletado |
|---|---|
| HTTP | `301 Moved Permanently` para `https://147.15.124.129/api/health` |
| HTTPS | `200 OK` no endpoint `/api/health` |
| Protocolo negociado | TLS 1.3 |
| Cifra negociada | `TLS_AES_256_GCM_SHA384` |
| Emissor do certificado | Let's Encrypt, `YE1` |
| SAN do certificado | `IP Address: 147.15.124.129` |
| Janela observada do certificado | 31/08/2026 13:18:16 GMT a 07/09/2026 05:18:15 GMT |

## Evidências no servidor Oracle

| Controle | Evidência coletada |
|---|---|
| Certbot | `certbot 5.7.0` |
| Renovação | `snap.certbot.renew.timer`: `active` |
| Proxy público | Nginx: `active` |
| Firewall UFW | ativo; libera somente TCP 22, 80 e 443 |
| Aplicação | Docker saudável; endpoint interno e externo respondem health check |
| Exposição da aplicação | app publicada no loopback e atendida publicamente pelo Nginx |

## Relação com o escopo da disciplina

O escopo pede Certbot 5.4 ou superior com emissão para IP público, autorrenovação quando disponível e redirecionamento HTTP para HTTPS.[1] Essas condições foram verificadas acima na infraestrutura publicada.

O mesmo escopo pede teste no Qualys SSL Labs com nota A e suporte PQC.[1] O SSL Server Test atual apresenta o campo como `Hostname` e, ao receber o IP `147.15.124.129`, direciona testes de IP ao Qualys CertView em vez de emitir o relatório clássico do SSL Labs.[2]

## Limitação registrada de forma transparente

Não há relatório de **nota A** emitido pelo SSL Server Test para este IP. Além disso, a verificação local da VM encontrou OpenSSL `3.0.13` e nenhum grupo/algoritmo `ML-KEM`, `Kyber` ou `PQC` disponível. Portanto, **não se declara suporte PQC nem nota A sem evidência**.

O HTTPS por IP está operacional e validado. Caso seja exigida a evidência literal do SSL Labs com a frase de PQC, será necessário disponibilizar também um hostname/domínio no endpoint e usar uma camada TLS com suporte PQC verificável.

## Reproduzir verificações

```bash
curl -I http://147.15.124.129/api/health
curl -i https://147.15.124.129/api/health
openssl s_client -connect 147.15.124.129:443 -servername 147.15.124.129 -tls1_3
```

## Sources

[1] https://raw.githubusercontent.com/ziraldocardoso/Projeto_aplicado-praticas_de_mercado/main/Escopo_e_elementos_obrigatorios.md — Escopo e elementos obrigatórios
[2] https://www.ssllabs.com/ssltest — Qualys SSL Labs — SSL Server Test
