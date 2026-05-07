# Sesion 23 - Diseno funcional panel trabajador FRP v3

Fecha: 2026-05-07

Estado: diseno funcional, sin implementacion.

## Decision de inicio

Si corresponde comenzar el diseno del panel trabajador, pero no como CSS directo.

La auditoria de contratos ya cerro los riesgos de estado mas importantes. El siguiente paso correcto es convertir esos contratos en una estructura visual operativa: que el tecnico vea primero lo que puede hacer, lo que no puede hacer, por que esta bloqueado y que paso sigue.

## Correccion de contexto: bug de Chrome/comprobante

El supuesto bug de Chrome queda reclasificado:

- no hay evidencia actual de crash del selector de archivos;
- la causa reportada era que algunos clientes creaban cuenta e iniciaban sesion, pero no confirmaban la cuenta;
- al no estar confirmados, no podian subir comprobantes;
- el usuario interpretaba el bloqueo como "no se puede subir imagen".

Conclusion: no se debe tratar como bug de navegador. Es un problema de claridad de estado y precondicion del flujo cliente. Para el panel trabajador, la leccion es directa: cada bloqueo debe explicar el motivo real, no solo deshabilitar acciones.

## Fuentes externas usadas

- W3C APG Dialog: los dialogos deben mover foco adentro, mantener el foco dentro, cerrar con Escape y devolver foco al origen cuando corresponda.
  https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- W3C APG Button: las acciones deben comportarse como botones, activarse con Space/Enter y exponer estado deshabilitado cuando no esten disponibles.
  https://www.w3.org/WAI/ARIA/apg/patterns/button/
- W3C WCAG Status Messages: mensajes de error, progreso o resultado deben ser determinables para tecnologia asistiva cuando no cambian foco.
  https://www.w3.org/WAI/WCAG21/Understanding/status-messages.html
- MDN EventSource: SSE mantiene una conexion persistente, unidireccional, con estados de apertura/error/cierre y limite de conexiones por origen.
  https://developer.mozilla.org/en-US/docs/Web/API/EventSource
- Material Design Data Tables: tablas operativas deben soportar lectura densa, hover/seleccion, sorting cuando aplica y tratamiento claro de headers largos.
  https://m1.material.io/components/data-tables.html

## Hechos de base

- El panel actual ya implementa `FRP Ops v2`.
- El render principal vive en `public/app.js`, desde `renderFrp()` y helpers `frpOpsV2*`.
- El backend ya sostiene:
  - toma transaccional;
  - ownership de jobs;
  - resolver revision con permisos;
  - switch de tecnico;
  - SSE de estado FRP;
  - cierre de streams ante revocacion/logout.
- El cierre de auditoria esta en `_sesion-22-operador-workbench-closure.md`.

## Objetivo del v3

Reducir confusion operativa en un panel vivo.

El panel v3 debe responder en menos de 3 segundos:

1. Quien esta activo.
2. Que estoy procesando yo.
3. Que puede tomar el tecnico ahora.
4. Que esta bloqueado y por que.
5. Que necesita atencion humana.
6. Que ya se completo hoy.

## No objetivos

No hacer:

- landing page;
- hero visual;
- rediseno decorativo;
- animaciones pesadas;
- cambio de contratos backend;
- nueva logica de permisos;
- nuevo flujo cliente;
- cambio del core Postgres;
- refactor masivo de `public/app.js`.

## Principios de diseno

1. Estado antes que estetica.

   Cada card debe decir si el operador puede actuar, observar o esperar.

2. Una accion primaria por contexto.

   Si el tecnico no tiene job propio, la accion principal es `Tomar siguiente`.
   Si tiene job propio, la accion principal es `Marcar finalizado`.

3. Bloqueo explicito.

   Un boton deshabilitado debe tener razon visible o `title`. No debe obligar al operador a adivinar.

4. No mezclar ownership con tecnico activo.

   `Tecnico activo` define quien puede tomar nuevo trabajo. `technicianId` del job define quien opera ese job.

5. Densidad util.

   El panel es herramienta de trabajo, no pagina comercial. Debe ser escaneable, compacto y repetible.

6. Live state visible pero no ruidoso.

   SSE, reconnect, swap y permisos deben mostrarse como estado operativo, no como toast invasivo.

