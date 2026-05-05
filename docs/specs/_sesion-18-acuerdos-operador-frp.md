# Sesion 18 - Acuerdos recientes operador FRP

Estado: acuerdos vivos, pendientes de implementacion completa.
Fecha: 2026-05-05.

## Objetivo

Convertir el panel FRP Express del operador en una mesa de trabajo simple, rapida y alineada al flujo real:

cliente sube comprobante -> operador valida/rechaza -> cliente conecta -> tecnico toma/procesa -> tecnico finaliza -> cliente ve estado/recibo.

## Regla de trabajo

Estos acuerdos no autorizan cambios masivos por si solos. Antes de tocar codigo se aplica el protocolo:

1. Revisar codigo real.
2. Explicar que existe.
3. Separar hechos, inferencias, riesgos y supuestos.
4. Proponer cambio exacto.
5. Decir archivos afectados.
6. Esperar aprobacion de Bryam.
7. Editar, probar y documentar.

## Acuerdos de interfaz

- El panel debe sentirse Express: poco texto, acciones claras y lectura rapida.
- La gama visual debe acercarse al logo AriadGSM: azul, blanco, grises limpios y estados discretos.
- Evitar colores beige/marron como tema dominante.
- Evitar textos largos dentro de cards.
- Usar codigos cortos visibles tipo `ARD001` para lectura operativa.
- El codigo completo o trazabilidad interna no debe perderse; solo se acorta lo visible cuando sea seguro.
- La mesa debe priorizar lo que el operador puede resolver ahora.

## Estructura aprobada como direccion

La mesa operativa queda orientada a:

1. Estado actual del operador: libre, validando pago o procesando equipo.
2. Pagos por revisar.
3. Conexion lista, con boton `Tomar` por cada orden.
4. Finalizados hoy compacto.
5. Panel lateral/visor para revisar el comprobante seleccionado.

## Cosas que se consideran ruido o candidatas a salir

- Secciones permanentes de `Cola tecnica` y `Atencion` si duplican el flujo de `Conexion lista` o no aportan accion directa.
- Textos largos que explican lo obvio.
- Codigos largos repetidos en cada card si existe un codigo corto operativo.
- Controles de imagen/PDF visibles si no aportan al flujo final.

Ninguna eliminacion queda autorizada por este documento. Cada retiro debe pasar por protocolo de eliminacion.

## Flujo esperado de `Tomar siguiente`

`Tomar siguiente` debe tomar el trabajo mas prioritario que el operador puede resolver:

- Si hay pagos pendientes por validar, puede llevar al operador a validar el siguiente pago.
- Si no hay pagos pendientes y hay conexion lista, puede tomar el siguiente equipo listo.
- El backend debe seguir mandando la verdad: no se debe simular prioridad solo en frontend.

Este flujo aun requiere auditoria antes de implementarse.

## Conexion lista

La seccion `Conexion lista` debe mostrar ordenes/equipos ya listos para tecnico y debe incluir accion directa `Tomar`.

Debe respetar:

- tecnico activo;
- VIP o prioridad cuando se implemente;
- bloqueo si el tecnico ya tiene trabajo en proceso;
- backend como autoridad final.

## Finalizados hoy

Debe ser compacto, informativo y sin ruido:

- codigo corto;
- cliente;
- hora;
- inicial o identificacion del tecnico.

No debe competir visualmente con pagos o conexion lista.

## No tocar todavia

Hasta nueva aprobacion, estos bloques quedan fuera del alcance de implementacion visual:

- backend de tomar/finalizar;
- tecnico activo compartido;
- permisos;
- SSE;
- pricing;
- cliente;
- recibo PDF final;
- reglas de seguridad.

## Riesgos si se implementa todo junto

- Romper aprobar/rechazar pago.
- Romper tomar o finalizar.
- Romper permisos del tecnico activo.
- Perder trazabilidad si se reemplazan codigos largos sin estrategia.
- Crear una UI bonita pero desconectada del backend real.

## Siguiente paso recomendado

Implementar primero el visor de comprobantes del operador, porque es una pieza aislada y bloquea la validacion real de pagos.

