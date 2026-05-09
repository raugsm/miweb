# AriadGSM Paso 2 - Runbook rollout guest

Fecha: 2026-05-09
Repo: `raugsm/miweb`
Alcance: activar flujo guest sin registro, pricing v2 y claim post-registro por flags.

Este runbook asume que B.3 auth granular sigue en validacion pasiva. No cambiar
`POSTGRES_AUTH_GRANULAR_CUSTOMER` ni `POSTGRES_AUTH_GRANULAR_OPERATOR` durante
este rollout.

## 1. Variables de entorno

Configurar en Render Dashboard > `ariadgsm-ops` > Environment.

| Variable | Default seguro | Valor rollout | Uso | Rollback |
| --- | --- | --- | --- | --- |
| `PORTAL_GUEST_ENABLED` | `0` | Dia 1: `0`; Dia 2: `1` | Activa rutas/UI guest. | Volver a `0`; no requiere redeploy. |
| `PORTAL_GUEST_CLAIM_ENABLED` | `1` si guest esta activo | Dia 1: `1`; Dia 2+: `1` | Activa preview/claim de ordenes guest al registrarse. | Volver a `0`; guest sigue activo. |
| `PORTAL_OPERATOR_FEE_USDT` | `0.30` | `0.30` | Fee fijo por orden. | `0` si se revierte al precio historico. |
| `PORTAL_GUEST_SURCHARGE_PER_EQUIPMENT_USDT` | `0.20` | `0.20` | Recargo por equipo guest. | Mantener o bajar a `0` si se pausa guest. |

No poner secretos en estas variables. Ninguna contiene tokens ni claves.

## 2. SQL operacional de pricing

Paso 2 cambia la ganancia por equipo de `1.50` a `1.00` USDT. No es migracion
de schema; Bryams lo aplica manualmente cuando el deploy entra con guest apagado.

SQL exacto:

```sql
update ariad.frp_pricing_policy
set target_margin_usdt = 1.00, updated_at = now()
where id = 'current';
```

Verificacion:

```sql
select id, target_margin_usdt, updated_at
from ariad.frp_pricing_policy
where id = 'current';
```

Con Krypto `3.00`, fee operador `0.30` y cliente registrado `N=1`, el total
esperado es `4.30` USDT.

Rollback de pricing:

```sql
update ariad.frp_pricing_policy
set target_margin_usdt = 1.50, updated_at = now()
where id = 'current';
```

Si se restaura `1.50`, tambien poner `PORTAL_OPERATOR_FEE_USDT=0`; si se deja
`0.30`, el total registrado N=1 seria `4.80` en vez del historico `4.50`.

## 3. Rollout dia por dia

### Dia 1 - Deploy con guest apagado

Objetivo: desplegar codigo sin exponer el flujo nuevo.

1. En Render, confirmar:
   - `PORTAL_GUEST_ENABLED=0`
   - `PORTAL_GUEST_CLAIM_ENABLED=1`
   - `PORTAL_OPERATOR_FEE_USDT=0.30`
   - `PORTAL_GUEST_SURCHARGE_PER_EQUIPMENT_USDT=0.20`
2. Deploy de los commits Paso 2.C.
3. Verificar `GET /api/health` responde 200.
4. Ejecutar el SQL de pricing a `1.00`.
5. Verificar portal registrado:
   - Login cliente sigue funcionando.
   - Cliente registrado N=1 muestra `4.30` USDT.
   - Cliente registrado N=10 muestra `40.30` USDT.
   - Orden registrada se crea y aparece al operador como antes.
6. Revisar logs 15-30 minutos:
   - Sin `POSTGRES_RUNTIME_DESTRUCTIVE_WRITE_BLOCKED`.
   - Sin `JavaScript heap out of memory`.
   - Sin errores `portal_guest_*` inesperados con guest apagado.

Condicion para avanzar: pricing registrado correcto y sin regresion operativa.

### Dia 2-3 - Validacion de pricing registrado

Objetivo: observar clientes reales sin abrir guest.

Validar:

- El cobro registrado N=1 queda en `4.30`.
- Comprobantes, recibos y panel operador usan el mismo total.
- Los pedidos existentes respetan su `pricingSnapshot`.
- Login no empeora frente a Fase A/B.3.
- Memoria se mantiene estable frente al baseline post-Fase A.

Si hay divergencia de precio, no activar guest. Revertir pricing primero.

### Dia 2 - Activar guest

Objetivo: abrir guest con claim disponible por flag, validando primero una orden
controlada y luego claim post-registro.

1. En Render, poner `PORTAL_GUEST_ENABLED=1`.
2. Confirmar `PORTAL_GUEST_CLAIM_ENABLED=1`.
3. Crear una orden guest sintetica controlada:
   - WhatsApp de prueba.
   - N=1.
   - Comprobante de prueba.