## Propuesta de arquitectura visual

### 1. Barra de estado superior

Una franja compacta fija dentro del panel FRP:

```text
FRP Express | Tecnico activo: Jack | Live: conectado | Cola: 4 | Revision: 1
```

Debe incluir:

- tecnico activo;
- estado SSE;
- swap en progreso;
- alerta de permisos/sesion si aplica;
- resumen de carga actual.

No debe ocupar mucho alto. Su funcion es orientar, no vender.

### 2. Zona de trabajo principal

Orden propuesto:

```text
[Tu trabajo actual]
[Trabajos en curso por otros]
[Cola lista para tecnico]
```

Razon:

- el operador primero necesita saber si tiene algo propio;
- luego si otros estan ocupando trabajos;
- luego que puede tomar.

### 3. Zona de excepciones

Grid compacto:

```text
[Pagos por revisar] [Atencion / revision]
[Clientes bloqueados o no confirmados] (solo si aplica)
```

El tercer bloque es nuevo como concepto de diseno, no necesariamente implementacion inmediata. Sirve para no confundir problemas del flujo cliente con fallas de subida.

### 4. Zona de historial corto

```text
[Finalizados hoy]
```

Debe ser tabla compacta, no cards grandes. Material Data Tables aplica aqui porque es informacion historica, repetitiva y escaneable.

### 5. Zona administrativa secundaria

```text
[Costos FRP]
```

Debe seguir colapsada por defecto. No debe competir con el trabajo actual.

## Estados obligatorios por superficie

### Tu trabajo actual

Debe cubrir:

- propio en proceso;
- propio con timeout;
- sin trabajo y puedo tomar;
- sin trabajo pero no soy tecnico activo;
- sin tecnico activo;
- swap en progreso;
- sesion/permisos revocados;
- error de backend tras click.

### Cola

Debe cubrir:

- lista normal;
- Solo VIP activo con VIP visible;
- Solo VIP sin VIP y fallback a todos;
- no hay jobs;
- no puedo tomar porque no soy activo;
- no puedo tomar porque ya tengo job;
- stale tecnico activo entre render y click.

### Atencion / revision

Debe cubrir:

- puedo resolver porque soy dueno;
- puedo resolver por rol elevado;
- solo lectura porque no soy dueno ni rol elevado;
- swap en progreso;
- job ya resuelto por otro usuario.

### Pagos por revisar

Debe cubrir:

- revisar comprobante;
- comprobante con formato visible;
- error de carga del comprobante;
- accion bloqueada por permisos;
- accion bloqueada por swap.

### Clientes bloqueados/no confirmados

Debe cubrir:

- cuenta no confirmada;
- cliente verificado manualmente por admin;
- cliente bloqueado;
- falta comprobante por precondicion, no por error de archivo.

Nota: esta seccion puede empezar como estado informativo en el diseno. La implementacion debe esperar a confirmar datos disponibles en `session.frp` o endpoint especifico.

## Wireframe funcional

Desktop:

```text
+-------------------------------------------------------------+
| FRP Express  Activo: Jack  Live conectado  Cola 4  Rev 1    |
+-------------------------------------------------------------+
| TU TRABAJO ACTUAL                                           |
| +---------------------------------------------------------+ |
| | ARD-... | Cliente | Technician ID | proceso | acciones  | |
| +---------------------------------------------------------+ |
|                                                             |
| TRABAJOS EN CURSO POR OTROS                                |
| +--------------+ +--------------+                          |
| | lectura      | | lectura      |                          |
| +--------------+ +--------------+                          |
|                                                             |
| COLA LISTA                         [Solo VIP] [Tomar sig.] |
| +---------------------------------------------------------+ |
| | job visible | cliente | estado | Tomar                  | |
| +---------------------------------------------------------+ |
|                                                             |
| +------------------------+ +------------------------------+ |
| | PAGOS POR REVISAR     | | ATENCION / REVISION          | |
| +------------------------+ +------------------------------+ |
|                                                             |
| FINALIZADOS HOY                                             |
| tabla compacta                                              |
|                                                             |
| COSTOS FRP (colapsado)                                      |
+-------------------------------------------------------------+
```

