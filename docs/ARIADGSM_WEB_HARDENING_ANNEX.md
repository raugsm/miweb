# AriadGSM Web Hardening Annex

Estado: anexo operativo de despliegue cloud para RC 0.9.2 sobre etapas cerradas
11, 14 y 15.
Version cloud: misma referencia de despliegue que el commit `main` publicado en
Render para `ariadgsm-ops`.

Este archivo no abre una etapa nueva. Documenta el hardening web requerido para
que `ariadgsm.com` procese Cloud Sync con el mismo contrato de firma del agente
0.9.15.

## Fuentes revisadas

- IETF RFC 9421: HTTP Message Signatures.
- OWASP ASVS: V8 Data Protection y V9 Communications.
- Render docs: environment variables, deploy hooks y health checks.
- hstspreload.org / Cloudflare HSTS preload requirements.
- Node.js docs: `crypto.createHmac` y `crypto.timingSafeEqual`.

## Contrato de firma agente <-> cloud

Decision 0.9.15: se mantiene HMAC SHA-256 sobre el cuerpo exacto del batch para
compatibilidad con `raugsm/miweb-2.0` y para evitar una reescritura de protocolo
durante el RC. RFC 9421 queda registrado como candidato posterior porque aporta
canonicalizacion formal de componentes HTTP, pero este despliegue solo requiere
autenticar el body JSON exacto que controla el agente.

- Header: `X-AriadGSM-Signature`.
- Formato: `sha256=<hex-digest>`.
- Algoritmo: `HMAC-SHA-256`.
- Material firmado: bytes exactos del cuerpo HTTP enviado por el agente.
- Secreto: `OPERATIVA_AGENT_KEY`, igual en agente local y cloud.
- Comparacion servidor: `crypto.timingSafeEqual`.
- Firma ausente: `401` con `{ "error": "signature_missing" }`.
- Firma invalida: `401` con `{ "error": "signature_invalid" }`.
- Rate limit cloud: por `agentToken`, base 60 req/min, configurable con
  `ARIADGSM_CLOUD_SYNC_RATE_LIMIT_PER_MINUTE`.
- Respuesta rate limit: `429` con header `Retry-After`.

## Controles cloud desplegables

- HMAC verify en `/api/operativa-v2/cloud/sync` antes del gate de Origin y antes
  de procesar el batch.
- HSTS: `max-age=31536000; includeSubDomains; preload`.
- CSP sin `unsafe-inline`; estilos y scripts necesarios salen a archivos
  estaticos.
- Audit log append-only en `cloud-sync-audit.jsonl` con `lote_id`, `agent_id`,
  `timestamp`, `hash` del body y `verdict`.
- Esquema versionado: `server/contracts/audit-log-entry.schema.json`.

## Rotacion de OPERATIVA_AGENT_KEY

1. Generar una nueva clave de al menos 32 bytes aleatorios.
2. Configurarla en Render como `OPERATIVA_AGENT_KEY`.
3. Configurar la misma clave en el agente local.
4. Enviar un lote firmado de prueba y validar respuesta `200`.
5. Enviar una firma vieja y validar `401 { "error": "signature_invalid" }`.
6. Retirar la clave anterior de variables de entorno y secretos locales.
