# 09 - Seguridad, deploy y pendientes

## Revision de seguridad (antes de publicar)
- Esquema "pago": 26/26 tablas con RLS y 0 funciones/tablas accesibles por el
  cliente. Solo entra el backend. OK.
- Cero secretos en el codigo (ni llaves de Binance, ni service_role, ni tokens, ni
  claves privadas) en todo el repo. OK.
- Frontend sin patrones peligrosos (nada de eval, innerHTML, etc.). OK.
- Advisor de Supabase: se cerro el unico WARN real (search_path fijo en 3 funciones).
  Los "RLS sin policy" son a proposito (deny-all): asi esta todo el proyecto.
- Nota menor (no bloquea): la extension pg_net quedo en el esquema public; no es
  explotable (nadie externo la puede llamar); moverla ahora arriesgaria el cron.

## Deploy (publicacion)
- Se subio todo a GitHub (rama main). Produccion es Render (render.yaml): hace
  pnpm install + pnpm build + migraciones + pnpm start, y sirve ariadgsm.com.
- Al hacer push a main, Render despliega solo.
- Verificacion: /api/health del servidor devuelve releaseCommit = el commit subido,
  y el bundle en vivo contiene las secciones nuevas. Confirmado EN VIVO.
- Los secretos no se suben (el .env esta ignorado). Render y Supabase ya tienen sus
  variables.

Detalle util para el futuro: Render genera un hash de archivos distinto al de la PC
local aunque el contenido sea el mismo. Para verificar si el deploy salio, conviene
mirar el CONTENIDO del bundle (o /api/health), no comparar el nombre del archivo.

## Lo unico que falta (operacion, no codigo)
1. Pasar de la cuenta Binance de PRUEBA (raugsm) a la cuenta REAL:
   - Cambiar en Vault binance_api_key y binance_api_secret por la clave de SOLO
     LECTURA de la cuenta real.
   - Cambiar en negocio.parametro binance_pay_url (link del QR) y binance_pay_id.
   - Es un solo cambio, sin re-desplegar nada.
2. Ir cargando el changelog de cada version (src/data/changelog.ts).
3. Cuando haya, cargar videos/testimonios reales (seccion de confianza) - se dejo
   sin inventar numeros.

## Como operar / mantener
- Retirar el USDT seguido a la Binance de Ariad (no dejar saldo acumulado).
- El vigia corre solo cada minuto; si algo falla, no pierde plata: deja los pagos
  raros en revision.
- La bitacora (esquema pago, tablas evento) permite auditar todo.

---
[Anterior](08-pasarela-frontend-qr.md) - [Indice](00-indice.md)
