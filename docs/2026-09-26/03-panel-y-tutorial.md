# 03 - Panel del tecnico + tutorial de bienvenida

Archivo principal: src/pages/DashboardPage.tsx.

## Rediseno del panel
- Saldo destacado (tarjeta con brillo) con los creditos disponibles.
- Tarjetas de resumen con iconos y micro-interaccion al pasar el mouse: Procesos,
  Consumidos, Recargados, Estado.
- Animaciones de entrada suaves al cargar (con tw-animate-css).
- Boton Actualizar que gira mientras carga, y boton Ver tutorial.
- Gramatica dinamica corregida (1 credito vs 2 creditos).
- "Descargar app" apunta a la ruta correcta /descargas.

## Tutorial de bienvenida (onboarding)
Componente nuevo: src/components/OnboardingTour.tsx. Es un tour tipo spotlight:
oscurece la pantalla e ilumina cada parte con una tarjeta que explica que es y para
que. Pasos: Creditos, Recargar, Descargar, Resumen, Como se trabaja, Historial.

- Sin librerias externas: ubica cada elemento por su id y lo mide con
  getBoundingClientRect.
- Aparece una sola vez: se marca como visto al abrirse (no al cerrarse) y se guarda
  en el navegador (localStorage: ariad-tour-panel-v1), mas un candado en memoria.
  Asi no reaparece aunque recargue o vuelva a entrar.
- Para verlo de nuevo cuando quiera, esta el boton Ver tutorial.

## Dos bugs que se corrigieron de raiz
1. Saldo mostraba 0 pero abajo decia "tenes para 11 procesos". Causa: un contador
   animado (CountUp) se montaba antes de tiempo y quedaba en 0. Fix: mostrar el
   numero real directo. Regla: no usar contador animado con un valor que cambia
   dinamicamente.
2. El tutorial salia a cada rato. Causa: se marcaba visto al cerrarlo. Fix: marcarlo
   al abrirlo + candado en memoria; sale una sola vez.

---
[Anterior](02-web-ari-tool.md) - [Indice](00-indice.md) - [Siguiente: Como funciona](04-pasarela-como-funciona.md)
