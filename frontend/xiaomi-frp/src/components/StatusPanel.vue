<template>
  <section class="panel status-panel" :class="state" aria-live="polite">
    <div class="code-card compact">
      <small>Codigo</small>
      <strong>{{ order.code }}</strong>
    </div>

    <div v-if="state === 'verifying'" class="status-copy">
      <span class="spinner" aria-hidden="true"></span>
      <h2>Verificando pago...</h2>
      <p>No cierres esta pagina. Cuando el operador apruebe el comprobante, el estado cambia aqui.</p>
    </div>

    <div v-else-if="state === 'ready'" class="status-copy">
      <h2>Pago confirmado</h2>
      <a class="primary-button" href="/downloads/usbredirector-customer-module.exe" download>
        Descargar USB Redirector
      </a>
      <p>Abre USB Redirector, conecta tu Xiaomi en modo sideload, y en el campo nombre escribe: {{ order.code }}</p>
      <p v-if="order.remaining > 1">Tienes {{ order.remaining }} procesos disponibles.</p>
      <p v-if="order.status === 'EN_COLA'">Estas en cola. Te procesamos en breve.</p>
      <img class="redirector-shot" :src="redirectorImageUrl" alt="USB Redirector en Windows" />
    </div>

    <div v-else-if="state === 'processing'" class="status-copy">
      <span class="spinner" aria-hidden="true"></span>
      <h2>Tu equipo esta siendo desbloqueado</h2>
      <p>Espera menos de 1 minuto y no desconectes el cable.</p>
    </div>

    <div v-else-if="state === 'done'" class="status-copy">
      <h2>Servicio completado</h2>
      <p>Desconecta tu equipo.</p>
      <p v-if="order.remaining > 0">Te quedan {{ order.remaining }} procesos. Conecta el siguiente cuando estes listo.</p>
      <p v-else>Tu pedido esta completo.</p>
    </div>

    <div v-else class="status-copy">
      <h2>{{ title }}</h2>
      <p>{{ message }}</p>
      <a class="secondary-button" href="https://wa.me/51993357553" rel="nofollow">Escribir por WhatsApp</a>
    </div>
  </section>
</template>

<script setup>
import { computed } from "vue";
import { statusLabel } from "../order-state.js";

const props = defineProps({
  order: { type: Object, required: true },
  state: { type: String, required: true },
});

const redirectorImageUrl = "/images/redirector-screenshot.jpg";

const title = computed(() => statusLabel(props.order));
const message = computed(() => {
  if (props.order.status === "PAGO_RECHAZADO") {
    return props.order.paymentRejectedReason || "Sube otro comprobante o contactanos por WhatsApp.";
  }
  if (props.order.status === "REQUIERE_ATENCION") {
    return "El operador necesita revisar este caso antes de procesarlo.";
  }
  return "Si tienes un problema, contactanos por WhatsApp con tu codigo.";
});
</script>
