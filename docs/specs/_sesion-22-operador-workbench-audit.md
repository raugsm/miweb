# Sesion 22 - Auditoria panel operador FRP

Fecha: 2026-05-06

Estado: auditoria tecnica, sin cambios runtime.

## Alcance

Esta auditoria revisa el panel de trabajo de operador FRP Express:

- contrato documentado;
- implementacion frontend;
- endpoints backend usados por el panel;
- riesgos restantes despues del cutover PostgreSQL;
- diferencias entre lo que el panel promete y lo que el codigo sostiene.

No aplica cambios de producto ni UI. Cualquier correccion posterior debe salir como corte separado y verificable.

## Fuentes externas usadas

- MDN EventSource: SSE es una conexion persistente unidireccional servidor -> navegador; debe manejar apertura, errores, cierre y limites de conexiones por origen.
  https://developer.mozilla.org/en-US/docs/Web/API/EventSource
- MDN aria-live: las actualizaciones dinamicas importantes deben anunciarse con live regions; `polite` evita interrumpir tareas normales.
  https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-live
- WAI-ARIA APG Modal Dialog: un dialog modal debe mantener el foco dentro, cerrar con Escape y tener una accion visible de cierre.
  https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- WAI-ARIA APG Button: las acciones tipo boton deben activarse con Space y Enter y devolver/mover el foco segun el contexto.
  https://www.w3.org/WAI/ARIA/apg/patterns/button/

## Hechos verificados

1. El repo local esta en `main`, commit `19619f0`.
2. `docs/ariadgsm-decisiones-FINAL-2026-05-02.md` aun presenta el panel operador como reemplazo pendiente: Camino A, dos columnas, sistema "Tomar", SSE y cancelacion como roadmap posterior.
3. `docs/specs/operador/operador-frp-express.md` v1.2 ya dice que FRP Ops v2, SSE, timeout 30 min y cleanup visual estan implementados, pero con "validacion profunda pendiente".
4. `public/app.js` ya renderiza `FRP Ops v2` con:
   - trabajo actual;
   - cola;
   - pagos por revisar;
   - atencion;
   - finalizados hoy;
   - SSE `/api/operator/frp/events`.
5. `server.js` ya tiene SSE operador con audit granular para connect/disconnect.
6. `payment-review` ya tiene camino PostgreSQL granular cuando existe `reviewFrpPaymentPostgres`.
7. `take`, `take-next`, `finalize`, `cancel` y `review` siguen usando el patron `readDb() -> mutar snapshot -> writeDb(db)` en `server/frp/frp-routes.js`.

## Hallazgos

### P0 - El nucleo de trabajo todavia no esta transaccional

El panel depende de `take`, `take-next`, `finalize`, `cancel` y `review` para bloquear trabajo, cerrar equipos y mover estados. Esas rutas siguen escribiendo via snapshot completo.

Evidencia:

- `_sesion-20-postgres-frp-core-transactional-preflight.md` ya marco estas rutas como riesgo pendiente.
- `_sesion-20-postgres-frp-payment-review-transactional.md` dejo fuera de alcance `take`, `take-next`, `finalize`, `cancel` y `review`.
- `server/frp/frp-routes.js` todavia llama `writeDb(db)` en esas rutas.

Riesgo:

- doble toma logica si dos requests compiten;
- finalizar un job que ya fue cancelado/revisado por otra ruta cercana;
- volver a disparar el guard `POSTGRES_RUNTIME_DESTRUCTIVE_WRITE_BLOCKED` si un snapshot llega incompleto;
- estados cliente-operador inconsistentes justo en el flujo que mas importa.

Decision recomendada:

No hacer reforma visual grande antes de migrar `take/take-next` y despues `finalize/cancel/review` a escritura atomica PostgreSQL.

### P1 - Hay drift entre documentos de decision y spec activa

El documento final del 2 de mayo trata SSE/Tomar/cancelacion como futuro. La spec del operador del 3 de mayo y el codigo ya los tienen implementados.

Riesgo:

- repetir trabajo;
- reabrir decisiones cerradas;
- disenar una "reforma" como si el panel siguiera en v1;
- mezclar cambios visuales con deuda transaccional.

Decision recomendada:

