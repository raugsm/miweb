# Pruebas de la compra al proveedor de alquiler (Ari-Web)

Todas corren en local: PGlite (Postgres en WebAssembly) y un **proveedor simulado** armado con el código público del proveedor (`mock/API-exacta.md`). No tocan el proveedor real ni producción.

```
npm install          # una vez: solo instala PGlite
npm run unidad       # lector del catálogo, el saldo y la cuenta (node:test)
npm run mock         # el proveedor simulado
npm run sql          # reglas de la compra en SQL, sobre la base y el M1 real de Ari-Master
npm run e2e          # el ciclo real de la edge (ciclo.ts / api_gsm.ts) contra el proveedor simulado
npm run alertas      # alertas #2, #3, #7 y #11 de p13
npm run taller       # el catálogo de un taller no se rompe con _oculta_motivo
npm run propias      # las 6 herramientas propias quedan IGUAL (antes = después), con el interruptor apagado y encendido
npm run arreglos     # lo publicado + compra-arreglos = la fuente nueva
```

- Los SQL se leen de `C:\private\AriTool_Recursos\db-diagramas\propuestas` (la fuente del equipo). Para cambiar la carpeta: variable `PROPUESTAS_DIR`.
- `npm run sql` usa por defecto la cadena que está en prod (compra → alertas-extra → oculta-motivo → saldo-v5) y el M1 real. Con `M1_SIMULADO=1` usa un M1 de juguete.
- `datos/vivo-ultima.json` es una copia real del catálogo del 18-nov (sin la llave ni el correo).
- `huella_propias.sql` (solo lectura, en prod): huella de las 6 propias para comparar antes y después de aplicar.
- Mapa de las 9 reglas de `completo-18nov.md` contra cada prueba: `ari-equipo/proveedor-alquiler/backend-web.md`.

## Cambios a la base (sop_proveedor de Ari-Web)

1. Copiar la fuente actual (`20261118-proveedor-compra.sql` = prod) como `20261118-proveedor-compra.publicada-<hora>Z.sql`. Es la base y el rollback.
2. Editar la fuente y correr las pruebas.
3. `python -I -X utf8 generar_delta.py <base> <delta.sql> "<qué trae>"`, y después `BASE=<base> DELTA=<delta.sql> npm run arreglos`. Tiene que dar 0 distintas.
4. Antes de aplicar, con OK de Peter en el chat de Ari-Web:
   - `DERIVA_DIR=<carpeta con la base como compra.sql> DERIVA_OUT=d.json node deriva.mjs`;
   - `python -I -X utf8 deriva_cmp.py C:/Users/peter/.claude/skills/ari-web/scripts/sql_api.py d.json`: prod tiene que ser igual a la base.
5. Aplicar con `sql_api.py < delta.sql`. Después correr la deriva contra la fuente: tiene que dar todo igual.
