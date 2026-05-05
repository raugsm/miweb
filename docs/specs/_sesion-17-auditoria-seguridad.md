# Sesion 17 - Auditoria de seguridad inicial

Estado: auditoria inicial en curso.
Alcance: codigo actual de operador, portal cliente, recibos, uploads, sesiones y configuracion Render.
Regla: no corregir por intuicion. Cada hallazgo debe tener evidencia local, fuente externa, riesgo AriadGSM y prueba de cierre.

## Fuentes externas base

- OWASP Authentication Cheat Sheet: login throttling, politica de contrasenas y controles de autenticacion.
  https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP Forgot Password Cheat Sheet: tokens de recuperacion, rate limit y fugas por referrer.
  https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
- OWASP CSRF Prevention Cheat Sheet: SameSite ayuda, pero no reemplaza controles de origen/token.
  https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- OWASP File Upload Cheat Sheet: validar tipo, tamano, almacenamiento y controles de acceso.
  https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- OWASP API3:2023 Broken Object Property Level Authorization: evitar exponer propiedades sensibles que el usuario no necesita.
  https://owasp.org/API-Security/editions/2023/en/0xa3-broken-object-property-level-authorization/
- OWASP API1:2023 Broken Object Level Authorization: validar autorizacion por objeto, no confiar solo en IDs o codigos.
  https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/

## Hechos confirmados

1. El repo actual ya tiene headers de seguridad globales en `server.js`.
2. Las cookies de sesion usan `HttpOnly`, `SameSite` y `Secure` en produccion.
3. Las mutaciones `POST`, `PUT`, `PATCH` y `DELETE` pasan por validacion de origen.
4. El portal cliente tiene rate limit en registro, login, reenvio de verificacion, orden FRP y comprobantes.
5. `npm.cmd audit --omit=dev` no reporto vulnerabilidades conocidas en dependencias.
6. `data/`, `.local-preview-data/` y logs estan fuera de git.

## Hallazgos vivos

### SEC-001 - Login operador sin limite de fallos

Severidad: P1.

Evidencia local:

- `server.js` `POST /api/login` valida email/password y ante fallo solo audita `LOGIN_FAILED`.
- `server/core/validation.js` acepta cualquier contrasena de 8 caracteres o mas.
- `server/config/constants.js` ya tiene ventana de rate limit para portal, pero no existe constante especifica para login operador.

Fuente externa:

- OWASP Authentication Cheat Sheet recomienda login throttling para evitar que un atacante haga demasiados intentos de contrasena.

Riesgo AriadGSM:

- Un atacante puede probar contrasenas contra cuentas de Jack, Angelo, coordinadores o admin.
- La proteccion de PIN/dispositivo para admin ayuda, pero no cubre tecnicos y no evita fuerza bruta de password.

Decision:

- Agregar rate limit por email + IP al login interno.
- Contar fallos de password y PIN/setup token incorrecto, no todos los logins exitosos.
- Bloquear con 429 despues de varios fallos dentro de la ventana.

Impacto esperado:

- No debe afectar login normal.
- No debe afectar portal cliente.
- No debe afectar SSE, FRP, precios ni ordenes.

Prueba requerida:

- Test automatizado: despues de 5 fallos de login operador, el siguiente intento debe responder 429.
- Test completo: `npm.cmd test`.

Resultado implementado:

- `server/config/constants.js`: se agrego `maxOperatorLoginFailuresPerWindow = 5`.
- `server.js`: el helper de rate limit ahora permite revisar estado y registrar intento por separado.
- `server.js`: `/api/login` bloquea con 429 despues de 5 fallos por email + IP.
- `server.js`: se cuentan fallos de password y tambien fallos de PIN/codigo admin.
- `server.js`: los logs de fallo ya no guardan el correo crudo en `LOGIN_FAILED`; guardan `emailHash` e `ipHash`.
- `test/phase5.technician-swap.test.js`: se agrego prueba de bloqueo de login operador.

Validacion:

- `node --check server.js`: paso.
- `node --check server/config/constants.js`: paso.
- `node --check test/phase5.technician-swap.test.js`: paso.
- `node --test test/phase5.technician-swap.test.js`: paso, 2 pruebas.
- `npm.cmd test`: paso completo, 13 pruebas, 0 fallos.

