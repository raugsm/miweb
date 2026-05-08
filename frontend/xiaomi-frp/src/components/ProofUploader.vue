<template>
  <div class="proof-uploader">
    <label class="file-zone" :class="{ loaded: previewUrl }">
      <input
        type="file"
        accept="image/*"
        capture="environment"
        @change="onFile"
      />
      <span v-if="!previewUrl">Toma foto o sube imagen del comprobante</span>
      <span v-else>{{ fileName }}</span>
    </label>

    <img v-if="previewUrl" class="proof-preview" :src="previewUrl" alt="Vista previa del comprobante" />

    <button class="primary-button" type="button" :disabled="busy || !proof" @click="$emit('upload', proof)">
      {{ busy ? "Subiendo..." : "Enviar comprobante" }}
    </button>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { proofFromFile } from "../api.js";

defineProps({
  busy: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["upload", "error"]);
const proof = ref(null);
const previewUrl = ref("");
const fileName = ref("");

async function onFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    proof.value = await proofFromFile(file);
    previewUrl.value = proof.value.dataUrl;
    fileName.value = file.name || "comprobante.jpg";
  } catch (error) {
    proof.value = null;
    previewUrl.value = "";
    fileName.value = "";
    emit("error", error.message || "Comprobante invalido.");
  }
}
</script>