Marcar `docs/specs/operador/operador-frp-express.md` como fuente de verdad actual del panel FRP, y actualizar el handoff/decisiones solo con diferencias vivas.

### P1 - "Atencion / Resolver" esta renderizado pero no esta conectado

El frontend renderiza cards de atencion con `data-frp-show-review`, pero el delegador de clicks solo maneja `data-frp-review`.

Evidencia:

- `public/app.js` renderiza `data-frp-show-review` en la seccion Atencion.
- `public/app.js` solo escucha `data-frp-review`, usado por el boton "Reportar problema" del trabajo actual.

Riesgo:

- un job en `REQUIERE_REVISION` puede aparecer como resoluble pero el click no hace nada;
- el tecnico queda sin flujo claro para cerrar casos de atencion;
- el panel aparenta tener una cola de excepciones que no puede operar.

Decision recomendada:

No arreglarlo como cambio suelto todavia. Debe entrar en el corte "review transaccional + flujo resolver", porque afecta estado y excepciones.

### P1 - El Technician ID mostrado en trabajo actual puede salir del turno global, no del job

`frpOpsV2RenderCurrentActive` muestra `tech.active.redirectorId`. Pero el portal congela el redirector en la orden al momento de conexion. La spec dice que si Jack tomo un job, el job conserva su dueno aunque Angelo sea el activo.

Riesgo:

- si el turno activo cambia mientras un job sigue tomado, el panel puede mostrar al tecnico un Technician ID que pertenece al turno nuevo y no al equipo conectado originalmente;
- esto mezcla dos conceptos distintos: "turno activo" y "trabajo tomado".

Decision recomendada:

Exponer y renderizar el redirector congelado de la orden/job para el trabajo actual. El badge del header puede seguir mostrando el turno global.

### P2 - "Reportar problema" usa `window.prompt`, no el modal prometido

La spec dice que "Reportar problema" abre un modal separado. El codigo actual usa `window.prompt`.

Riesgo:

- UX pobre para tecnicos;
- no hay categorias ni campos estructurados;
- comportamiento inconsistente con dialogos accesibles;
- dificil validar con teclado/foco segun APG.

Decision recomendada:

Resolverlo junto con el flujo `review`, no como polish aislado.

### P2 - SSE esta bien orientado, pero necesita guardas de regresion

El SSE operador esta implementado y usa audit granular en connect/disconnect. Eso corrige parte del incidente Postgres anterior.

Riesgo:

- futuras rutas SSE/GET pueden volver a introducir `writeDb(db)`;
- multiples tabs consumen conexiones SSE del mismo origen; MDN documenta limites relevantes si no se usa HTTP/2.

Decision recomendada:

Agregar tests/reglas de contrato para impedir nuevos `writeDb(db)` en GET/SSE y documentar que los eventos vivos no deben persistir snapshots completos.

## Supuestos debiles

- Se asume que Jack/Angelo casi siempre operan en desktop, pero la app ya se usa en pruebas reales con pantallas estrechas y DevTools abierto.
- Se asume que un solo tecnico activo evita carreras, pero el backend todavia necesita bloqueo atomico porque los requests pueden competir.
- Se asume que el v2 "implementado" equivale a "listo"; la propia spec dice validacion profunda pendiente.

## Opinion tecnica

No conviene reiniciar el panel desde cero ahora. El panel v2 ya existe y varias piezas operativas funcionaron en pruebas reales. Reiniciar ahora aumentaria deuda, porque el riesgo principal ya no es "como se ve", sino "si los cambios de estado son atomicos y si los contratos vivos coinciden con la UI".

La reforma correcta ahora es estabilizacion por capas:

1. backend transaccional del nucleo de trabajo;
2. contrato frontend/backend del workbench;
3. resolver gaps de UI funcional (`Resolver`, modal de problema, Technician ID congelado);
4. luego polish visual.

## Siguiente paso unico recomendado

Implementar el corte:

```text
FRP core transaccional: take / take-next
```

Por que este primero:

- es el candado real del sistema "Tomar";
- es la parte que evita trabajo duplicado entre tecnicos;
- ya esta identificado como siguiente despues de `payment-review`;
- tiene criterios claros de prueba: dos llamadas concurrentes no deben tomar el mismo job y no debe aparecer `POSTGRES_RUNTIME_DESTRUCTIVE_WRITE_BLOCKED`.

