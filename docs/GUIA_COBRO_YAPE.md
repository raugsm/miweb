# Guía replicable: cobro propio por Yape (lector de notificaciones)

> Handoff técnico para replicar el sistema de cobro por **Yape** en otra app del mismo
> mercado (Perú). Explica **el método**, **cómo lo hicimos nosotros** (Ariad) y **cómo lo
> puede aplicar otro equipo**. Sin secretos: donde va una clave/URL/número hay un placeholder.

**Autores:** equipo Ariad · **Fecha:** 2026-10-01

---

## 1. El problema (por qué este método)

Yape (billetera de BCP, Perú) **no tiene**:
- API pública de lectura de pagos recibidos,
- webhook/notificación servidor-a-servidor,
- campo de "nota"/"referencia"/"concepto" que el pagador pueda llenar (a diferencia de Binance Pay).

Conclusión: **no se puede saber por software que entró un Yape** de forma oficial. Las pasarelas con RUC (Culqi/MercadoPago/Izipay) rechazan el rubro de desbloqueo. La solución que **sí funciona** y usamos en producción: **un teléfono físico con Yape instalado lee sus notificaciones push y las reenvía, firmadas, a un backend** que las concilia con el cobro y acredita.

---

## 2. Arquitectura (de punta a punta)

```
  Cliente paga por Yape  ─►  Teléfono receptor (Yape + APK lector)
                                  │  NotificationListenerService lee la notif
                                  │  "Fulano te envió un pago por S/ X. El cód. de seguridad es: NNN"
                                  │  parsea monto + código(3 díg) + nombre del pagador
                                  │  firma HMAC-SHA256 del cuerpo + device id
                                  ▼
                           POST  /notificar (edge/endpoint público)
                                  │  valida firma (cuerpo CRUDO) + device activo
                                  ▼
                           Backend: guarda "pago visto" (append, dedup por huella)
                                  │
                      ┌───────────┴───────────┐
          (lado web) el cliente declara        (lado ingesta) intenta casar al llegar
          su código de 3 díg  ─────────────►  CASACIÓN: monto exacto + código + ventana
                                  │  1 candidato → acredita (exactly-once)
                                  │  2+ candidatos → RETIENE en revisión (nunca misrutea)
                                  ▼
                           Acreditación (UNIQUE por txid) → créditos/licencia al usuario
```

Dos "mitades" que se encuentran: el **teléfono** ve la plata; el **cliente** declara su código en tu web. El server cruza ambas. Esto da doble verificación y evita que alguien reclame un pago ajeno.

---

## 3. El teléfono (hardware + blindaje)

- **Un Android dedicado** (nosotros: Samsung A16) con la **cuenta Yape receptora logueada** y recibiendo las notificaciones de "pago recibido". Tenelo **enchufado**.
- **Lee con la pantalla apagada y bloqueada**: el `NotificationListenerService` es un binding del sistema que recibe cada notificación apenas se postea, sin importar el estado de pantalla. No hace falta pantalla encendida.
- **Blindaje anti-sueño (CRÍTICO)** — sin esto Android congela la app o retrasa las notifs. Todo replicable por ADB:
  ```bash
  # 1) Permiso "acceso a notificaciones" para el lector (o a mano en Ajustes):
  adb shell cmd notification allow_listener <paquete.lector>/<paquete.lector>.YapeListenerService
  # 2) Whitelist de Doze/batería (no lo congela en reposo):
  adb shell dumpsys deviceidle whitelist +<paquete.lector>
  # 3) (opcional) bucket activo:
  adb shell am set-standby-bucket <paquete.lector> active
  # Verificar:
  adb shell settings get secure enabled_notification_listeners   # debe incluir tu listener
  adb shell dumpsys deviceidle whitelist | grep <paquete.lector>
  ```
- **Importante:** conviene whitelistear **también a Yape** (el emisor), porque en sueño profundo Android puede **retrasar la notificación de Yape misma** (ver §6). El lector lee apenas llega; si Yape la postea tarde, llega tarde.

---

## 4. El APK lector (cómo lo hicimos)

