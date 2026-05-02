# AriadGSM — Decisiones consolidadas del rediseño del portal

Documento de referencia con todas las decisiones tomadas durante las sesiones de diseño. Refleja el modelo final acordado para implementación. Si algo no encaja con la visión real del negocio, este documento es el lugar para corregir antes de tirar código.

**Última actualización:** 02 May 2026 (sesión V3)
**Estado del proyecto:** rediseño en fase de spec, web ariadgsm.com publicada pero **no operativa** (sin clientes activos). Esto reduce el riesgo de cambios drásticos al diseño actual.

---

## Tabla de contenidos

1. [Estado del repositorio y trabajadores](#1-estado-del-repositorio-y-trabajadores)
2. [Modelo de pricing — 6 partes cerradas](#2-modelo-de-pricing--6-partes-cerradas)
3. [Sistema VIP + postpago + descuento por volumen](#3-sistema-vip--postpago--descuento-por-volumen)
4. [Paso 1 — Método de pago](#4-paso-1--método-de-pago)
5. [Paso 2 — Solicitud (cantidad + buscador inverso)](#5-paso-2--solicitud-cantidad--buscador-inverso)
6. [Paso 3 — Pago y comprobante (5 versiones país/método)](#6-paso-3--pago-y-comprobante-5-versiones-paísmétodo)
7. [Paso 4 — Conexión (Redirector + modal)](#7-paso-4--conexión-redirector--modal)
8. [Mis Órdenes — Layout D con 4 estados](#8-mis-órdenes--layout-d-con-4-estados)
9. [Comprobante de servicio compacto](#9-comprobante-de-servicio-compacto)
10. [Sistema de notificaciones — versión mínima](#10-sistema-de-notificaciones--versión-mínima)
11. [Panel de operadores (Bryam/Jack/Angelo)](#11-panel-de-operadores-bryamjackangelo)
12. [Sistema antifraude — 4 capas](#12-sistema-antifraude--4-capas)
13. [Branding y logos](#13-branding-y-logos)
14. [Cola de PRs actualizada](#14-cola-de-prs-actualizada)
15. [Decisiones pequeñas pero importantes](#15-decisiones-pequeñas-pero-importantes)
16. [Lo que aún queda por diseñar](#16-lo-que-aún-queda-por-diseñar)

---

## 1. Estado del repositorio y trabajadores

**Rama activa:** `feat-step4-redesign` (no mergeada a main, no pusheada)

**Commits hechos:**

| Commit | Hash corto | Descripción |
|---|---|---|
| 0a | `b1d064e` | Sistema responsive Tailwind + container queries + refactor flex |
| 0b | `a28b2db` | Rediseño paso 4 + panel técnico + cleanup visual |
| 0c | `973312e` | Actualización package.json y README |
| 1 | `296742d` | Flow state derivado + bloqueo opción A |
| 2 | `e06abb9` | Botón "Equipo conectado" + lane "Cliente conectado" en panel |

**Pendiente del usuario:** probar commits 1+2 en local con la mini-checklist.

**Trabajadores del negocio:**
- **Bryam** — owner, marca VIPs, cierra día, decisiones operativas
- **Jack** — técnico principal, hace la mayoría de los FRPs del día
- **Angelo** — técnico apoyo, activo cuando Jack come (default off)

**Volumen actual:** 130+ órdenes/día. Margen: 0.5-1.5 USDT regulares, 0.5-1.0 USDT VIPs.

---

## 2. Modelo de pricing — 6 partes cerradas

### Parte 1 — Servicio único

Solo Xiaomi FRP Express (Redmi, Poco, Mi, Black Shark, todos al mismo precio). Cliente experto solo escribe "Redmi". Cliente novato bajo volumen.

### Parte 2 — Día con ritmo

Patrón aproximado, manejado manualmente por los trabajadores:
- 9 AM: solo herramientas caras online
- 11 AM: reinicio de servidores, se activan las baratas
- 3-4-6 PM: las baratas se agotan, hay que rotar
- Noche: precios suben

No hay lógica horaria automática. El sistema solo refleja lo que los operadores actualizan.

### Parte 3 — Cobro por servicio único

Todos los Xiaomi cuestan lo mismo. El modelo específico es información secundaria.

### Parte 4 — Lock del precio + SSE en lugar de polling

El precio se "ancla" al subir el primer comprobante (paso 3).

**CORRECCIÓN CLAVE de la sesión:** SSE (Server-Sent Events) en lugar de polling 30s. Apenas Jack/Angelo cambian precio, los 3 pasos se actualizan en <1 segundo.

- SSE ya implementado en `/api/portal/orders/events` para órdenes
- Extender para precios en el PR de pricing dinámico
- Indicadores visuales:
  - Verde sutil 2s cuando el precio baja
  - Naranja 3s + mini-aviso cuando sube
- Paso 1 es fuente, pasos 2/3 derivan

### Parte 5 — Asimetría

| Caso | Comportamiento |
|---|---|
| Precio BAJA después del lock | Silencio. Cliente paga el precio anclado. La diferencia es ganancia adicional. |
| Precio SUBE después del lock | Notificación al cliente con 3 opciones |

**Tres opciones cuando sube:**
1. **Subir comprobante adicional** por la diferencia (máximo 2 comprobantes/orden)
2. **Esperar 1 hora** con SSE auto-cancel si baja
3. **Cancelar** y reembolso manual

**Reglas:**
- Sin umbral mínimo de variación (cualquier subida se cobra, margen es chico)
- Sin lógica horaria automática
- Reembolso manual con copy honesto: "usualmente en menos de 1 hora en horario activo"

### Parte 6 — Avisos de inactividad (Categoría B en notificaciones)

| Aviso | Cuándo |
|---|---|
| "¿Necesitás ayuda subiendo tu comprobante?" | 3 min sin acción en paso 3 |
| "¿Tu equipo está listo? Apretá 'Equipo conectado' cuando esté" | 3 min sin acción en paso 4 |

Sutiles, no bloquean, una vez por sesión. Aparecen como banner amarillo dentro del paso correspondiente con link a WhatsApp.

**ELIMINADOS:** los avisos de espera ("Tu comprobante está siendo revisado", "Tu equipo está siendo procesado") porque contradicen la marca "Express".

---

## 3. Sistema VIP + postpago + descuento por volumen

### Two-tier system

- **Regular:** default. Pago upfront. Margen 1.1-1.5 USDT escalonado por cantidad.
- **VIP:** asignación manual. Postpago al cierre operacional manual ~8-9 PM. Margen 0.5-1.0 USDT fijo.

### Reglas VIP

- **Asignación basada en antigüedad + capacidad de procesamiento**, con excepciones para newcomers de alto volumen
- **Máximo ~50 VIPs** activos
- **VIP NO acumula descuento por volumen** (ya tiene precio preferencial)
- **Cierre operacional MANUAL** — botón "Cerrar día" presionado por Bryam/Jack ~8-9 PM (NO cron automático)
- **Bloqueo automático día siguiente** si el VIP no pagó la deuda del día anterior
- **Notificación in-portal al VIP** cuando entra al día siguiente con deuda
- **Default rate ~2%** (riesgo aceptado)
- **Bryam, Jack y Angelo** pueden marcar/desmarcar VIPs

### Tabla de descuento por volumen — Regulares

| Cantidad | Margen/unidad | Diferencia |
|---|---|---|
| 1 | 1.5 USDT | Precio normal |
| 2-3 | 1.4 USDT | -0.10 |
| 4-6 | 1.3 USDT | -0.20 |
| 7-10 | 1.2 USDT | -0.30 |
| 11+ | 1.1 USDT (piso) | -0.40 |

**Restricción crítica:** el piso de 1.1 USDT siempre queda 0.1 por encima del VIP (1.0). El descuento por volumen NUNCA puede igualar o pasar el precio VIP.

---

## 4. Paso 1 — Método de pago

### Estructura final

- Label: "Método de pago"
- 5 pills horizontales con banderas SVG inline (no emoji):
  - Colombia
  - México
  - Chile
  - Perú
  - USDT (círculo verde Tether `#26A17B` con ₮ blanco)
- Pill seleccionada: borde `#1D4ED8` + fondo `#E6F1FB`
- **Default seleccionado = país del registro del usuario**

### Card de monto (Estimado)

- Label "Estimado en vivo" + dot verde pulsante (animación `liveRing` 1.8s)
- Monto principal: ej. `$489 MXN`
- Conversión de referencia: ej. `≈ 25 USDT` con logo Tether chico

### Comportamiento

- El precio del paso 1 es siempre vivo, sin lock
- SSE conectado al backend (extender el existente `/api/portal/orders/events`)
- Al cambiar de pill se recalcula con la conversión correspondiente

---

## 5. Paso 2 — Solicitud (cantidad + buscador inverso)

### Versión radical-simple (cerrada tras 7 iteraciones)

- **Insignia "98% modelos soportados"** arriba derecha (verde claro `#EAF3DE`)
- **Card cantidad/total horizontal:**
  - Control −/3/+ + "S/. 16 c/u"
  - Total grande "S/. 48"
  - Tether logo + "≈ 12 USDT"
- **Buscador "¿Tu modelo aplica?"** con LÓGICA INVERTIDA:
  - Solo verifica modelos NO soportados
  - Si modelo aparece en lista de no-soportados → warning
  - Si no aparece → asume soportado (porque 98% lo está)

### Eliminado del diseño anterior

- Pills de marca (Xiaomi/Samsung/Otra)
- Sección "Especificar modelos"
- Catálogo completo de modelos
- Botón "Crear solicitud"

### Razón de la simplificación

98% modelos soportados + cliente experto no detalla + cliente novato bajo volumen = no hace falta complejidad.

---

## 6. Paso 3 — Pago y comprobante (5 versiones país/método)

### Estructura común a todas las versiones

- Card monto destacado top + "≈ X USDT" con Tether logo (jerarquía invertida cuando cliente eligió USDT)
- Header con icono método + nombre
- Card datos de pago + botón "Copiar" por campo
- Banner amarillo "Revisá los pasos 1 y 2 antes de subir"
- Dropzone con `accept="image/*,application/pdf"` SIN `capture`

### Datos reales por país

#### Perú — 2 cuentas Yape

```
Cuenta 1: 993 357 553 — Bryams Zuñiga
Cuenta 2: 982 380 794 — Peregrina Sha
```

Ambas visibles juntas, cliente elige. Forma A.

#### México — STP

```
Tarjeta CLABE: 7229 6906 9374 9504 08 (18 dígitos)
Beneficiario: Javier Cruz Franco
```

#### Colombia — Bancolombia Ahorros

```
Cuenta: 001 0000 2771
Beneficiario: Kendy Salazar
```

#### Chile — Mercado Pago Cuenta Vista

```
Beneficiario: Emanuel Iván Alarcón Gómez
RUT: 17.904.016-6
Cuenta: 1042449240
Email: melxcore01@gmail.com
```

#### Binance Pay (no TRC20)

```
Pay ID: 564181591
Beneficiario: Ariadgsm
```

**CAMBIO DE DECISIÓN:** de wallet TRC20 a Binance Pay. Razones:
- Sin riesgo de red equivocada
- Sin gas fees
- Instantáneo entre Binance users
- Botón "Ver QR para escanear desde Binance" colapsable

#### PayPal NO está en el portal

20% de comisión rompe la coherencia del live pricing. No vale la pena.

### Iconos de métodos

Aproximaciones SVG inline en mockups, **logos oficiales descargados en producción**:

| Método | Color base | Fuente oficial |
|---|---|---|
| Yape | `#722F92` morado | brandfetch.com/yape.com.pe |
| STP | `#003E80` azul | stp.com.mx |
| Bancolombia | `#FCD116` amarillo + `#CE1126` rojo | Wikipedia Commons |
| Mercado Pago | `#00B1EA` celeste | simpleicons.org |
| Binance Pay | `#F0B90B` amarillo | simpleicons.org |
| Tether | `#26A17B` verde | (no método, solo conversión USDT) |

**Restricción técnica:** las cuentas son editables desde el panel del operador (NO hardcoded).

---

## 7. Paso 4 — Conexión (Redirector + modal)

### Versión final radical-simple (cerrada con screenshot real del usuario)

**El software es:** USB Redirector Technician Edition - Customer Module v2.5.0.3540

### Estructura del paso

1. Banner verde "Pago confirmado. Tu orden está activa."
2. Botón azul grande **"Descargar Redirector v2.5"** + "Archivo firmado · No requiere instalación · 4.2 MB"
3. Card "Datos para el Redirector":
   - **Technician ID:** `1000 9983 5478` (12 dígitos en grupos de 4) + Copiar
   - **Código del proceso:** `47892-5` (orden + cantidad equipos) + Copiar
4. **Botón discreto "¿Dónde pegar estos códigos?"** (borde dasheado, abre modal)
5. Botón verde grande **"Equipo conectado"**
6. Link al pie: "¿Necesitás más ayuda? Contactá por WhatsApp"

### Modal "¿Dónde pegar estos códigos?"

Replicación fiel del USB Redirector Technician Edition:
- Header: "USB Redirector Technician Edition - Customer Module"
- Heading: "Connect With Technician"
- Logo verde con paneles a la derecha
- Campo 1: "Technician ID:" con flecha azul "1° dato"
- Campo 2: "Additional information (e.g. your name, e-mail or order number):" con flecha verde "2° dato"
- Texto info: "ⓘ This information will help the technician identify you as a customer"
- Footer: "Version: 2.5.0.3540" + botones "Connect" / "Cancel"
- 3 pasos numerados al pie del modal:
  1. Pegá el **Technician ID** en el primer campo (azul)
  2. Pegá el **Código del proceso** en el segundo campo (verde)
  3. Apretá **Connect** y volvé al portal

**En producción:** screenshot real del usuario (PNG) + flechas en CSS absolute. NO la recreación SVG actual.

### Decisiones técnicas

- Redirector NO se instala, se ejecuta (portable .exe con firma digital, sin warnings Windows Defender)
- Cliente conecta en **modo Sideload**
- Code DDNS = Technician ID (mismo concepto, distinto nombre)
- Una sola versión actual del Redirector para todo
- **Asignación de técnico:** default Jack, Angelo solo cuando Jack está en break (decidido en panel operador, NO por cliente)
- Manual de sideload: pendiente, el usuario lo arma

### Sobre Additional Information del Redirector

- Formato: `código de pedido + cantidad de equipos` (ej. `47892-5`)
- **Fijo durante toda la orden, NO cambia por equipo**
- Dos campos separados con sus respectivos botones Copiar (Forma A)

### ELIMINADO del paso 4 anterior

- Lista de instrucciones sideload (4 pasos)
- Badge "Técnico asignado: Jack" (info interna no expuesta)
- Formato "JACK-7842" (incorrecto, era inventado)
- Imagen del Redirector siempre visible en el paso (saturaba)

---

## 8. Mis Órdenes — Layout D con 6 estados

> **Refinado tras testing PR-0.5** (2026-05-02): pasó de 4 a 6 estados. Los nuevos 1-3 cubren la fase pre-procesamiento (revisión de pago, rechazo, esperando conexión); los antiguos 1-4 se renumeraron como 4-6 (procesamiento + completado + fallo parcial).

### Layout D elegido

Lista vertical compacta estilo Linear/Notion. Razones:
- Escala bien con muchos equipos (10-20+)
- Patrón estándar moderno
- Mantiene claridad sin gastar espacio vertical
- Dot pulsante azul comunica "en vivo"

### Separación arquitectural

- **Paso 4** = onboarding técnico, una sola vez después de pagar (visible solo cuando publicStatus ∈ {EN_PREPARACION, LISTO_PARA_CONEXION, EN_PROCESO})
- **Mis Órdenes** = flujo activo, control equipo-por-equipo solo para órdenes con 2+ equipos
- Cliente puede irse del portal y volver, Mis Órdenes lo espera
- Backend ya soporta esto

### 6 estados — fase pre-procesamiento (1-3) y procesamiento (4-6)

#### Estado 1 — Pago en revisión

- **Color pill:** amarillo `#fff8ea` con dot pulsante naranja
- **Trigger:** cliente subió comprobante, técnico todavía no validó (`publicStatus = PAGO_EN_REVISION`)
- **Banner amarillo:** "Validando comprobante. Te avisaremos en cuanto el técnico apruebe el pago."
- **Acción primaria:** Ver detalles (default — no hay acción del cliente, solo esperar)

#### Estado 2 — Pago rechazado

- **Color pill:** rojo `#fee2e2`
- **Trigger:** técnico rechazó el comprobante con motivo (`publicStatus = PAGO_RECHAZADO`, `frpOrder.paymentRejectedReason` poblado)
- **Banner rojo:** "Tu pago fue rechazado. Motivo: [motivo específico del técnico]. Subí un nuevo comprobante."
- **Acción primaria:** botón "Subir nuevo comprobante" → scroll a paso 3 + abre file picker
- **Pasos 1-3 quedan locked** (mismo monto, ítems, método de pago — solo cambia el comprobante)
- **Paso 3 dropzone:** vuelve a aparecer con banner rojo del motivo arriba

#### Estado 3 — Esperando conexión

- **Color pill:** azul claro `#dbeafe`
- **Trigger:** técnico aprobó pago, cliente todavía no apretó "Equipo conectado" (`publicStatus = EN_PREPARACION` AND `customerConnectedAt` vacío)
- **Banner verde:** "Pago confirmado por nuestro técnico."
- **Banner azul:** "Conectá tu equipo para continuar. Andá al paso 4, descargá el Redirector y apretá *Equipo conectado*."
- **Acción primaria:** botón "Ir al paso 4" → scroll a paso 4
- **Paso 4 aparece visible** en este estado por primera vez

#### Estado 4 — En proceso

- Procesamiento equipo-por-equipo, similar a los antiguos "A mitad de camino" + "Cerca del final"
- Progreso visible (X procesados, Y en proceso, Z en cola)
- Habilitación automática del siguiente equipo cuando técnico marca anterior completado

#### Estado 5 — Completado total (todos los equipos)

- Banner verde "Sin errores · 18 min total"
- Botón "Descargar comprobante de servicio" + "Crear nueva orden"
- Tiempos individuales por equipo (3 min, 4 min, etc.)

#### Estado 6 — Con fallo parcial

- Equipo X en rojo "Modelo no soportado por la herramienta actual. Te contactaremos por WhatsApp"
- Botón outline rojo "Solicitar reembolso"
- Los demás equipos continúan procesando
- Banner amarillo si la orden terminó con 1+ fallos

### Reglas

- **Habilitación siguiente equipo:** AUTOMÁTICA cuando técnico marca anterior completado
- **Un solo Technician ID** para toda la sesión (no requiere reingresar)
- **Mensaje de fallo:** ESPECÍFICO ("Modelo no soportado por la herramienta actual"), no genérico
- **Si un equipo falla**, el sistema NO se detiene, sigue con los demás
- **Banner amarillo** si orden terminó con 1+ fallos (vs verde 100% éxito)
- **Acción al completar:** botón "Crear nueva orden" (volver al paso 1)
- **Re-upload de comprobante en estado 2:** el endpoint existente `PATCH /api/portal/orders/:id/payment-proof` recibe el nuevo comprobante. Backend resetea `frpOrder.paymentStatus = PAGO_EN_VALIDACION` y la orden vuelve a estado 1.

### Implementación PR-0.6

Estados 1-3 ya implementados (PR-0.6, commit a continuación). Estados 4-6 quedan como rendering genérico hasta PR-5 (Layout D completo).

---

## 9. Comprobante de servicio compacto

### Versión final (después de iteración)

**Formato:** vertical estilo ticket Stripe/Apple Wallet, 320px ancho.

### Estructura

1. **Header chico:** logo cuadrado azul "A" + "AriadGSM" + número orden #47892 (font-mono)
2. **Badge verde "PAGADO"** centrado
3. **Total dominante:** "S/. 80.00" en 36px + "≈ 20 USDT" debajo
4. **Línea dasheada** separadora (estilo ticket)
5. **Una línea:** "5 × Xiaomi FRP Express"
6. **Mini-card gris** con 4 datos: Cliente, Fecha, Método, Técnico
7. **QR 48x48** + texto "Verifica autenticidad" + URL `ariadgsm.com/v/47892`
8. **SHA-256 hash** truncado al pie: `a3f7b2c91d···e8f4`

### Implicaciones técnicas para el PR

- **Library de generación PDF:** PDFKit o Puppeteer en Node.js
- **Library de QR:** `qrcode` npm package
- **Endpoint público:** `GET /v/:orderId` que devuelve la versión web del comprobante
- **Hash SHA-256** con `crypto` nativo de Node al finalizar orden
- **PDF generado on-demand** cada vez que cliente lo descarga (no cache)

### Por qué este formato

- Suficientemente profesional para que clientes que revenden lo muestren a sus clientes finales
- Anti-fraude: cliente no puede editar el PDF y cambiar monto (al escanear QR aparece el monto real)
- Hash SHA-256 = "firma digital moderna" sin necesidad de blockchain
- Equivalente al patrón de certificados COVID y certificados académicos modernos

---

## 10. Sistema de notificaciones — versión mínima

### Principio rector

**No notificar lo que ya está visible en seguimiento.** Esto es diseño UX correcto al primer intento — confirmado por industry research (Smashing Magazine, LogRocket, MagicBell).

### Aclaración crítica: toast vs banner inline (refinamiento PR-0.6)

> Esta distinción **no estaba en la sesión V3 original** y se introdujo tras testing del PR-0.5. Aplica a los descartes "Comprobante en revisión" y "Equipo siendo procesado": eliminados como **toasts**, pero el equivalente como **banner inline dentro del paso** sí va.

| Tipo | Qué es | Reglas |
|---|---|---|
| **Toast (Categoría A)** | Notificación flotante, esquina superior derecha. Interrumpe la atención. | Solo 2 eventos críticos (ver tabla más abajo). El resto eliminado. |
| **Banner contextual de inactividad (Categoría B)** | Banner dentro del paso después de N segundos sin acción. | Solo 2 avisos (paso 3 y paso 4). |
| **Banner inline de estado del paso (NUEVO Categoría C)** | Banner que **reemplaza o acompaña** el contenido del paso para reflejar el estado actual de la orden. **No es notificación** — es contenido del paso. | Permitido aunque la marca sea "Express", porque comunica estado, no espera. |

**Ejemplo concreto Categoría C:** cuando el cliente sube comprobante (paso 3), el dropzone desaparece y se reemplaza por un banner azul "Comprobante recibido. Lo estamos validando en breve. No cierres el portal." con dot pulsante. **No es notificación de espera** — es el nuevo estado visible del paso 3, sin el cual el paso quedaría vacío. Lo mismo vale para el banner rojo de rechazo arriba del dropzone reactivado.

### Categoría A — Notificaciones tipo toast (solo 2 eventos)

| # | Evento | Trigger | Severidad | Acción |
|---|---|---|---|---|
| 1 | **Cambio de precio** (subió) | SSE detectó subida después del lock | Atención (amarillo) | Botón "Ver opciones" |
| 2 | **VIP con deuda** al volver al día siguiente | Cliente VIP entra y debe del día anterior | Bloqueante (rojo) | Botón "Pagar ahora" |

**Características:**
- Esquina superior derecha
- Border-left 3px del color del evento (amarillo/rojo)
- Icono + título 13px + mensaje 12px + botón CTA
- Botón × para cerrar
- **No auto-dismiss para los críticos** (bloquean acción)

### Categoría B — Avisos contextuales de inactividad (solo 2)

| # | Aviso | Cuándo |
|---|---|---|
| 1 | "¿Necesitás ayuda subiendo tu comprobante?" | 3 min de inactividad en paso 3 |
| 2 | "¿Tu equipo está listo? Apretá 'Equipo conectado' cuando esté" | 3 min de inactividad en paso 4 |

**Características:**
- Banner amarillo claro `#FEF3C7` con border-left amarillo `#D97706`
- Dentro del paso correspondiente (no flotante)
- Aparecen una vez por sesión a los 3 min
- Si el cliente acciona, desaparecen
- Link sutil a WhatsApp si necesita más ayuda

### Categoría C — Banners inline de estado del paso (PR-0.6)

Reflejan estado actual de la orden, no son "avisos de espera" estilo notificación.

| # | Banner | Dónde | Cuándo |
|---|---|---|---|
| 1 | Azul "Comprobante recibido. Lo estamos validando en breve..." con dot pulsante | Paso 3 (reemplaza al dropzone) | `publicStatus = PAGO_EN_REVISION` |
| 2 | Rojo "Tu pago fue rechazado. Motivo: [X]. Subí un nuevo comprobante." | Paso 3 (arriba del dropzone reactivado) | `publicStatus = PAGO_RECHAZADO` |

Equivalentes en Mis Órdenes (sección 8 estados 1, 2, 3) cubren la misma información dentro del listado.

### Eventos descartados (como toast — sin Categoría C inline)

| Evento | Razón |
|---|---|
| Pago confirmado (toast) | Ya visible en banner verde paso 4 + estado 3 Mis Órdenes |
| Orden completada (toast) | Ya visible en Mis Órdenes |
| Equipo procesado (toast) | Ya visible en Layout D |
| Equipo fallido (toast) | Ya visible en Layout D rojo |
| Cambio de técnico (toast) | No es relevante para el cliente |

### Mecanismo: solo SSE in-portal

**No email** (casi nadie usa Gmail en su segmento), **no WhatsApp automático**, **no browser push**. Si el cliente cerró el portal, se entera al volver. Tradeoff aceptado conscientemente por la simplicidad.

---

## 11. Panel de operadores (Bryam/Jack/Angelo)

### Decisión arquitectónica

**Camino A — Reemplazo total del dashboard "Xiaomi FRP EXPRES" actual.** Riesgo bajo porque la web no está operativa todavía (sin clientes activos).

### Workflow real de los técnicos

- **Jack y Angelo trabajan a la vez** procesando equipos (ambos en paralelo)
- **El Technician ID es por horarios:** solo uno está "de turno" para entregar el código de conexión nuevo
- **Default:** Jack (es el principal, hace la mayoría)
- **Angelo activo solo cuando Jack come** (~1 hora del día, no todo el día)
- **Cambio: manual** apretado por Jack/Angelo cuando salen/vuelven

### Acciones más frecuentes

1. **Validar comprobantes pendientes** (paso 3 cliente subió, falta aprobar)
2. **Procesar equipos conectados** (paso 4 cliente apretó, falta procesar)

Las otras (VIPs, cierre día, históricos) son menos frecuentes.

### Plataforma

**Desktop/laptop la mayoría del tiempo.** No mobile-first, layouts más complejos OK.

### Dashboard principal — Layout

**Header:**
- Logo AriadGSM + etiqueta "Operador"
- Badge verde "Turno activo: Jack" con dot pulsante + horario desde
- Botón "Pasar turno a Angelo" (manual)
- Notificaciones internas + avatar del logueado

**Sidebar (180px):**
- Inbox (vista actual con badge total)
- VIPs (Bryam mete las marcas, ~42 VIPs activos)
- Histórico (auditoría de órdenes pasadas)
- Cerrar día (acción crítica de Bryam o Jack ~8-9 PM)

**Main content — 2 columnas:**

#### Izquierda — Comprobantes a validar

- Cards compactos con avatar inicial del cliente + bandera del país
- Tiempo desde que subió + monto + cantidad de equipos
- Botones "Ver comprobante" + "Tomar"
- Estado "Tomado por Angelo" cuando otro técnico ya agarró (gris)
- Tiempo en rojo si pasaron >5 min (alerta visual)

#### Derecha — Equipos a procesar

- Cards similares con número de orden destacado
- Indica qué equipo de la orden (Equipo 3 de 5) y modelo si declarado
- Botón "Tomar y procesar" verde
- Estado "Procesando..." cuando alguien ya está en eso

### Sistema "Tomar"

Cuando un técnico apreta "Tomar", el item se bloquea para los demás. Si Jack toma un comprobante, Angelo lo ve en gris con "Tomado por Jack". Evita validación duplicada.

### Turno vs logueado

- **Logueado: Jack** (quién está en el panel)
- **Turno activo: Jack** (quién recibe los Technician IDs nuevos)
- **Pueden ser distintos** (Jack puede estar logueado pero pasar el turno a Angelo)

### Modal de validar comprobante

**Header:**
- Avatar + nombre del cliente + número de orden + tiempo
- Botón cerrar

**Lado izquierdo (fondo oscuro):**
- Vista del comprobante con sombra (efecto "documento real")
- Botones zoom +/− en esquina superior derecha
- Para producción: imagen real subida por el cliente

**Lado derecho (sidebar de contexto):**
- **Card "Verificación automática"** (sistema antifraude — sección 12)
- **Card "Lo esperado"** con monto, método, cantidad, cuenta destino, si es VIP
- ✓ verde al lado de cada dato que coincide
- Banner verde "Coincide con lo esperado" o amarillo si hay alertas
- **Botón "Aprobar pago"** verde (acción primaria)
- **Botón "Rechazar"** colapsable con 5 motivos predefinidos:
  - Monto no coincide
  - Comprobante ilegible
  - Cuenta destino incorrecta
  - Comprobante de otra fecha
  - Otro motivo (texto libre)

### Comportamiento al aprobar/rechazar

**Aprobar:**
1. Modal se cierra
2. Orden pasa al paso 4 del cliente (recibe Technician ID + código)
3. Toast verde en portal cliente: "Pago confirmado"
4. Card desaparece de la cola

**Rechazar:**
1. Confirmar motivo
2. Orden vuelve al paso 3 del cliente
3. Cliente ve banner: "Tu pago fue rechazado. Motivo: X. Subí un nuevo comprobante."
4. Card desaparece de la cola

---

## 12. Sistema antifraude — 4 capas

### Decisión: implementar las 4 capas en el primer PR

Es el módulo de mayor ROI del rediseño. Si bloquea 5 fraudes/mes ($25-50 USD), paga su implementación en <6 meses.

### Capa 1 — Hash perceptual (anti-duplicados)

- Al subir comprobante, calcular pHash de la imagen
- Comparar con TODOS los comprobantes anteriores en BD
- Match >90% similitud → flag automático "POSIBLE DUPLICADO"
- El técnico ve el comprobante original al lado para comparar
- Detecta duplicados aunque el cliente recorte/gire/cambie formato

**Implementación:** librería `image-hash` o `phash` en npm. Costo: milisegundos.

### Capa 2 — OCR + validación cruzada

- Pasa el comprobante por **Google Vision API** (decisión final)
- Extrae automáticamente: monto, fecha, hora, destinatario, número de operación
- Compara con lo esperado:
  - Monto debe ser exactamente el de la orden
  - Fecha debe ser de hoy
  - Destinatario debe ser uno de los nombres válidos (Bryams Zuñiga / Peregrina Sha en Yape, etc.)
  - Hora debe ser reciente

**Costo Google Vision API:** ~$1.50 USD por 1000 imágenes. Para 130 órdenes/día = ~$6/mes.

**Por qué Google Vision y no Tesseract:**
- Más preciso
- Costo bajo
- Tesseract local funciona OK pero falla con fuentes raras o screenshots de baja resolución

### Capa 3 — Análisis de metadata EXIF

- Lee el EXIF del archivo subido
- Si tag "Software" dice "Adobe Photoshop", "GIMP", "Pixlr" → flag "POSIBLE EDICIÓN"
- Si dimensiones no son típicas de captura móvil → flag adicional

**Implementación:** librería `exifr` en npm. Gratis.

**Limitación:** la más fácil de bypassear (clientes técnicos saben sacar metadata). Por eso es complementaria, no principal.

### Capa 4 — Comportamiento del cliente

- Cliente nuevo (sin historial) + monto alto → flag "Cliente nuevo, alto monto"
- Cliente con rechazos previos por fraude → flag "Cliente con histórico"
- Cliente sube 3+ comprobantes en 5 min → flag "Múltiples intentos"

**Implementación:** lógica en BD. Trackear intentos por user_id.

### Cómo se ve en el modal

**Card "Verificación automática"** en lado derecho del modal de validar comprobante:

- Banner top: "Verificación automática: 4/4 ✓ Sin alertas. Listo para aprobar."
  - O: "3/4 ⚠ 1 alerta detectada"
  - O: "2/4 ❌ 2 alertas críticas"
- Lista de las 4 verificaciones con ✓/⚠/❌:
  1. **Único** — no coincide con anteriores
  2. **Datos coinciden** — OCR validó monto/fecha/destinatario
  3. **Sin edición detectada** — metadata limpia
  4. **Cliente con historial limpio** — comportamiento normal

Cuando hay alertas, cada item se pone amarillo o rojo con explicación específica.

### Casos de fraude bloqueados

| Caso | Capa que lo detecta |
|---|---|
| Cliente reusa el mismo voucher para 2 órdenes | Capa 1 (hash) → bloqueo automático |
| Cliente edita monto en Photoshop | Capa 2 (OCR) + Capa 3 (metadata) |
| Cliente sube voucher de hace 3 días | Capa 2 (OCR detecta fecha) |
| Cliente sube voucher de pago a otra persona | Capa 2 (OCR detecta destinatario) |
| Cliente envía voucher recortado para evitar match | Capa 1 (hash perceptual igual lo detecta) |
| Cliente con historial de fraude vuelve | Capa 4 (comportamiento) |

### Bloqueo automático

Si Capa 1 está 99% segura que es duplicado, el comprobante NO llega a la cola del técnico. Se rechaza automáticamente y el cliente ve mensaje claro.

### Costo total operativo

- Google Vision API: ~$6-10 USD/mes
- pHash, exifr, behavior: gratis
- **Total: ~$6-10 USD/mes**

### Tiempo de implementación

1.5-2 semanas en el PR. Trabajo significativo pero bien encapsulado.

### False positives a tener en cuenta

- Cliente que sacó screenshot de pantalla puede tener metadata "Screenshot" — eso NO es flag
- Hash perceptual puede dar false match si dos clientes pagan exactamente lo mismo a la misma cuenta a la misma hora — el hash se complementa con número de operación

---

## 13. Branding y logos

**Logo y favicons:** generados en pack descargable (`ariadgsm-logo-pack.zip`).

**Aplicación al portal:** pospuesta hasta validar el flujo completo del rediseño.

**Assets disponibles:**
- `ariadgsm-symbol.svg` (símbolo solo)
- `ariadgsm-lockup.svg` (símbolo + texto)
- `ariadgsm-lockup-dark.svg` (versión dark)
- `ariadgsm-avatar.svg` (avatar redondeado)
- `og-image-preview.png` (Open Graph image)

---

## 14. Cola de PRs actualizada

| Orden | PR | Tamaño | Estado |
|---|---|---|---|
| 1 | Probar commits 1+2 en local con mini-checklist | Test manual | Pendiente del usuario |
| 2 | **Sistema completo:** pricing dinámico + VIP + postpago + descuento volumen + notificaciones in-portal + antifraude 4 capas + Google Vision API + comprobante PDF con QR + SHA-256 + endpoint /v/:orderId | XL (4-6 semanas) | Próximo, requiere spec técnico |
| 3 | Logos oficiales descargados (Yape, STP, Bancolombia, Mercado Pago, Binance) | S | Después del PR principal |
| 4 | Flujo híbrido + mobile UX upload + paso 4 con modal Redirector + screenshots reales | M | Después del PR principal |
| 5 | SSE para operadores + cancelación + sistema "Tomar" | M | Después del híbrido |
| 6 | Logo + favicons aplicados al portal | S | Cuando esté seguro |

**Nota crítica:** el PR principal (orden 2) es muy grande. Probablemente vale dividirlo en 3 sub-PRs:
- PR-2a: Pricing dinámico + VIP + descuento volumen
- PR-2b: Antifraude 4 capas + Google Vision API
- PR-2c: Notificaciones in-portal + comprobante PDF + endpoint público

---

## 15. Decisiones pequeñas pero importantes

### Generales

- **Sin botón "Crear solicitud"** en ningún paso. La orden se crea automáticamente al subir comprobante.
- **Sin botón "Voy a pagar ahora"** para congelar precio antes del comprobante.
- **Sin umbral mínimo de variación de precio** (margen es chico, defendiste tu posición).
- **Botón "Equipo conectado"** reemplaza al viejo "Estoy listo para conectar".
- **Devolución manual con copy honesto** ("usualmente en menos de 1 hora en horario activo") en vez de prometer 24/7.
- **Catálogo de modelos NO se construye.** Se cobra por servicio único, lógica invertida del buscador alcanza.
- **Redirector + DDNS automáticos desde el portal** reemplazan el bloque de WhatsApp manual.

### De esta sesión (V3)

- **SSE en lugar de polling 30s** para precio en vivo (latencia <1s vs 30s).
- **Binance Pay en lugar de TRC20** (sin riesgo de red, sin gas fees).
- **PayPal NO en el portal** (20% comisión rompe coherencia).
- **Dos campos en paso 4** (Technician ID + Código del proceso) en lugar de uno.
- **Modal del Redirector con screenshot real** en lugar de imagen siempre visible.
- **Reemplazo total del dashboard "Xiaomi FRP EXPRES"** (web no operativa = riesgo bajo).
- **Cualquier operador (Bryam/Jack/Angelo) puede marcar VIP** (no solo Bryam).
- **Cierre operacional MANUAL** botón ~8-9 PM (no cron automático).
- **País registrado determina pill default del paso 1.**
- **Mensaje de fallo ESPECÍFICO** ("Modelo no soportado por la herramienta actual") en lugar de genérico.
- **Avisos de espera ELIMINADOS** del paso 3 y paso 4 (contradicen marca Express).
- **Solo 2 toasts críticos** (cambio de precio + VIP deuda), todo lo demás se ve en seguimiento.

---

## 16. Lo que aún queda por diseñar

### Mockups del panel de operadores pendientes

- **Modal de procesar equipo** (cuando Jack/Angelo aprietan "Tomar y procesar" en columna derecha)
- **Vista de VIPs (Bryam)** con marcar/desmarcar y deudas pendientes
- **Modal de cerrar día (Bryam o Jack)** con resumen del día y confirmación
- **Vista de histórico** (auditoría de órdenes pasadas) — opcional, baja prioridad

### Decisiones técnicas pendientes para el spec del PR

- Comportamiento exacto cuando cliente cancela y primer comprobante ya está subido (devolución vs crédito vs ajuste manual)
- Cómo se ve el segundo comprobante en el panel del operador (al lado del primero, agrupados)
- Lógica de qué pasa cuando Bryam apreta "Cerrar día" con VIPs que tienen deuda pendiente

### Pendientes operativos del usuario

- Subir screenshots reales del USB Redirector v2.5.0.3540 (principal + Ready for connection)
- Armar manual/video de cómo conectar Xiaomi en modo Sideload
- Definir el formato exacto del Código del proceso (decidido: `47892-5`, formato orden-cantidad)
- Probar commits 1+2 en local con la mini-checklist

### Cosas abiertas a futuro (no urgentes)

- Migración eventual a SSE en lugar de polling para operadores
- Decisión sobre si el portal a futuro reemplaza WhatsApp para cotizaciones
- Si se agregan más métodos de pago (no en roadmap actual)

---

## Notas finales

Este documento refleja el estado de las decisiones al cierre de la sesión V3 (02 May 2026). Si algo no encaja con la realidad operativa que se descubra al implementar, es legítimo abrir el documento y corregirlo antes del PR.

El usuario (Bryam) demostró criterio UX excelente durante la sesión, identificando varios errores de diseño antes de que se implementaran (eliminación del polling, formato real del Technician ID, Binance Pay vs TRC20, comprobante recargado, avisos de espera contradictorios con la marca Express, "no notificar lo que ya está en seguimiento", convertir imagen del Redirector en botón). Estos catches representan ahorro significativo en tiempo de desarrollo.

El sistema antifraude de 4 capas es el módulo de mayor ROI del rediseño. Vale priorizarlo en el primer PR del PR principal.

La separación arquitectónica entre paso 4 (onboarding técnico) y Mis Órdenes (control activo equipo-por-equipo) es una decisión clave que debe respetarse en la implementación. Confunde fácilmente a desarrolladores que no estuvieron en el contexto.
