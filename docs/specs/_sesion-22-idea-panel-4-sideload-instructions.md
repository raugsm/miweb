# Idea - Panel 4: instrucciones de sideload antes de pegar codigos

Fecha: 2026-05-06
Estado: idea documentada para subir / no implementada
Area: Portal cliente, Panel 4 - Conexion, modal "Donde pegar estos codigos?"

## Contexto

El Panel 4 ya muestra:

- Technician ID.
- Codigo del proceso.
- Boton "Donde pegar estos codigos?".
- Boton "Descargar Redirector v2.5".

El modal actual explica donde pegar el Technician ID y el Codigo del proceso dentro del Redirector, pero no explica el paso previo: poner el Xiaomi en modo sideload/recovery/Connect with MiAssistant y conectar el equipo por USB.

## Problema observado

Hay clientes que llegan al Panel 4, ven los codigos, pero no necesariamente entienden que antes deben dejar el telefono en el modo correcto. Si el telefono no esta en sideload/recovery y conectado por USB, pegar los codigos en el Redirector no es suficiente.

Esto crea una brecha de UX: el boton promete resolver "donde pegar los codigos", pero el cliente necesita una mini-guia de "como preparar el telefono para que esos codigos sirvan".

## Fuentes tecnicas consultadas

- Android Developers documenta que ADB se usa para comunicarse con dispositivos Android y que la conexion USB depende del estado/disponibilidad del dispositivo y de la configuracion del host: https://developer.android.com/tools/adb
- AOSP documenta que el sideload en recovery usa transporte USB y que, al invocarse, recovery inicia una version limitada de `adbd` para recibir la conexion desde el host: https://source.android.com/docs/core/ota/nonab/device_code#sideloading-mechanism

No se debe copiar literalmente lenguaje tecnico de AOSP/ADB al cliente final. Sirve como respaldo para la decision de UX: el modo sideload/recovery es un prerequisito de conexion USB, no un detalle secundario.

## Decision propuesta

Convertir el modal "Donde pegar estos codigos?" en una guia corta de conexion, no solo en una captura del Redirector.

Nombre sugerido del modal:

> Conectar en modo sideload

Subtitulo sugerido:

> Primero pon el Xiaomi en modo sideload/recovery. Luego pega estos datos en el Redirector.

## Contenido funcional propuesto

El modal deberia tener 3 bloques:

### 1. Preparar el Xiaomi

Texto cliente:

1. Apaga el telefono.
2. Entra al menu Recovery / MiAssistant / Sideload segun el modelo.
3. No elijas "Wipe Data".
4. Conecta el telefono al PC con cable USB.

Nota UX:

- No prometer que todos los modelos tienen el mismo texto exacto.
- Usar una frase como: "En algunos Xiaomi aparece como Connect with MiAssistant".
- Mostrar advertencia visual leve: "No presiones Wipe Data".

### 2. Abrir Redirector

Texto cliente:

1. Abre USB Redirector Customer Module.
2. Espera a que cargue la ventana.
3. Si Windows pide permiso, permite la ejecucion del Redirector.

Nota UX:

- Mantener el boton "Descargar Redirector v2.5" visible fuera del modal.
- Dentro del modal puede haber un enlace secundario "Descargar de nuevo" solo si no ensucia el flujo.

### 3. Pegar datos y conectar

Texto cliente:

1. Pega el Technician ID en el primer campo.
2. Pega el Codigo del proceso en Additional information.
3. Presiona Connect.
4. Vuelve al portal y presiona "Equipo conectado".

Nota UX:

- Mantener la captura real actual del Redirector.
- Los badges "1 dato" y "2 dato" siguen siendo utiles.
- Agregar un badge o mini-step previo: "0 - telefono en sideload".

## Copy corto recomendado

Version compacta para modal:

1. Pon el Xiaomi en modo sideload/recovery.
2. Conectalo al PC por USB.
3. Abre el Redirector.
4. Pega Technician ID en el primer campo.
5. Pega Codigo del proceso en Additional information.
6. Presiona Connect y vuelve al portal.

Advertencia:

> No presiones Wipe Data. Si no ves la opcion sideload/MiAssistant, escribe por WhatsApp antes de continuar.

## Alcance de implementacion futura

Archivos probables:

- `public/portal.html`: contenido del dialog `wherePasteDialog`.
- `public/portal-styles/05-frp-flow.css`: layout del modal si necesita bloques nuevos.
- `public/portal-modules/events.js`: solo si cambia apertura/cierre del dialog; probablemente no hace falta.
- `docs/specs/cliente/panel-4-conexion.md`: actualizar version de spec cuando se implemente.

No deberia tocar:

- API de pagos.
- API de `notify-connected`.
- Logica de Postgres.
- Estado de orden.

## Criterios de aceptacion

1. El boton "Donde pegar estos codigos?" abre una guia que explica sideload/recovery antes del Redirector.
2. La guia mantiene visible la captura real del Redirector con los campos marcados.
3. La guia advierte no tocar "Wipe Data".
4. En mobile, el modal no queda largo de forma inutil: maximo 6 pasos cortos, sin parrafos extensos.
5. El cliente entiende que "Equipo conectado" se presiona despues de Connect en Redirector.
6. No se introducen endpoints nuevos.
7. No se modifica el flujo transaccional FRP/Postgres.

## Riesgos y controles

- Riesgo: instrucciones demasiado especificas para un modelo Xiaomi y falsas en otros modelos.
  - Control: usar nombres alternativos "Recovery / MiAssistant / Sideload" y mantener WhatsApp como fallback.
- Riesgo: el cliente presiona "Wipe Data".
  - Control: advertencia visible y breve.
- Riesgo: modal demasiado largo en celular.
  - Control: pasos cortos, secciones plegables solo si el contenido crece.
- Riesgo: confundir el sideload real de ADB con el flujo comercial del Redirector.
  - Control: usar lenguaje cliente "modo sideload/recovery" y no comandos ADB.

## Decision recomendada

Subir esta idea como mejora de UX de bajo riesgo, pero implementarla despues de cerrar los endpoints Postgres criticos restantes. No debe interrumpir el trabajo actual de estabilizacion del backend.

