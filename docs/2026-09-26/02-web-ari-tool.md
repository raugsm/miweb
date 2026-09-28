# 02 - Web Ari-Tool (secciones nuevas)

La web es una SPA (React + Vite + TypeScript + Tailwind). La portada tenia pocas
secciones; se agregaron las que pedia el mercado (comparando con Chimera, TR Tools,
DFT, Pandora).

## Lo que se agrego, paso a paso

### 1. Datos (una sola fuente de verdad)
En src/data/product.ts se agregaron bloques: pricing (precios), features
(caracteristicas por categoria), devices (marcas/modelos) y faqs. Y
src/data/changelog.ts con el historial de versiones. Asi el contenido se edita en
un solo lugar, sin tocar el diseno.

### 2. Secciones nuevas de la portada (src/components/sections/)
- Precios (PricingSection.tsx): dos planes - Creditos (1 USD = 1 proceso,
  recomendado) y Licencia (25 USD, proximamente).
- Caracteristicas (FeaturesSection.tsx): 6 bloques (Security Plugin, AntiCrack,
  Flasheo/ROM, Catalogo, Cobertura, App de escritorio).
- Dispositivos (DevicesSection.tsx): 424 modelos, 3 marcas (Tecno/Infinix/itel),
  Android 12-16, chipset MediaTek, con modelos verificados.
- FAQ (FaqSection.tsx): preguntas comunes (activacion, pago, cambio de PC,
  reembolsos, requisitos, licencia) en acordeon.

Orden en la portada (src/pages/HomePage.tsx): Hero, Producto, Caracteristicas,
Dispositivos, Precios, Guia, FAQ, Soporte.

### 3. Pagina de descarga con changelog
src/pages/DownloadPage.tsx en la ruta /descargas: muestra la version en vivo (la
toma del servidor), el boton de descarga, los requisitos, y el changelog.

OJO con la ruta: /descargar (singular) YA existia y baja el instalador del cliente
AriadGSM (otro producto). Por eso la pagina de Ari-Tool va en /descargas (plural).
No mezclar.

### 4. Menu y pie actualizados
Se agregaron los enlaces (Precios, Dispositivos, Descargar, FAQ) al encabezado
(SiteHeader.tsx), al menu movil (MobileMenu.tsx) y al pie (SiteFooter.tsx).

## Correccion importante de precio
El texto viejo decia "5 creditos = 5 USD". Se corrigio en todos lados a
1 credito = 1 USD = 1 proceso (el modelo real).

## Correcciones de texto (que estaban mal)
- Cambiar de PC: se puede, pero procesar siempre descuenta creditos; cambiar de PC
  no da procesos gratis.
- Licencia: se quito "procesos sin limite" (no aplica). La licencia no reemplaza a
  los creditos.

---
[Anterior](01-vision-general.md) - [Indice](00-indice.md) - [Siguiente: Panel](03-panel-y-tutorial.md)
