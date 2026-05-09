# AriadGSM Paso 2 - Delta de pricing FRP

Fecha: 2026-05-09
Repo: `raugsm/miweb`

Este documento compara el precio anterior con tiers contra Paso 2.C. Los datos
son referencia operativa para Bryams antes del rollout.

## Supuestos

- Proveedor activo Krypto: `fixed_cost_usdt = 3.00`.
- Pricing anterior: `target_margin_usdt = 1.50`, sin fee fijo por orden.
- Pricing nuevo registrado: `target_margin_usdt = 1.00` y
  `PORTAL_OPERATOR_FEE_USDT = 0.30`.
- Pricing nuevo guest: registrado nuevo + `0.20` USDT por equipo.
- Tiers viejos no se borran de BD; solo se archiva la logica que los aplicaba.

## Registrado normal

Antes: volume tier descontaba solo sobre margen. Despues: formula lineal.

| Equipos | Antes unit | Antes total | Despues unit | Despues total | Delta total |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 4.50 | 4.50 | 4.00 + fee | 4.30 | -0.20 |
| 3 | 4.2750 | 12.8250 | 4.00 + fee | 12.30 | -0.5250 |
| 5 | 4.1250 | 20.6250 | 4.00 + fee | 20.30 | -0.3250 |
| 10 | 3.90 | 39.00 | 4.00 + fee | 40.30 | +1.30 |
| 20 | 3.90 | 78.00 | 4.00 + fee | 80.30 | +2.30 |

## Registrado VIP

VIP se mantiene como excepcion manual por `vipUnitMargin`.

| Escenario | Equipos | Nuevo unit | Nuevo total |
| --- | ---: | ---: | ---: |
| VIP margen 0.50 | 1 | 3.50 | 3.80 |
| VIP margen 0.50 | 5 | 3.50 | 17.80 |
| VIP margen 0.50 | 10 | 3.50 | 35.30 |
| VIP margen 1.00 | 1 | 4.00 | 4.30 |
| VIP margen 1.00 | 5 | 4.00 | 20.30 |
| VIP margen 1.00 | 10 | 4.00 | 40.30 |

## Registrado con monthly tier anterior

Antes, un cliente con `monthlyUsage >= 30` podia bajar al piso dinamico
`costo + 0.60 = 3.60`. Paso 2.C elimina esa aplicacion.

| Equipos | Antes unit monthly | Antes total | Despues unit | Despues total | Delta total |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.60 | 3.60 | 4.00 + fee | 4.30 | +0.70 |
| 3 | 3.60 | 10.80 | 4.00 + fee | 12.30 | +1.50 |
| 5 | 3.60 | 18.00 | 4.00 + fee | 20.30 | +2.30 |
| 10 | 3.60 | 36.00 | 4.00 + fee | 40.30 | +4.30 |
| 20 | 3.60 | 72.00 | 4.00 + fee | 80.30 | +8.30 |

## Guest

Guest no existia antes. Nuevo precio: registrado nuevo + `0.20` por equipo.

| Equipos | Guest unit base | Guest surcharge total | Fee orden | Total |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 4.00 | 0.20 | 0.30 | 4.50 |
| 3 | 4.00 | 0.60 | 0.30 | 12.90 |
| 5 | 4.00 | 1.00 | 0.30 | 21.30 |
| 10 | 4.00 | 2.00 | 0.30 | 42.30 |
| 20 | 4.00 | 4.00 | 0.30 | 84.30 |

## Nota operativa

El cambio mas visible es que las compras grandes registradas dejan de tener
descuento por volumen. Para N=10 suben de `39.00` a `40.30`. Para N=1 bajan
de `4.50` a `4.30`.