## Actualizacion 2026-05-06

- `take/take-next` fue migrado a escritura transaccional PostgreSQL en `_sesion-22-postgres-frp-take-transactional.md`.
- El siguiente corte aplicado fue `finalize/cancel`, documentado en `_sesion-22-postgres-frp-finalize-cancel-transactional.md`.
- El siguiente corte aplicado fue `review`, documentado en `_sesion-22-postgres-frp-review-transactional.md`.
- El nucleo FRP critico ya no depende de escritura legacy por snapshot completo para `payment-review`, `take/take-next`, `finalize`, `cancel` ni `review`.
- Riesgo restante del workbench: contrato funcional de `REQUIERE_REVISION` (`data-frp-show-review`, modal real de problema y flujo resolver), no el snapshot destructivo del nucleo.

## Actualizacion 2026-05-06 - resolver revision

- El contrato funcional de `REQUIERE_REVISION` fue implementado en `_sesion-22-postgres-frp-review-resolver-contract.md`.
- `data-frp-show-review` ya abre un dialogo de resolucion.
- `Reportar problema` ya usa dialogo controlado en vez de `window.prompt`.
- `PATCH /api/frp/jobs/:id/ready` ya tiene camino PostgreSQL granular.

## Actualizacion 2026-05-06 - Technician ID congelado

- El P1 de Technician ID del trabajo actual fue cerrado en `_sesion-22-operador-current-job-frozen-technician-id.md`.
- `publicFrpJob` ahora expone `order.redirectorId` y `order.technicianId` desde el dato congelado de la orden FRP.
- `frpOpsV2RenderCurrentActive` prioriza el Technician ID congelado del job/orden y solo cae al tecnico activo global como fallback.
- Se agregaron guardas en `phase3a.contract.test.js` y `phase4.smoke.test.js`.

Riesgo residual del panel trabajador: ya no es el dato mostrado en `Tu trabajo actual`; lo pendiente es validar UX real con tecnico cambiando de turno mientras mantiene jobs viejos en observacion.

## Actualizacion 2026-05-06 - observacion multioperador

- El caso observador fue generalizado de Jack/Angelo a N operadores en `_sesion-22-operador-multi-operator-observer-contract.md`.
- `Tu trabajo actual` queda reservado al job propio del usuario actual.
- Jobs de otros operadores en `EN_PROCESO` se listan en una seccion separada: `Trabajos en curso por otros`.
- El CTA `Tomar siguiente` ya no queda bloqueado por jobs ajenos si el operador actual no tiene job propio.

## Actualizacion 2026-05-06 - Finalizados hoy multioperador

- La seccion `Finalizados hoy` ya venia alimentada por `finishedTodayJobs[]`, que incluye todos los jobs `FINALIZADO` del dia en Lima para el canal FRP.
- El riesgo encontrado no era de backend, sino de representacion: el frontend reducia `technicianName` a una sola inicial, suficiente para Jack/Angelo pero ambiguo con N operadores.
- La UI ahora usa una marca compacta derivada del nombre completo (`JA`, `BZ`, etc.) y conserva el `title` con el nombre completo.
- Se agrego guarda en `phase3a.contract.test.js` para impedir que la seccion vuelva a depender de `frpOpsV2TechInitial`.

## Actualizacion 2026-05-06 - Cola Solo VIP y Tomar siguiente

- Riesgo encontrado: `Solo VIP` filtraba la lista client-side, pero el CTA grande `Tomar siguiente` seguia llamando `/api/frp/jobs/take-next`.
- Eso podia tomar el job mas antiguo global aunque estuviera oculto por el filtro VIP.
- Se unifico la cola visible en `frpOpsV2QueueViewState`.
- Si `Solo VIP` esta activo y hay VIPs visibles, el CTA grande llama el endpoint especifico del primer job visible (`POST /api/frp/jobs/:id/take`).
- Si el filtro esta apagado, o si no hay VIPs y la UI muestra todos por fallback, el CTA conserva `/api/frp/jobs/take-next`.

## Actualizacion 2026-05-06 - Tomar card especifico con tecnico activo stale

