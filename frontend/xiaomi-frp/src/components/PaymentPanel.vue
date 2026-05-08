<template>
  <section class="panel payment-panel" aria-label="Datos de pago">
    <div class="code-card">
      <small>Tu codigo</small>
      <strong>{{ order.code }}</strong>
      <p>Guardalo. Si lo pierdes, pidelo por WhatsApp.</p>
    </div>

    <div class="payment-details">
      <div>
        <p class="eyebrow">Paga exacto</p>
        <h2>{{ order.paymentAmount }} {{ order.currency }}</h2>
        <p>{{ method?.displayName || order.paymentLabel }}</p>
      </div>
      <img v-if="method?.qrImageUrl" :src="method.qrImageUrl" alt="QR del metodo de pago" />
    </div>

    <dl class="method-fields">
      <template v-for="field in methodFields" :key="field.label">
        <dt>{{ field.label }}</dt>
        <dd>{{ field.value }}</dd>
      </template>
    </dl>

    <p class="checklist-note">
      El comprobante debe mostrar monto, fecha, numero de operacion y destinatario.
    </p>

    <ProofUploader :busy="busy" @upload="$emit('upload', $event)" @error="$emit('error', $event)" />
  </section>
</template>

<script setup>
import { computed } from "vue";
import ProofUploader from "./ProofUploader.vue";

const props = defineProps({
  order: { type: Object, required: true },
  methods: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
});

defineEmits(["upload", "error"]);

const method = computed(() => props.methods.find((entry) => entry.code === props.order.paymentMethod));
const methodFields = computed(() => {
  const selected = method.value;
  if (!selected) return [];
  return Array.isArray(selected.fields) && selected.fields.length
    ? selected.fields
    : Array.isArray(selected.details) ? selected.details : [];
});
</script>
