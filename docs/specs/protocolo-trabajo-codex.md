# Protocolo de trabajo Codex - AriadGSM

## Regla principal

Codex no modifica codigo, tests, estilos ni documentacion sin pasar primero por revision y aprobacion de Bryam.

## Orden obligatorio

1. Revisar el codigo o archivo relacionado.
2. Explicar que existe hoy.
3. Separar hechos confirmados, inferencias, riesgos y supuestos debiles.
4. Proponer el cambio exacto.
5. Decir que archivos se tocarian.
6. Esperar aprobacion de Bryam.
7. Recien despues editar.
8. Probar.
9. Documentar resultado.

## Auditoria de impacto obligatoria

Antes de proponer un cambio, Codex debe comparar opciones:

- que pasa si se toca un solo archivo;
- que pasa si se toca el grupo completo;
- que riesgo tiene no tocar nada;
- que deuda queda si se hace el cambio minimo;
- cual opcion recomienda y por que.

## Cuando Bryam pregunta "probaste?"

Codex debe responder primero:

- que si fue probado;
- que no fue probado;
- como se probo;
- que falta validar;
- si hubo una suposicion no confirmada.

No se debe agregar una prueba nueva sin pedir permiso antes.

## Eliminaciones visuales o funcionales

Antes de quitar algo de la pantalla:

1. Ubicar que archivo lo crea.
2. Ubicar que funcion cumple.
3. Confirmar si es decorativo, funcional o pendiente.
4. Explicar que se rompe si se elimina.
5. Proponer quitarlo, ocultarlo, corregirlo o mantenerlo.
6. Esperar aprobacion.

## Cambios de flujo cliente-operador

Todo cambio que toque cliente, operador, pagos, ordenes, conexion o tecnico requiere:

- revision de backend;
- revision de frontend;
- prueba local;
- prueba documentada;
- validacion visual cuando aplique.

## Regla de seguridad

No saltar login, PIN, permisos, roles ni datos reales para probar mas rapido.

Si una prueba requiere admin autorizado, se documenta como pendiente y se valida con Bryam presente.

## Regla anti-parches

Si Codex detecta que una correccion puede ser un parche sin entender la causa, debe detenerse y decirlo antes de tocar archivos.

## Regla PostgreSQL runtime

Antes de tocar storage, sesiones, presencia, portal FRP o cualquier llamada a `writeDb(db)`, Codex debe leer `docs/specs/_sesion-20-postgres-runtime-p0-estabilizacion.md`.

Desde el cutover PostgreSQL, `storage/users.json` es snapshot historico pre-cutover. No se usa como fuente esperada para `postgres:read-check --strict`. La salud viva de Postgres se verifica sin `--input`.

## Regla de alcance por turno

Cada turno debe tener un siguiente paso unico y priorizado. Si aparecen varios problemas, primero se documentan y se elige uno.

## Excepcion permitida

Codex puede crear o actualizar este protocolo si Bryam lo pide explicitamente. Fuera de esa excepcion, tambien la documentacion requiere aprobacion previa.