Mobile:

```text
FRP Express
Activo / Live / Cola

Tu trabajo actual
Cola
Atencion
Pagos
Finalizados
Costos
```

En mobile no usar dos columnas. La prioridad es lectura y botones grandes, no densidad.

## Mockup visual v3

Archivo:

```text
docs/specs/operador/mockups/operador-frp-express-v3.html
```

Proposito:

- revisar estructura visual desktop/mobile antes de tocar runtime;
- validar jerarquia: estado superior, trabajo propio, observacion, cola, excepciones, finalizados y costos;
- mantener el bug de comprobante reclasificado como estado de cuenta no confirmada, no como crash de Chrome;
- conservar un artefacto estatico para discutir diseno sin mezclarlo con contratos backend.

Este mockup no es implementacion y no reemplaza pruebas runtime. Solo permite aprobar o corregir la direccion visual antes de tocar `public/app.js` o CSS productivo.

## Reglas de componentes

### Botones

- Usar `<button>` real cuando sea posible.
- `disabled` para bloqueo real.
- `aria-disabled` solo si el elemento debe seguir siendo enfocable por razon explicativa.
- Botones que abren dialogo deben mover foco al dialogo.
- Botones no disponibles deben explicar motivo.

### Dialogos

- `Reportar problema`, `Resolver revision`, `Ver comprobante` deben conservar contrato modal.
- Escape cierra si no hay accion irreversible en curso.
- Foco vuelve al boton que abrio el dialogo cuando sea posible.
- Acciones destructivas deben enfocar la opcion menos destructiva por defecto.

### Mensajes

- Errores/bloqueos inline deben ser visibles y anunciables.
- Reconnect/SSE debe ser `status`, no alerta agresiva salvo perdida critica.
- Bloqueo de cliente no confirmado debe decir la causa real.

### Tablas

- Usar tabla compacta para `Finalizados hoy`.
- Mantener columnas: codigo, cliente, tecnico, hora.
- No usar cards grandes para historico repetitivo.
- Si hay columnas largas, truncar con `title`.

## Riesgos del rediseno

1. Romper contratos ya cerrados por mover condiciones visuales.

   Mitigacion: cada cambio visual debe mantener guardas en `phase3a.contract.test.js`.

2. Hacer el panel mas bonito pero menos rapido.

   Mitigacion: medir con Playwright/Lighthouse despues de implementar; no agregar assets pesados.

3. Esconder razones de bloqueo.

   Mitigacion: cada disabled necesita motivo visible o tooltip.

4. Mezclar portal cliente con panel operador.

   Mitigacion: cliente no confirmado puede aparecer como senal informativa, pero su flujo se corrige en portal, no en este panel.

5. Crear otro sistema de componentes paralelo.

   Mitigacion: reutilizar estilos existentes y evolucionar clases `frp-ops-v2` hacia `frp-ops-v3` de forma incremental.

## Criterios de aprobacion antes de codificar

No codificar runtime hasta que este documento y el mockup visual queden aceptados o corregidos.

Para aprobar el diseno, debe quedar claro:

- si el operador quiere barra superior compacta;
- si `Clientes bloqueados/no confirmados` debe entrar al panel trabajador o solo al portal/admin;
- si `Pagos` va antes o despues de `Atencion`;
- si `Costos FRP` sigue al final colapsado;
- si implementamos v3 como evolucion de `frp-ops-v2` o como nuevo bloque aislado temporal.

## Implementacion propuesta despues de aprobar

Estado: fase 1 aplicada en runtime. Ver `_sesion-24-operador-workbench-v3-runtime.md`.

Fase 1:

- solo layout HTML/CSS del panel trabajador;
- sin tocar endpoints;
- sin cambiar reglas de permisos;
- mantener tests existentes.

Fase 2:

- estados explicativos de bloqueo;
- mensajes de cuenta no confirmada si el dato esta disponible;
- pruebas contractuales nuevas.

Fase 3:

- validacion visual desktop/mobile con screenshot;
- auditoria de rendimiento CSS si se detecta lentitud.

## Siguiente paso unico

Revisar el mockup visual y decidir:

```text
Aprobado para implementacion fase 1
o
Corregir mockup antes de implementar
```
