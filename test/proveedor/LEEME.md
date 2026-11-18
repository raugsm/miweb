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
```

- Los SQL se leen de `C:\private\AriTool_Recursos\db-diagramas\propuestas` (la fuente del equipo). Para cambiar la carpeta: variable `PROPUESTAS_DIR`.
- `npm run sql` usa por defecto la cadena que está en prod (compra → alertas-extra → oculta-motivo → saldo-v5) y el M1 real. Con `M1_SIMULADO=1` usa un M1 de juguete.
- `datos/vivo-ultima.json` es una copia real del catálogo del 18-nov (sin la llave ni el correo).
- Mapa de las 9 reglas de `completo-18nov.md` contra cada prueba: `ari-equipo/proveedor-alquiler/backend-web.md`.