Stack: **.NET 10 Android** (C#). Proyecto de referencia: `ariad-yape-lector/`. Componentes:

| Archivo | Rol |
|---|---|
| `Services/YapeListenerService.cs` | `NotificationListenerService`: lee TODAS las notifs, filtra Yape, parsea, encola |
| `Yape/YapeParser.cs` | Parseo puro y testeable (regex de monto/código/pagador) |
| `Models/YapePago.cs` + `Data/ColaLocal.cs` | Modelo + cola local SQLite (resiliencia offline) |
| `Services/Despachador.cs` | Envía la cola con reintento/backoff |
| `Net/ApiClient.cs` | Firma HMAC + POST al backend (+ latido + chequeo de versión) |
| `Services/WatchdogService.cs` | Foreground service keep-alive (mantiene el proceso vivo) + barrido periódico |
| `Services/Reanimador.cs`, `ArranqueReceiver.cs` | Revivir el servicio + arrancar al bootear |
| `Services/Actualizador.cs` | OTA: chequea versión publicada y actualiza el APK solo |
| `Config/Ajustes.cs` | URL del backend, secreto HMAC, device id (persistidos en el teléfono) |

### 4.1 Leer la notificación (robusto)
`NotificationListenerService.OnNotificationPosted` dispara con cada notif. Claves de robustez que aprendimos:
- Leer el cuerpo de los extras en orden: **`ExtraBigText` → `ExtraText` → `ExtraTitle`** (el texto largo trae todo).
- **Barrer la bandeja** (`GetActiveNotifications()`) al conectar **y** cada ~45 s desde el Watchdog: si Yape posteó un pago mientras el listener estaba caído, `OnNotificationPosted` no dispara para él — el barrido lo capta.
- **Huella estable** usando el `PostTime` de la notif (no "ahora"): la misma notif barrida N veces produce la misma huella → no duplica.
- Tras **actualizar la app**, el binding del listener se pierde hasta reiniciar: forzamos re-vínculo apagando/prendiendo el componente (`SetComponentEnabledSetting`) + `RequestRebind`. En `OnListenerDisconnected` pedimos `RequestRebind`.

### 4.2 Parsear (formato real de Yape + regex)
Notificación real (capturada): título **"Confirmación de Pago"**, texto:
> `Bryans Zun* te envió un pago por S/ 3.5. El cód. de seguridad es: 618`

Paquete emisor: `com.bcp.innovacxion.yapeapp`. Regex (C#/.NET, case-insensitive):
```
monto    : S/\s*([0-9]+(?:[.,][0-9]{1,2})?)
pagador  : ^(.+?)\s+te\s+env[ií][oó]\s+un\s+pago        → captura "Bryans Zun*" (Yape ofusca el apellido)
código   : seguridad\s+es:?\s*([0-9]+)                   → los 3 dígitos
```
Solo se acepta si trae "te envió un pago" + monto válido. El **nombre del pagador** viene en la notif (apellido ofuscado por Yape); el **número/celular NO** llega al receptor.

### 4.3 Dedup (huella) y envío firmado
- **Huella** = `monto|codigo|minuto-epoch|pagador`. Sirve de `txid` para dedup idempotente.
- **Payload** (JSON) → POST al endpoint: `{ monto, codigo, pagador, texto, recibido_en_ms, huella, device }`.
- **Firma**: `HMAC-SHA256(secreto_compartido, cuerpo_JSON_crudo)` en Base64, en header `X-Firma`; `device id` en `X-Device`. El secreto vive en el teléfono (Ajustes) y en el backend — **nunca en el repo**.
- **Cola local (SQLite)**: se guarda el pago apenas se detecta y se marca enviado **solo** cuando el server confirma. Así no se pierde ninguno sin internet o si el teléfono se reinicia. Reintento con backoff.
- **Latido (heartbeat)** periódico al backend (device, pendientes, versión) → para monitorear que el lector sigue vivo.

---

## 5. El backend (cómo lo hicimos)

Nosotros: Supabase (Postgres + Edge Functions), esquema `pago`. Pero el patrón sirve para **cualquier** backend. Piezas:

### 5.1 Endpoint de notificación (público, pero firmado)
- Edge `yape_notificar` (sin JWT): valida la **firma HMAC del cuerpo CRUDO** (comparación **constante-en-tiempo**) + que el **device esté registrado y activo**. **No confía en nada sin firma válida** (si no, cualquiera falsifica pagos).
- Si valida → inserta el "pago visto" (append-only) y dispara la casación.

### 5.2 Ingesta y dedup
- Tabla "pago visto" con **PK = huella/txid** e `INSERT ... ON CONFLICT DO NOTHING`: la misma notif nunca entra dos veces.
- Modelo por **estados** (append-only): `nuevo → casado / sin_codigo / revision / ignorado / ...`. Nada se borra.

### 5.3 Casación "store-and-match" (el corazón)
- El cliente, en tu web, **declara el código de seguridad de 3 dígitos** de su comprobante para su cobro.
- El server cruza: **monto exacto + código + ventana de tiempo**.
  - **1 candidato** → acredita.
  - **2+ candidatos** (mismo monto y código en la ventana) → **RETIENE en revisión**, nunca misrutea; un operador resuelve el par correcto.
- **Gracia**: aceptamos el pago dentro de una ventana (p.ej. `[creado-10min, creado+2h]`) para tolerar notifs/declaraciones tardías (ver §6).

### 5.4 Exactly-once (obligatorio)
- Tabla de acreditación con **UNIQUE por txid** (y PK por cobro). Acreditar es `INSERT ... ON CONFLICT DO NOTHING`; si no insertó, no se vuelve a acreditar. Una notif re-posteada o un reintento jamás da doble crédito.

### 5.5 Anti-fraude
- **Rate-limit por usuario** (ej. 12 declaraciones/hora sobre cobros no confirmados).
- **Tope de 3 códigos distintos / 15 min** por cobro → luego bloqueo + derivar a soporte (evita fuerza bruta del código de 3 díg).
- Todo lo de dinero: funciones `service_role`-only, RLS deny-all, tablas de dinero **append-only** (no UPDATE/DELETE), bitácora con hash encadenado.

---

## 6. Gotchas / lecciones (lo que nos costó)

1. **Doze retrasa la notificación de YAPE (el emisor), no la lectura.** Nuestro lector lee apenas llega; el retraso lo mete Android en el lado de Yape cuando el teléfono está en sueño profundo. Mitigación: teléfono **enchufado** + whitelist de batería (del lector **y** de Yape) + la **ventana de gracia** de 2 h en el backend para que un pago tardío igual acredite.
2. **El código de 3 dígitos tiene baja entropía** (~1000 valores) y el monto suele repetirse → **colisiones**. Por eso la casación **retiene ante ambigüedad** en vez de adivinar. Mejora recomendada: sumar el **nombre del pagador** (y/o un identificador del comprobante) como discriminante.
3. **Exactly-once no es opcional**: la misma notif se re-postea/barre varias veces. Sin UNIQUE por txid, doble crédito.
4. **El listener lee bloqueado/pantalla apagada** — confirmado (es el punto del `NotificationListenerService`). Lo que NO hay que hacer es depender de la pantalla o de que la app esté en primer plano.
5. **Tras actualizar el APK, re-vincular el listener** (toggle del componente + RequestRebind), si no deja de recibir hasta reiniciar.
6. **Build para sideload (.NET Android):** compilar con `-p:EmbedAssembliesIntoApk=true`; si no, el Debug usa *Fast Deployment* (no embebe assemblies) y la app **crashea al abrir** instalada por `adb install`. Y actualizar con `adb install -r` (en el lugar); **no desinstalar** (perdés la config del lector).
7. **Firma HMAC sobre el cuerpo CRUDO** (no sobre el JSON re-serializado) — si el server re-parsea y re-serializa antes de verificar, la firma no coincide.

---

## 7. Cómo lo puede aplicar otro equipo (en su app, mismo mercado)

El método es **reusable tal cual**; lo específico de la otra app es el backend y las reglas de negocio.

**Reusar casi sin cambios:**
- El **teléfono + `NotificationListenerService`** que lee Yape y postea firmado. Pueden tomar `ariad-yape-lector` como base (cambiando `Ajustes`: su URL, su secreto, su device id).
- El **parseo** (regex del §4.2) — es el formato de Yape, igual para todos.
- El **blindaje del teléfono** (§3) — idéntico.

**Adaptar a su app:**
- **Backend**: no hace falta Supabase. Necesitan: (a) un endpoint que **valide la firma HMAC + device**, (b) una tabla "pago visto" con **dedup por txid**, (c) un paso de **casación** y (d) una acreditación **exactly-once (UNIQUE por txid)**. En cualquier stack (Node/Postgres, etc.).
- **Estrategia de casación** — elegir según su producto:
  - *Store-and-match por código declarado* (lo nuestro): bueno si el cliente tiene una web donde declara el código.
  - *Monto único por cobro* (cobrar un monto "raro" distinto por transacción, ej. S/10.07) para que el monto casi identifique el pago — simple, sin que el cliente declare nada, pero limita montos.
  - *Nombre del pagador* como refuerzo en cualquiera de las dos.
- **Anti-fraude y gracia** — ajustar ventanas/topes a su volumen.

**Qué NO hacer (errores que ya pagamos):**
- Confiar en notificaciones **sin firma** → cualquiera POSTea pagos falsos.
- Casar **solo por monto** sin ventana/retención → misruteo con montos repetidos.
- Olvidar **exactly-once** → doble crédito con reintentos.
- Depender de la **pantalla encendida** o de la app en foreground.
- Un **solo** teléfono sin monitoreo: agregar **heartbeat** y alerta si deja de latir.

---

## 8. Checklist de replicación

- [ ] Teléfono dedicado con Yape logueado (cuenta receptora), enchufado.
- [ ] APK lector instalado; permiso de acceso a notificaciones concedido.
- [ ] Whitelist de Doze del lector **y** de Yape; (bucket activo).
- [ ] `Ajustes` del lector: URL del backend, secreto HMAC, device id.
- [ ] Backend: endpoint firmado (HMAC cuerpo crudo + device activo).
- [ ] Tabla pago-visto con dedup por txid (append-only por estados).
- [ ] Casación (código declarado / monto único) con **retención ante ambigüedad**.
- [ ] Acreditación **exactly-once** (UNIQUE por txid).
- [ ] Ventana de **gracia** para notifs tardías.
- [ ] Anti-fraude (rate-limit + tope de intentos + bloqueo).
- [ ] Heartbeat + alerta si el lector deja de latir.
- [ ] Probar un pago **con la pantalla apagada y bloqueada** (debe llegar igual).

---

## 9. Referencias (repo)
- APK lector: proyecto `ariad-yape-lector` (archivos listados en §4).
- Backend (nuestro): `miweb/supabase/functions/yape_*` (edges) + `supabase/migrations/*yape*`/`*pago*` + `docs/2026-09-30/ESTADO_FINAL_Y_RUNBOOK.md` (runbook operativo del motor).
- Contexto de por qué no otras pasarelas: `docs/2026-09-28/` (investigación Yape/Izipay).
