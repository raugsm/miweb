<template>
  <section class="panel order-setup" aria-label="Crear pedido Xiaomi FRP">
    <div class="panel-heading">
      <p class="eyebrow">Xiaomi Reset + FRP</p>
      <h1>Procesa tu Xiaomi por sideload</h1>
      <p>Selecciona pais, cantidad y metodo de pago. El precio se congela por 10 minutos al crear el pedido.</p>
    </div>

    <div class="field-grid">
      <label>
        <span>Pais</span>
        <select :value="countryIso" @change="$emit('update:countryIso', $event.target.value)">
          <option value="">Seleccionar</option>
          <option v-for="country in countries" :key="country.iso" :value="country.iso">
            {{ country.name }}
          </option>
        </select>
      </label>

      <label>
        <span>Cantidad</span>
        <div class="quantity-control">
          <button type="button" @click="$emit('update:quantity', Math.max(1, quantity - 1))">-</button>
          <input
            :value="quantity"
            inputmode="numeric"
            pattern="[0-9]*"
            aria-label="Cantidad de procesos"
            @input="$emit('update:quantity', Number($event.target.value || 1))"
          />
          <button type="button" @click="$emit('update:quantity', quantity + 1)">+</button>
        </div>
      </label>
    </div>

    <PaymentMethodList
      :methods="paymentMethods"
      :selected="paymentMethod"
      @select="$emit('update:paymentMethod', $event)"
    />

    <label class="full-field">
      <span>WhatsApp</span>
      <input
        :value="whatsapp"
        inputmode="tel"
        autocomplete="tel"
        placeholder="+57 300 000 0000"
        @input="$emit('update:whatsapp', $event.target.value)"
      />
    </label>

    <div class="summary-strip" aria-live="polite">
      <div>
        <small>Total</small>
        <strong>{{ totalLabel }}</strong>
      </div>
      <div>
        <small>Incluye fee fijo</small>
        <strong>{{ feeLabel }}</strong>
      </div>
    </div>

    <button class="primary-button" type="button" :disabled="busy || !canSubmit" @click="$emit('submit')">
      {{ busy ? "Creando pedido..." : "Pagar" }}
    </button>
  </section>
</template>

<script setup>
import { computed } from "vue";
import { countries } from "../countries.js";
import PaymentMethodList from "./PaymentMethodList.vue";

const props = defineProps({
  countryIso: { type: String, default: "" },
  quantity: { type: Number, default: 1 },
  paymentMethod: { type: String, default: "" },
  whatsapp: { type: String, default: "" },
  paymentMethods: { type: Array, default: () => [] },
  quote: { type: Object, default: null },
  busy: { type: Boolean, default: false },
});

defineEmits([
  "update:countryIso",
  "update:quantity",
  "update:paymentMethod",
  "update:whatsapp",
  "submit",
]);

const totalLabel = computed(() => {
  if (!props.quote?.paymentAmount || !props.quote?.currency) return "Configura pais";
  return `${props.quote.paymentAmount} ${props.quote.currency}`;
});

const feeLabel = computed(() => `${Number(props.quote?.feeUsdt || 0).toFixed(2)} USDT`);
const canSubmit = computed(() => props.countryIso && props.paymentMethod && props.whatsapp.trim().length >= 7);
</script>
