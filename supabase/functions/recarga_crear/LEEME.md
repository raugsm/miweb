# Recarga de créditos con CoinGate (Binance Pay / cripto)

Dos funciones que cobran una recarga de créditos de Ari-Tool a través de
CoinGate. El técnico paga en el checkout de CoinGate (con **Binance Pay** o
cripto) y, cuando el pago se confirma, se le suman los créditos solos.

    recarga_crear    (autenticada)   crea la orden en CoinGate → devuelve el link
    recarga_webhook  (pública)       CoinGate avisa el pago → acredita 1 sola vez

## Modelo
1 crédito = 1 USD. Paquetes: 5, 10, 20, 50, 100. Liquidación en **USDC**
(estable en USD; CoinGate no ofrece USDT como moneda de cobro).

## Tabla (ya creada en el proyecto Ariad_SecurityPlugin)
```sql
create table negocio.recarga (
  codigo uuid primary key default gen_random_uuid(),
  usuario_ref uuid not null references negocio.usuario_taller(codigo),
  creditos integer not null check (creditos > 0),
  monto_usd numeric(10,2) not null check (monto_usd > 0),
  coingate_order_id text,
  token text not null,             -- secreto por orden, valida el webhook
  estado text not null default 'pendiente', -- pendiente|pagado|expired|invalid|cancelado
  creado timestamptz not null default now(),
  pagado_en timestamptz
);
alter table negocio.recarga enable row level security; -- deny-all, solo service_role
```

## Secretos que hay que cargar en Supabase (Edge Functions → Secrets)
- `COINGATE_TOKEN` — token de API de CoinGate. **Arrancar con el de sandbox.**
- `COINGATE_ENV`  — dejar sin poner (o distinto de "production") para usar el
  entorno de PRUEBA. Poner `production` recién con la cuenta real aprobada.

## Cómo se prueba (sandbox, plata falsa)
1. Crear cuenta en https://sandbox.coingate.com → crear una App → copiar el token.
2. Cargar `COINGATE_TOKEN` con ese token; dejar `COINGATE_ENV` sin poner.
3. Desplegar las dos funciones.
4. Desde la web (o a mano con el JWT de un técnico) llamar a `recarga_crear`
   con `{ creditos: 5 }`, abrir la `url`, pagar en el sandbox, y confirmar que
   el saldo del técnico sube (webhook → credito_mover, una sola vez).

## Anti-doble
`recarga_webhook` valida el `token` de la orden, re-consulta el estado a
CoinGate, y reclama la fila con un UPDATE condicional (pendiente→pagado): los
webhooks repetidos no vuelven a acreditar.
