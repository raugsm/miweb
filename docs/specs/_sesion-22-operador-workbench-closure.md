# Sesion 22 - Cierre auditoria panel trabajador FRP

Fecha: 2026-05-06

Estado: cerrado para el alcance auditado.

## Alcance cerrado

Este cierre cubre el panel trabajador FRP Express y sus contratos de operacion:

- toma de jobs;
- ownership de jobs ya tomados;
- cambios de tecnico activo;
- estados de revision;
- multiples operadores;
- cola VIP;
- estado sin tecnico activo;
- swap en progreso;
- finalizados del dia;
- SSE/polling ante logout o permisos revocados.

No cubre bugs del portal cliente, rendimiento CSS global, crash del navegador al subir comprobante ni rediseno visual general.

## Fuentes externas base

Estas fuentes ya fueron usadas durante la auditoria y quedan como criterio de decision para cambios futuros:

- MDN EventSource / Server-sent events: los streams son conexiones persistentes y el cliente debe manejar error, cierre y reconexion.
  https://developer.mozilla.org/en-US/docs/Web/API/EventSource
  https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
- OWASP Authorization Cheat Sheet: validar autorizacion en el servidor, por cada request o evento sensible.
  https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- OWASP Session Management Cheat Sheet: logout y cambios de privilegio son eventos de seguridad que deben invalidar estado aplicable.
  https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- WAI-ARIA APG Dialog y Button: dialogs/botones deben tener comportamiento consistente de foco, teclado y cierre.
  https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
  https://www.w3.org/WAI/ARIA/apg/patterns/button/

## Contratos cerrados

| Contrato | Estado | Evidencia |
| --- | --- | --- |
| Nucleo FRP transaccional | Cerrado | `payment-review`, `take/take-next`, `finalize`, `cancel`, `review` y `ready` tienen cobertura Postgres granular. Docs: `_sesion-22-postgres-frp-*.md`. |
| Technician ID congelado | Cerrado | El trabajo actual prioriza `order.redirectorId` / `order.technicianId`. Doc: `_sesion-22-operador-current-job-frozen-technician-id.md`. |
| Observador multioperador | Cerrado | Jobs ajenos `EN_PROCESO` se muestran separados y no bloquean indebidamente al operador actual. Doc: `_sesion-22-operador-multi-operator-observer-contract.md`. |
| Finalizados hoy con N operadores | Cerrado | La UI usa marca compacta de tecnico basada en nombre completo y conserva `title`. Doc: `_sesion-22-operador-finalizados-multioperator-contract.md`. |
| Solo VIP y Tomar siguiente | Cerrado | Si `Solo VIP` muestra VIPs, el CTA toma el primer job visible especifico; si no, conserva `take-next`. Doc: `_sesion-22-operador-solo-vip-take-next-contract.md`. |
| Tomar card especifico contra tecnico activo stale | Cerrado | Backend rechaza si el tecnico activo cambio antes del click; frontend refresca estado tras error. Doc: `_sesion-22-operador-take-specific-active-tech-race-contract.md`. |
| Finalizar tras cambio de tecnico activo | Cerrado | El dueno congelado puede finalizar su job aunque el tecnico activo global cambie. Doc: `_sesion-22-operador-finalize-owner-after-active-switch-contract.md`. |
| Review/cancel tras cambio de tecnico activo | Cerrado | El dueno congelado conserva permiso; tecnico ajeno recibe 403. Doc: `_sesion-22-operador-review-cancel-owner-after-active-switch-contract.md`. |
| Resolver revision | Cerrado | Solo quien reporto, `ADMIN` o `COORDINADOR` puede resolver; otros ven solo lectura. Doc: `_sesion-22-operador-review-resolver-permission-contract.md`. |
| Swap congela acciones | Cerrado | Acciones del panel quedan deshabilitadas durante `swap.inProgress`. Doc: `_sesion-22-operador-swap-freezes-actions-contract.md`. |
| Sin tecnico activo | Cerrado | UI diferencia `Sin tecnico activo` de `No sos el tecnico activo`; backend rechaza toma sin activo. Doc: `_sesion-22-operador-no-active-technician-contract.md`. |
| Repaint al cerrar swap | Cerrado | Polling acelera a 2s durante swap, vuelve a 30s y repinta workbench. Doc: `_sesion-22-operador-swap-repaint-contract.md`. |
| Sesion perdida / logout / permisos revocados | Cerrado | SSE FRP revalida acceso antes de emitir, cierra streams stale y frontend refresca sesion. Doc: `_sesion-22-operador-session-permission-revocation-contract.md`. |

