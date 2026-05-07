# Sesion 23 - Verificacion asistida de comprobantes FRP

## Problema

El flujo FRP del cliente tiene cuatro pasos:

1. Ver precio.
2. Elegir cantidad de equipos.
3. Subir comprobante.
4. Presionar "Equipo conectado".

El boton "Equipo conectado" solo aparece despues de aprobar el pago. Cuando hay muchas ordenes, la revision manual demora y el cliente queda esperando. Algunos clientes conectan fisicamente el equipo apenas suben el comprobante, pero la orden no puede avanzar porque el pago sigue en revision.

## Fuentes externas usadas como criterio

- Stripe Radar Reviews separa pagos automatizados de pagos inusuales que entran a revision manual. Criterio adoptado: no revisar todo manualmente si hay senales suficientes, pero mantener cola humana para casos inciertos.
  Fuente: https://docs.stripe.com/radar/reviews
- AWS Textract AnalyzeExpense devuelve campos de documentos financieros con `Confidence`. Criterio adoptado: cualquier automatizacion de comprobantes debe guardar confianza y campos extraidos, no solo una conclusion textual.
  Fuente: https://docs.aws.amazon.com/textract/latest/dg/API_AnalyzeExpense.html
- Google Document AI Human Review provee un camino formal para mandar documentos a revision humana. Criterio adoptado: el estado "no estoy seguro" no es error; es una salida esperada del sistema.
  Fuente: https://docs.cloud.google.com/document-ai/docs/samples/documentai-review-document

## Decision

No se implementa una IA autonoma que aprenda en produccion ni que apruebe pagos sin umbral probado.

Primero se implementa una capa de verificacion en modo sombra:

- registra que el comprobante necesita revision humana;
- guarda metadata minima y sanitizada;
- no guarda imagen/base64 duplicada;
- no aprueba pagos;
- no muestra ni genera el paso de conexion;
- no reemplaza `PATCH /api/frp/orders/:id/payment-review`.

Esta decision evita repetir el error de mover estados de dinero con una conclusion opaca.

## Contrato v1

Campo persistido en orden cliente y orden FRP:

```json
{
  "version": "payment-verification-shadow-v1",
  "mode": "shadow",
  "decision": "NEEDS_REVIEW",
  "confidence": 0,
  "autoReviewAllowed": false,
  "generatedAt": "ISO-8601",
  "source": "portal_create | portal_reupload | operator_upload",
  "proofCount": 1,
  "expected": {
    "amountUsdt": 4.55,
    "currency": "USDT",
    "quantity": 1,
    "paymentMethod": "PE_YAPE_BRYAMS",
    "paymentLabel": "Yape"
  },
  "reasons": [
    "shadow_mode",
    "ai_provider_not_configured",
    "manual_review_required"
  ]
}
```

## Estados permitidos en fase sombra

| Decision | Significado | Efecto operativo |
| --- | --- | --- |
| `NEEDS_REVIEW` | El comprobante existe pero debe revisarlo humano | Permanece en `PAGO_EN_VALIDACION` |
| `BLOCKED_NO_PROOF` | No hay comprobante valido para evaluar | Request debe fallar antes de persistir |

No existe `AUTO_APPROVED` en esta fase.

## Regla de conexion

El nombre/codigo de conexion y el boton "Equipo conectado" siguen bloqueados hasta que el pago quede validado por el contrato existente:

- `checklist.paymentValidated === true`, o
- `paymentStatus` aprobado por `payment-review`.

La verificacion asistida no cambia esa condicion.

## Fase futura

Para habilitar aprobacion automatica se requiere otro cambio separado:

1. Adapter externo OCR/vision configurado por entorno.
2. Extraccion de monto, moneda, destinatario, fecha y referencia.
3. Umbral minimo de confianza por campo critico.
4. Bloqueo por hash duplicado antes de consultar IA.
5. Audit event especifico para `PAYMENT_AI_AUTO_APPROVE_CANDIDATE`.
6. Pruebas con falsos positivos y falsos negativos.
7. Reporte de produccion en modo sombra antes de activar auto-aprobacion.

Hasta entonces, toda aprobacion sigue siendo humana.
