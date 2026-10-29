# Auditoría de seguridad — 29-oct-2026

**Alcance:** web `miweb` (React/Vite + `server.js`), Supabase prod A (`sdarsjdwnuimjruthjwz`), Edge Functions, Postgres/RLS, Storage, dependencias y perímetro Cloudflare/Render.

**Modo:** revisión y pruebas controladas, sin ataques destructivos ni DDoS real. No se publicó nada en producción desde la web; los cambios de base sí se aplicaron.

## Crítico — corregido

1. **RPC administrativas ejecutables por `anon`.** El proyecto tenía 35 funciones `SECURITY DEFINER` ejecutables por el rol anónimo en esquemas expuestos (`pago`, `sop_frp`, `sop_config`, etc.). Varias permitían confirmar pagos, leer fichas de pago, banear pagadores o asignar huérfanos sin sesión.
   - Se revocó `PUBLIC`/`anon` y se dejó el rol mínimo.
   - Quedan 6 funciones anónimas deliberadas: cierre de caso del cliente, versión pública, métodos de pago públicos y `es_g3_tecnico`.
2. **Funciones del panel sin control de capacidad.** `pago.validar_confirmar`, `sop_frp.pago_ficha`, `pago_candidatos`, `pagador_banear`, `conciliacion_auditoria` y `pendientes_de_servir` se podían invocar con cualquier JWT `authenticated`. Ahora exigen `sop_frp.gestion`/`config.gestion` (o `service_role`).
3. **Reserva de liberación cruzada.** `sop_frp.liberacion_reservar` aceptaba un `p_taller_uid` ajeno. Ahora exige que coincida con `auth.uid()` salvo `service_role`.
4. **Credenciales Postgres en documentación.** `docs/specs/_sesion-19-postgres-fase-1-gate.md` contenía una URL de Postgres con usuario/clave. Se reemplazó por placeholders, pero **sigue en el historial de Git**: hay que rotar la clave del Postgres de Render y actualizar `DATABASE_URL`.

## Alto / medio — mitigado o pendiente

- **Registro directo de Supabase:** estaba habilitado. Se desactivó (`disable_signup=true`); el alta sigue por `acceso_solicitar` (admin API).
- **Dependencias:** `nodemailer` se actualizó a 10.2.1; Vite a 8.3.5; Tailwind/shadcn pasaron a dev. `pnpm audit --prod` quedó en **0 vulnerabilidades**. El toolchain de desarrollo conserva avisos de `shadcn` (no runtime).
- **Storage:** buckets privados sin límite de tamaño/MIME. Se fijaron 10–15 MB y JPEG/PNG/WebP/PDF en `app_cuenta_mi`, `comprobante` y `payment-proofs`.
- **Origen/IP:** se eliminó el `Host` dinámico del allowlist de CORS y se prioriza `cf-connecting-ip`/última IP de `X-Forwarded-For` para rate limit. Permanecen CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Permissions-Policy`.
- **Cloudflare/Render:** el dominio está detrás de Cloudflare (NS Cloudflare, `CF-RAY`, `Server: cloudflare`) y Render; hay protección de red. Falta WAF/rate limit específico para login y webhooks.
- **Backups:** Supabase tiene backups físicos diarios (`walg_enabled=true`), pero **PITR está apagado**. El Postgres de Render y el disco de 1 GB no muestran backup declarado en `render.yaml`; Storage no se respalda con la base. Para ransomware falta copia offsite/inmutable y prueba de restore.
- **Supabase Auth:** `mailer_autoconfirm=false`, rate limits activos, contraseña mínima 8; captcha deshabilitado. Recomendado subir mínimo a 12 y activar captcha/WAF.
- **Advisors residuales:** 142 tablas con RLS y sin policies son deny-all (intencional); 3 vistas `SECURITY DEFINER` son catálogos públicos; 32 funciones con `search_path` mutable son casi todas `SECURITY INVOKER`; extensiones en `public` (pg_net/pg_trgm/unaccent) sin impacto directo.

## Cambios aplicados

- Migraciones: `20261029233000_endurecer_funciones_anon.sql`, `20261029233100_guard_panel_funciones.sql`, `20261029234000_storage_limites.sql`, `20261029235000_liberacion_reservar_auth.sql`.
- Auth: `disable_signup=true` en Supabase.
- Código local: `server.js`, `package.json`, `pnpm-lock.yaml`, documentación saneada.
- Verificación: `pnpm audit --prod` 0; `pnpm build` OK; `pnpm test` 126/126.

## Acciones que requieren a Peter

1. Rotar la clave del Postgres de Render y actualizar `DATABASE_URL` (la vieja quedó en el historial de Git).
2. Evaluar PITR de Supabase y backups offsite del Postgres/disco de Render y de los buckets.
3. Activar WAF/rate limit de Cloudflare para `/api/login`, `/api/register`, `/api/password-reset` y webhooks; MFA en GitHub/Render/Supabase/Cloudflare.
4. Publicar los cambios de web/server (el push sigue bloqueado por credenciales GitHub de `Petryx27`).