Estado: SEC-001 cerrado en codigo local.

### SEC-002 - Recibo PDF con accessCode en URL

Severidad: P1/P2.

Evidencia local:

- `public/portal-modules/orders.js` crea `/api/portal/orders/:id/comprobante.pdf?accessCode=...`.
- `server/portal/portal-routes.js` permite descargar PDF si la sesion es del cliente o si `accessCode` coincide.
- `server/portal/serializers.js` envia `accessCode` al cliente dentro de la orden publica.

Fuente externa:

- OWASP API3 recomienda devolver solo propiedades necesarias y evitar exponer propiedades sensibles.
- OWASP Forgot Password advierte sobre fugas de tokens en URL/referrer para flujos con tokens.

Riesgo AriadGSM:

- El accessCode puede quedar en historial, logs, capturas o enlaces reenviados.
- Aunque el recibo solo se habilita finalizado, contiene datos operativos de la orden.

Decision tomada:

- Opcion 1 aprobada por Bryam: el recibo PDF solo se entrega al cliente logueado dueño de la orden.

Cambio local:

- `server/portal/portal-routes.js`: deja de generar `accessCode` para ordenes nuevas y el endpoint PDF ya no acepta `accessCode` por query string.
- `server/portal/serializers.js`: deja de enviar `accessCode` en la orden publica del cliente.
- `public/portal-modules/orders.js`: el boton "Recibo de operacion" apunta a `/api/portal/orders/:id/comprobante.pdf`, sin token en URL.
- `test/phase4.smoke.test.js`: cubre que la API cliente no expone `accessCode`, que el cliente dueño puede descargar PDF finalizado y que anonimo con `?accessCode=...` queda bloqueado.

Nota:

- Ordenes legacy pueden conservar un campo `accessCode` guardado en data vieja, pero despues de este cambio el runtime no lo genera, no lo expone y no lo acepta para autorizar recibos PDF.

Validacion local:

- `node --check server/portal/portal-routes.js`: paso.
- `node --check server/portal/serializers.js`: paso.
- `node --check public/portal-modules/orders.js`: paso.
- `node --check server/comprobante/pdf.js`: paso.
- `node --check test/phase4.smoke.test.js`: paso.
- `node --test test/phase4.smoke.test.js`: paso, 1 prueba.
- `npm.cmd test`: paso completo, 13 pruebas, 0 fallos.

### SEC-003 - Verificacion publica /v/:code enumerable

Severidad: P2.

Evidencia local:

- `server.js` sirve `/v/:code`.
- `nextCustomerOrderCode()` genera codigos secuenciales por dia: `CL-YYYYMMDD-001`.
- La pagina publica muestra monto, metodo, cantidad, estado y hash.

Fuente externa:

- OWASP API1 advierte que IDs o codigos manipulables pueden permitir acceso no autorizado a objetos.

Riesgo AriadGSM:

- Alguien podria probar codigos secuenciales y descubrir recibos existentes.

Decision pendiente:

- Mantener verificacion publica solo si se agrega token no enumerable o hash publico separado del codigo secuencial.

### SEC-004 - Turnstile soportado pero no garantizado en Render

Severidad: P2.

Evidencia local:

- `validateTurnstileIfConfigured()` salta la validacion si faltan `ARIAD_TURNSTILE_SITE_KEY` o `ARIAD_TURNSTILE_SECRET`.
- `render.yaml` no declara esas variables.

Fuente externa:

- OWASP Authentication recomienda controles anti-automatizacion para reducir ataques automatizados.

Riesgo AriadGSM:

- Si las variables no estan configuradas manualmente en Render, registro y creacion de ordenes dependen solo de rate limit.

Decision pendiente:

- Verificar Render real y documentar si Turnstile esta activo.

### SEC-005 - Debug global de Panel 4 en produccion

Severidad: P3.

Evidencia local:

- `public/portal-modules/panel-4-connection.js` expone `window.__panel4DebugState` y `window.updatePanel4`.

Fuente externa:

- Buenas practicas de hardening frontend: no dejar controles de prueba disponibles en build productivo.

Riesgo AriadGSM:

- No permite procesar ni saltar permisos de backend, pero puede falsear visualmente el panel desde consola.

Decision pendiente:

- Quitar debug global o activarlo solo en entorno local.
