# Sesion 20 - Confirmacion manual de cliente portal

## Objetivo

Habilitar una via operativa para confirmar manualmente un cliente portal cuando el flujo normal de verificacion por correo falla, especialmente en celulares.

Esto no reemplaza la verificacion por correo. Es una excepcion administrada desde el panel admin.

## Fuentes externas usadas

- OWASP Email Validation and Verification Cheat Sheet: la verificacion de correo es parte sensible de identidad y debe evitar confusion de cuentas y abuso.
  https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html
- OWASP Logging Cheat Sheet: los eventos de seguridad y cambios relevantes deben quedar auditables sin exponer datos sensibles.
  https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html

## Decision

- Boton visible en `Clientes portal` solo cuando `emailVerified` es falso.
- Endpoint: `POST /api/admin/customer-clients/:id/confirm`.
- Permiso: solo `ADMIN`.
- Postgres: escritura granular transaccional, sin `writeDb` snapshot.
- Auditoria: `PORTAL_CLIENT_MANUALLY_CONFIRMED`.
- Estado:
  - `REGISTRADO_NO_VERIFICADO` pasa a `EMAIL_VERIFICADO`.
  - `VIP`, `EMPRESA` y `VERIFICADO` se preservan.
  - `BLOQUEADO` no se puede confirmar.
- Tokens pendientes de verificacion del cliente quedan marcados como usados.

## Riesgo controlado

El boton puede activar manualmente una cuenta sin prueba automatica del enlace. Por eso se restringe a admin, deja auditoria y no acepta clientes bloqueados.

## Verificacion local

```bash
node --check server/db/postgres-customer-admin.js
node --check server.js
node --check public/app.js
npm test
git diff --check
```

## Smoke en Render

```bash
cd /opt/render/project/src
curl -fsS https://ops.ariadgsm.com/api/health
curl -fsS https://ariadgsm.com/api/health
npm run postgres:read-check -- --report /tmp/postgres-live-after-manual-client-confirm.json --strict
cat /tmp/postgres-live-after-manual-client-confirm.json
```

## Pendiente separado

Auditar por que ciertos celulares no completan la verificacion por enlace:

- confirmar URL final usada en correo y dominio correcto (`ariadgsm.com` vs `ops.ariadgsm.com`);
- probar apertura en Gmail movil, navegador movil e incognito;
- revisar si el token llega truncado, doble escapado o pierde query string;
- registrar solo hashes/detalles no sensibles al fallar `PORTAL_EMAIL_VERIFICATION_FAILED`.