4. Verificar:
   - Guest N=1 muestra `4.50` USDT.
   - Guest N=10 muestra `42.30` USDT.
   - Backend devuelve codigo `ARD-*` y recovery link.
   - La URL `/pedido/:code?t=...` carga el portal y limpia el token de la URL.
   - Cookie guest recupera la orden.
   - Operador ve badge `Guest`.
   - Aprobar pago y marcar DONE no cambian flujo operador.
   - SSE actualiza el estado guest.
5. Monitorear logs:
   - Sin token raw en logs.
   - Sin WhatsApp raw en audit guest.
   - Sin 500 recurrentes en `/api/portal/guest/*`.

Condicion para avanzar: guest crea, paga, recupera y finaliza una orden de prueba.

### Dia 3 - Validacion con cliente real guest si aplica

Objetivo: permitir una prueba real controlada sin abrir mas alcance.

Validar:

- Guest puede crear orden y recuperarla con cookie o link.
- Operador ve badge `Guest`.
- Aprobacion, DONE y SSE no cambian el flujo operativo.
- Claim post-registro funciona si el cliente crea cuenta con el mismo WhatsApp.

Verificar en `/api/portal/session`:
   - `guestClaimCandidates.count` aparece.
   - Solo se exponen codigos publicos `ARD-*`, cantidad y estado.
   - No se exponen comprobantes, tokens, links, datos de pago ni WhatsApp raw.
- Ejecutar claim desde UI.
- Verificar:
   - Orden pasa a la cuenta registrada.
   - Token guest queda revocado.
   - Audit `PORTAL_GUEST_CLAIM` contiene `phoneHash`, no telefono raw.

Condicion de cierre: claim funciona y puede apagarse por flag sin redeploy.

## 4. Rollback

### 4.1 Rollback guest completo

Aplicar:

```text
PORTAL_GUEST_ENABLED=0
```

Efecto:

- Rutas `/api/portal/guest/*` devuelven 404.
- UI guest queda oculta.
- Ordenes guest ya creadas quedan en DB y el operador puede seguir viendolas si
  ya entraron a cola.
- Links `/pedido/:code` dejan de recuperar orden mientras la flag este apagada.

No requiere redeploy.

### 4.2 Rollback solo claim

Aplicar:

```text
PORTAL_GUEST_CLAIM_ENABLED=0
```

Efecto:

- Guest sigue activo.
- No se muestran candidatas.
- `claim-preview` y `claim` quedan deshabilitados.
- No afecta ordenes ya reclamadas.

No requiere redeploy.

### 4.3 Rollback pricing

Aplicar SQL:

```sql
update ariad.frp_pricing_policy
set target_margin_usdt = 1.50, updated_at = now()
where id = 'current';
```

Y ajustar env:

```text
PORTAL_OPERATOR_FEE_USDT=0
```

Resultado esperado con Krypto `3.00`: `3.00 + 1.50 + 0 = 4.50`.

### 4.4 Rollback schema

No hacer `DROP` en caliente.

- `customer_clients.account_type` queda con default `registered`; no rompe flujos.
- `guest_session_tokens` queda sin uso si guest esta apagado.
- Si se necesita revertir codigo, revertir deploy/commit y dejar schema inerte.

## 5. Que buscar en logs

Durante cada fase revisar Render Logs por:

- `portal_guest_order_created`
- `PORTAL_GUEST_CLAIM`
- `guest_token_invalid`
- `payment_method_invalid`
- `whatsapp_invalid`
- `POSTGRES_RUNTIME_DESTRUCTIVE_WRITE_BLOCKED`
- `deadlock detected`
- `JavaScript heap out of memory`

Alertas duras:

- Tokens raw o links completos con `?t=` en logs.
- WhatsApp completo en audit guest.
- 500 repetidos en rutas guest.
- Aumento sostenido de memoria frente al baseline estable.

## 6. Tabla canonica de pricing

Con Krypto `3.00`, margin `1.00`, fee operador `0.30`, surcharge guest `0.20`:

| Tipo | N=1 | N=2 | N=3 | N=5 | N=10 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Registrado | 4.30 | 8.30 | 12.30 | 20.30 | 40.30 |
| Guest | 4.50 | 8.70 | 12.90 | 21.30 | 42.30 |

Formula:

```text
registrado = (3.00 * N) + (1.00 * N) + 0.30
guest = (3.00 * N) + (1.00 * N) + 0.30 + (0.20 * N)
```

## 7. Lo que Paso 2 NO incluye

- No cambia auth B.3 ni sus flags `POSTGRES_AUTH_GRANULAR_*`.
- No migra creacion de ordenes/pagos/FRP a SQL granular. Eso queda para Fase C.
- No implementa WhatsApp Business API.
- No implementa verificacion SMS/WhatsApp para claim.
- No automatiza reembolsos.
- No implementa pricing dinamico automatico.
- No elimina datos historicos de tiers; solo desactiva su aplicacion en FRP Express.
- No cambia el flujo operativo de aprobar pago, DONE, cancelar o marcar incompatible.
- No abre staging ni PR previews; rollout se controla por flags en produccion.
