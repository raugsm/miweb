# Audit del repo AriadGSM Portal — Fase 0

Necesito un inventario estructurado del código actual para preparar la spec mínima del operador. No modifiques nada, solo lee y reportá. Devolvé las respuestas en este mismo formato Markdown para que el resultado sea copiable.

---

## 1. Estructura del proyecto

- **Stack frontend:** (framework, librerías UI principales)
- **Stack backend:** (lenguaje, framework, ORM si aplica)
- **Base de datos:** (motor + tablas principales relevantes a Order, Customer, Technician)
- **Branch actual:** (nombre + último commit)
- **Árbol del repo (3 niveles):**
  ```
  (pegar tree -L 3 --dirsfirst, ignorando node_modules y .git)
  ```

---

## 2. Cliente (los 4 pasos)

Para cada paso, indicá:

- **Paso 1 — Precio:** ¿existe? Archivo/ruta. ¿Qué países soporta hoy en código?
- **Paso 2 — Solicitud:** ¿existe? Archivo/ruta. ¿Cómo se calcula el precio unitario?
- **Paso 3 — Pago:** ¿existe? Archivo/ruta. ¿Qué métodos de pago tiene implementados? ¿Hay cuentas hardcoded o vienen de DB/config?
- **Paso 4 — Conexión:** ¿existe? Archivo/ruta. ¿De dónde sale el Technician ID y el Código del proceso?
- **Mis Órdenes:** ¿existe? ¿Tiene activity log?

---

## 3. Operador (lo que ya exista hoy)

Lista todo lo que encuentres con función de operador, técnico, admin, dashboard. Para cada uno:

- Ruta (ej. `/operator`, `/admin`, `/tecnico`)
- Archivo principal
- ¿Qué muestra? (descripción de 1 línea)
- ¿Qué acciones permite? (botones, mutations)
- ¿Quién puede acceder? (auth check)

Si no hay nada, reportá "no encontrado" explícito.

---

## 4. Backend / lógica de negocio

- **Modelo Order:** lista de campos exactos (nombre + tipo).
- **Endpoints API que existen:**
  - Lista cada uno: método + ruta + qué hace en 1 línea.
- **Lock 15 min:** ¿está implementado? ¿Dónde? ¿Cómo persiste?
- **Validación de monto:** ¿hay alguna validación al subir comprobante? ¿Qué reglas?
- **Multi-orden:** ¿un cliente puede tener varias órdenes activas? ¿Hay restricción en código?
- **VIPs / `vipUnitMargin`:** ¿existe el atributo en el modelo? ¿Se usa?
- **PDF + QR + SHA-256:** ¿implementado? ¿Endpoint público `/v/:code` existe?

---

## 5. Estados de orden

Lista exacta de los valores de estado que aparecen en el código (no en docs). Buscá en: enum, constantes, strings literales en condiciones, validaciones.

Ejemplo de formato:
```
- ESPERANDO_PAGO       → usado en: src/lib/order.ts, src/api/orders.ts
- PAGO_EN_REVISION     → usado en: ...
- ...
```

Si encontrás transiciones (ej. "de A pasa a B cuando X"), listálas.

---

## 6. Integraciones externas

- **API de tasa de cambio (USDT → fiat):** ¿hay una? ¿Cuál?
- **Geolocation por IP:** ¿implementado?
- **WhatsApp:** ¿hay integración? ¿Twilio, CallMeBot, link directo?
- **Storage de archivos (comprobantes):** ¿S3, local, CDN?
- **Email / notificaciones push:** ¿existen?

---

## 7. Gaps detectados

Mientras leés el código, anotá cosas que veas claramente faltantes o rotas. Sin filtrar — todo lo que parezca incompleto, hardcoded de más, TODOs grandes, condiciones que parezcan workarounds.

Formato libre, lista de bullets.

---

## 8. Resumen ejecutivo (3 líneas máximo)

Después de todo lo anterior, escribí:

- **Qué está sólido** (lo que claramente funciona y no hay que tocar)
- **Qué está parcial** (existe pero le falta algo significativo)
- **Qué no existe** (de plano hay que construirlo)

---

**Hora estimada para el audit:** 30–60 min. Si te lleva más, parar y reportar parcial — mejor un audit incompleto pronto que uno completo tarde.
