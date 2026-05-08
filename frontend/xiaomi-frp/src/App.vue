<template>
  <main class="app-shell">
    <header class="hero">
      <img :src="logoUrl" alt="AriadGSM" />
      <div>
        <p class="eyebrow">Xiaomi Reset + FRP por sideload</p>
        <h1>Desbloqueo guiado en vivo</h1>
        <p>Pagas, subes comprobante y sigues tu codigo AG sin salir de esta pagina.</p>
      </div>
    </header>

    <TopLookup @lookup="handleLookup" />
    <ProgressSteps :current="stepIndex(currentState)" />

    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <OrderSetup
      v-if="currentState === 'setup'"
      v-model:country-iso="countryIso"
      v-model:quantity="quantity"
      v-model:payment-method="paymentMethod"
      v-model:whatsapp="whatsapp"
      :payment-methods="paymentMethods"
      :quote="quote"
      :busy="busy"
      @submit="submitOrder"
    />

    <PaymentPanel
      v-else-if="currentState === 'payment'"
      :order="order"
      :methods="paymentMethods"
      :busy="busy"
      @upload="submitProof"
      @error="setError"
    />

    <StatusPanel
      v-else
      :order="order"
      :state="currentState"
    />

    <footer class="footer-note">
      <span>Procesa un equipo a la vez.</span>
      <span>Si algo falla por nuestro lado, puedes pedir reembolso.</span>
    </footer>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  createOrder,
  fetchBootstrap,
  fetchOrder,
  openOrderEvents,
  requestCodeRecovery,
  uploadPaymentProof,
} from "./api.js";
import { normalizeCountryIso } from "./countries.js";
import { flowState, orderTokenKey, stepIndex } from "./order-state.js";
import OrderSetup from "./components/OrderSetup.vue";
import PaymentPanel from "./components/PaymentPanel.vue";
import ProgressSteps from "./components/ProgressSteps.vue";
import StatusPanel from "./components/StatusPanel.vue";
import TopLookup from "./components/TopLookup.vue";

const countryIso = ref("");
const quantity = ref(1);
const paymentMethod = ref("");
const whatsapp = ref("");
const paymentMethods = ref([]);
const quote = ref(null);
const order = ref(null);
const token = ref("");
const busy = ref(false);
const error = ref("");
const notice = ref("");
const logoUrl = "/ariadgsm-logo-cropped.png";
let events = null;
let bootstrapTimer = null;

const currentState = computed(() => flowState(order.value));

function setError(message) {
  error.value = message;
  notice.value = "";
}

function setNotice(message) {
  notice.value = message;
  error.value = "";
}

function closeEvents() {
  if (events) events.close();
  events = null;
}

function syncUrl(nextOrder, nextToken) {
  const url = `/pedido/${nextOrder.code}?t=${encodeURIComponent(nextToken)}`;
  window.history.replaceState({}, "", url);
  document.title = `${nextOrder.code} | Xiaomi FRP AriadGSM`;
}

function startEvents(nextOrder, nextToken) {
  closeEvents();
  events = openOrderEvents(nextOrder.code, nextToken, (updatedOrder) => {
    order.value = updatedOrder;
  }, setNotice);
}

async function loadBootstrap() {
  try {
    const data = await fetchBootstrap({
      countryIso: countryIso.value,
      quantity: quantity.value,
      paymentMethod: paymentMethod.value,
    });
    countryIso.value ||= normalizeCountryIso(data.countryIso || data.detectedCountryIso);
    paymentMethods.value = data.paymentMethods || [];
    quote.value = data.price || null;
    if (!paymentMethods.value.some((method) => method.code === paymentMethod.value)) {
      paymentMethod.value = paymentMethods.value[0]?.code || "";
    }
  } catch (err) {
    setError(err.message || "No se pudo cargar precio.");
  }
}

function scheduleBootstrap() {
  window.clearTimeout(bootstrapTimer);
  bootstrapTimer = window.setTimeout(loadBootstrap, 150);
}

async function submitOrder() {
  busy.value = true;
  try {
    const data = await createOrder({
      whatsapp: whatsapp.value,
      countryIso: countryIso.value,
      quantity: quantity.value,
      paymentMethod: paymentMethod.value,
    });
    order.value = data.order;
    token.value = data.access.token;
    localStorage.setItem(orderTokenKey(order.value.code), token.value);
    syncUrl(order.value, token.value);
    startEvents(order.value, token.value);
    setNotice("Pedido creado. Sube el comprobante despues de pagar.");
  } catch (err) {
    setError(err.message || "No se pudo crear el pedido.");
  } finally {
    busy.value = false;
  }
}

async function submitProof(proof) {
  busy.value = true;
  try {
    const data = await uploadPaymentProof(order.value.code, token.value, proof);
    order.value = data.order;
    setNotice("Comprobante enviado. Estamos verificando el pago.");
  } catch (err) {
    setError(err.message || "No se pudo subir el comprobante.");
  } finally {
    busy.value = false;
  }
}

async function handleLookup({ code, whatsapp: lookupWhatsapp }) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!/^AG-\d{4,5}$/.test(normalized)) {
    setError("Escribe un codigo AG valido.");
    return;
  }
  const storedToken = localStorage.getItem(orderTokenKey(normalized));
  if (storedToken) {
    await openExistingOrder(normalized, storedToken);
    return;
  }
  if (!lookupWhatsapp) {
    setError("Escribe tu WhatsApp para pedir recuperacion del enlace.");
    return;
  }
  await requestCodeRecovery({ code: normalized, whatsapp: lookupWhatsapp });
  setNotice("Si coincide, el operador te enviara el enlace por WhatsApp.");
}

async function openExistingOrder(code, nextToken) {
  busy.value = true;
  try {
    const data = await fetchOrder(code, nextToken);
    order.value = data.order;
    token.value = nextToken;
    syncUrl(order.value, token.value);
    startEvents(order.value, token.value);
  } catch (err) {
    setError(err.message || "No se pudo abrir el pedido.");
  } finally {
    busy.value = false;
  }
}

async function restoreFromUrl() {
  const match = window.location.pathname.match(/^\/pedido\/(AG-\d{4,5})$/i);
  const urlToken = new URLSearchParams(window.location.search).get("t");
  if (match && urlToken) await openExistingOrder(match[1].toUpperCase(), urlToken);
}

watch([countryIso, quantity, paymentMethod], scheduleBootstrap);

onMounted(async () => {
  await loadBootstrap();
  await restoreFromUrl();
});

onBeforeUnmount(closeEvents);
</script>