## Evidencia de validacion

Validacion local del ultimo corte:

```text
node --check server.js
node --check public/app.js
node --test test/phase3a.contract.test.js
node --test test/phase5.technician-swap.test.js
npm.cmd test -> 57/57
git diff --check -> sin errores
```

Validacion live del ultimo corte:

```text
releaseCommit: 142842d70f2c
postgres:read-check: ok=true
tableProjectionMismatches: []
reporte: /tmp/postgres-live-after-worker-session-permission-revocation.json
```

## Riesgos residuales

1. Revocacion global de todas las sesiones del usuario.

   El panel FRP ya cierra SSE, refresca sesion y deniega mutaciones. Eso no equivale a una politica global de invalidacion de todas las sesiones del usuario en todos los modulos.

2. Subida de comprobante reportada como bug de Chrome.

   Reclasificado el 2026-05-07: no hay evidencia actual de crash del navegador. La causa reportada era que algunos clientes creaban cuenta e iniciaban sesion sin confirmar la cuenta; al no estar confirmados, no podian subir comprobantes y lo interpretaban como fallo de imagen. Queda fuera del panel trabajador, pero debe reflejarse como claridad de precondicion en el flujo cliente.

3. Lentitud de carga CSS.

   No queda cubierta por esta auditoria. Requiere perfilado de rendimiento: waterfall, render-blocking CSS, bundle/static caching, Core Web Vitals y comparacion contra el contrato CSS anterior.

4. Pruebas visuales reales multi-dispositivo.

   Hay guardas contractuales y runtime, pero no una matriz visual exhaustiva en telefono/tablet/escritorio para todos los estados.

5. Nuevos roles futuros.

   Los contratos actuales cubren `ADMIN`, `COORDINADOR` y tecnicos FRP elegibles. Si se agregan roles nuevos, deben pasar por matriz de permisos antes de tocar UI.

## Regla para futuras modificaciones del panel trabajador

No mezclar nuevos cambios visuales con contratos de estado.

Orden recomendado:

1. declarar contrato;
2. revisar fuentes externas si toca seguridad, accesibilidad, rendimiento o protocolo;
3. auditar codigo actual;
4. aplicar corte pequeno;
5. agregar prueba estatica y, si toca estado, prueba runtime;
6. documentar;
7. deploy + read-check si toca runtime.

## Decision tecnica

La auditoria del panel trabajador queda suficientemente cerrada para no seguir metiendo parches en esa superficie sin una nueva razon concreta.

El siguiente trabajo no debe ser otro borde del panel trabajador. Debe ser uno de estos dos frentes, en este orden:

1. diseno funcional del panel trabajador v3, porque la auditoria ya cerro los contratos de estado;
2. claridad del flujo cliente cuando la cuenta no esta confirmada;
3. auditoria de lentitud CSS/carga, porque afecta percepcion general pero requiere medicion antes de tocar estilos.

## Siguiente paso unico recomendado

Abrir el diseno funcional:

```text
Panel trabajador FRP v3.
```

Entrada minima:

- contratos cerrados de la auditoria;
- reglas de bloqueo visibles;
- estructura desktop/mobile;
- criterios de aprobacion antes de codificar.
