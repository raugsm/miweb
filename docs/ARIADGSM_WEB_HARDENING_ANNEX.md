# AriadGSM Web Hardening Annex

Estado: anexo operativo de despliegue cloud para RC 0.9.2 sobre etapas cerradas
11, 14 y 15.
Version cloud: misma referencia de despliegue que el commit `main` publicado en
Render para `ariadgsm-ops`.

Este archivo no abre una etapa nueva. Documenta el hardening web requerido para
que `ariadgsm.com` procese Cloud Sync con el mismo contrato de firma del agente
0.9.16.

## Fuentes revisadas

- IETF RFC 9421: HTTP Message Signatures.
- OWASP ASVS: V8 Data Protection y V9 Communications.
- Render docs: environment variables, deploy hooks y health checks.
- hstspreload.org / Cloudflare HSTS preload requirements.
- Node.js docs: `crypto.createHmac` y `crypto.timingSafeEqual`.
- OWASP Secrets Management y Cryptographic Storage Cheat Sheets.

## Contrato de firma agente <-> cloud

Decision 0.9.16: se mantiene HMAC SHA-256 sobre el cuerpo exacto del batch para
compatibilidad con `raugsm/miweb-2.0`; el cambio 0.9.16 consolida la fuente
local del secreto sin alterar el contrato wire. RFC 9421 queda registrado como
candidato posterior porque aporta
canonicalizacion formal de componentes HTTP, pero este despliegue solo requiere
autenticar el body JSON exacto que controla el agente.

- Header: `X-AriadGSM-Signature`.
- Formato: `sha256=<hex-digest>`.
- Algoritmo: `HMAC-SHA-256`.
- Material firmado: bytes exactos del cuerpo HTTP enviado por el agente.
- Secreto: `agentToken` en `raugsm/miweb-2.0`
  `scripts/visual-agent/visual-agent.config.json`; el mismo valor debe estar en
  Render como `OPERATIVA_AGENT_KEY`.
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
- Endpoint read-only de observabilidad:
  `GET /api/operativa-v2/cloud/audit`.

## Endpoint read-only de auditoria Cloud Sync

Decision cloud 0.1.1: se agrega un endpoint read-only para validar live el
audit log append-only sin exponer cuerpos de lotes, firmas ni secretos.

Autenticacion elegida: HMAC con la misma clave `OPERATIVA_AGENT_KEY`, no Bearer
admin separado. Motivo: evita una segunda credencial en RC, mantiene la rotacion
ligada al secreto ya consolidado en el agente, y usa `crypto.timingSafeEqual`
como el contrato `/sync`.

Request:

```http
GET /api/operativa-v2/cloud/audit?limit=100&verdict=rejected
X-AriadGSM-Timestamp: <ISO-8601 UTC>
X-AriadGSM-Signature: sha256=<hex>
```

Material firmado:

```text
GET
/api/operativa-v2/cloud/audit
<query canonicalizado>
<timestamp ISO-8601>
```

Reglas:

- `limit`: default 100, max 1000.
- `since`: ISO-8601 opcional.
- `verdict`: `new`, `duplicate` o `rejected`.
- Ventana anti-replay: timestamp dentro de 5 minutos.
- Rate limit: 10 req/min por clave, configurable con
  `ARIADGSM_CLOUD_AUDIT_RATE_LIMIT_PER_MINUTE`.
- Sin auth o auth invalida: `401`.
- Exceso de rate: `429` con `Retry-After`.

Respuesta:

```json
[
  {
    "lote_id": "cloudsync-...",
    "agent_id": "desktop_agent",
    "timestamp": "2026-05-08T04:45:39.352Z",
    "hash_body": "<sha256-body>",
    "verdict": "rejected",
    "error_code": "invalid_json"
  }
]
```

Privacidad:

- No devuelve body crudo de lotes.
- No devuelve firmas crudas.
- No devuelve `OPERATIVA_AGENT_KEY`.
- No ofrece endpoint de borrado. La limpieza de audit log no se hace por HTTP.

## Single source of truth for agent secret

Decision 0.9.16: la fuente local autorizada vive en `raugsm/miweb-2.0`,
`scripts/visual-agent/visual-agent.config.json`, campo `agentToken`. Este repo
cloud no almacena una copia local de la clave; Render la recibe manualmente como
`OPERATIVA_AGENT_KEY` para verificar HMAC.

No usar `visual-agent.cloud.json`, archivos `.secret` ni variables locales como
fuente paralela. Si existe un fallback Railway legacy, queda apagado por defecto
en el agente y solo se habilita temporalmente con
`ARIADGSM_USE_RAILWAY_FALLBACK=true` tras confirmacion explicita de uso vivo.

## Rotacion de OPERATIVA_AGENT_KEY

1. Generar una nueva clave de al menos 32 bytes aleatorios.
2. Escribirla solo en `raugsm/miweb-2.0/scripts/visual-agent/visual-agent.config.json`, campo `agentToken`.
3. Bryams copia manualmente el mismo valor a Render como `OPERATIVA_AGENT_KEY`.
4. Manual Deploy en Render.
5. Enviar un lote firmado desde el agente local y validar respuesta `200`.
6. Validar en audit log verdict `new` o `duplicate`, sin copiar la clave a `curl`.
7. Retirar la clave anterior de variables de entorno y secretos locales.

## Deuda 3: credenciales separadas para write y audit

Hoy `/api/operativa-v2/cloud/sync` y
`/api/operativa-v2/cloud/audit` operan con `OPERATIVA_AGENT_KEY` por
simplicidad de RC. Migrar post-RC a credenciales separadas: una para escritura
agente->cloud y otra para lectura admin de audit, idealmente gestionadas con
vault/keyring.

Riesgo: si `OPERATIVA_AGENT_KEY` se filtra, compromete tanto la inyeccion de
lotes como la observabilidad de auditoria.

Prioridad: media.

Owner: Codex post-RC.