- Riesgo revisado: el operador podia ver un card con boton `Tomar`, pero el tecnico activo global podia cambiar antes del click.
- Hecho confirmado: `POST /api/frp/jobs/:id/take` exige `requireActiveFrpTechnician` en backend justo antes de mutar.
- Se agrego prueba runtime en `phase5.technician-swap.test.js`: Jack ve/tiene sesion, el admin cambia tecnico activo a Angelo, Jack intenta tomar el job especifico y recibe 403.
- La misma prueba confirma que el job queda `LISTO_PARA_TECNICO` y Angelo puede tomarlo.
- Se agrego guarda frontend en `phase3a.contract.test.js`: el catch de `takeSpecificFrpJob` muestra error y hace `refreshSession()`.

## Actualizacion 2026-05-06 - Finalizar job tomado tras cambio de tecnico activo

- Riesgo revisado: `Finalizar` podia confundirse con `Tomar` y depender del tecnico activo global.
- Hecho confirmado: `PATCH /api/frp/jobs/:id/finalize` no usa `requireActiveFrpTechnician`; valida el dueno congelado del job (`technicianId`) o rol `ADMIN`.
- Se agrego prueba runtime en `phase5.technician-swap.test.js`: Jack toma un job, el admin cambia el tecnico activo global a Angelo, y Jack todavia puede finalizar su job.
- La misma prueba confirma que el job queda `FINALIZADO` y conserva `technicianId` de Jack.
- Se agrego guarda frontend en `phase3a.contract.test.js`: el trabajo actual se renderiza por ownership (`job.technicianId === session.user?.id`) y las acciones solo se bloquean durante `swapInProgress`.
- Documento dedicado: `_sesion-22-operador-finalize-owner-after-active-switch-contract.md`.

## Actualizacion 2026-05-06 - Review/cancel de job tomado tras cambio de tecnico activo

- Riesgo revisado: `Reportar problema` y `Cancelar job` podian confundirse con `Tomar` y depender del tecnico activo global.
- Hecho confirmado: `PATCH /api/frp/jobs/:id/review` y `PATCH /api/frp/jobs/:id/cancel` no usan `requireActiveFrpTechnician`; validan el dueno congelado del job (`technicianId`) o rol `ADMIN`.
- Se agregaron pruebas runtime en `phase5.technician-swap.test.js`: Jack toma un job, el admin cambia el tecnico activo global a Angelo, Angelo recibe 403 si intenta operar el job, y Jack conserva permiso.
- Diferencia confirmada: `review` conserva `technicianId` y mueve a `REQUIERE_REVISION`; `cancel` con `timeout` libera a `LISTO_PARA_TECNICO` y limpia `technicianId`.
- Se amplio el guarda frontend en `phase3a.contract.test.js` para cubrir `Marcar finalizado`, `Reportar problema` y `Cancelar job` desde el trabajo actual del dueno.
- Documento dedicado: `_sesion-22-operador-review-cancel-owner-after-active-switch-contract.md`.

## Actualizacion 2026-05-06 - Resolver revision con permisos granulares

- Riesgo revisado: `Resolver revision` opera sobre `REQUIERE_REVISION`, no sobre un job `EN_PROCESO`; por tanto no podia heredar el contrato de tecnico activo global.
- Decision: solo puede devolver a cola el tecnico que reporto el caso, `ADMIN` o `COORDINADOR`.
- UI: los tecnicos regulares que ven una revision ajena la reciben como `Solo lectura`, con la card deshabilitada.
- Backend: `PATCH /api/frp/jobs/:id/ready` devuelve 403 si un tecnico ajeno intenta resolver una revision.
- Se agregaron pruebas unitarias, contrato frontend y prueba runtime con cambio de tecnico activo.
- Documento dedicado: `_sesion-22-operador-review-resolver-permission-contract.md`.

### Validacion adicional - roles elevados

- Se agrego prueba runtime para `ADMIN` y `COORDINADOR` resolviendo una revision ajena.
- La prueba confirma que ambos roles pueden devolver el job a `LISTO_PARA_TECNICO` y que `technicianId` queda limpio.
- El helper de prueba usa payload unico por comprobante para no saltarse ni falsear la guarda anti-reuso de comprobantes.
