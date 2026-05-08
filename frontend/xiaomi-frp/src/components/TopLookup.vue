<template>
  <section class="lookup-bar" aria-label="Consultar pedido existente">
    <div>
      <p class="eyebrow">Ya tienes un codigo?</p>
      <h2>Continua tu pedido</h2>
    </div>
    <form class="lookup-form" @submit.prevent="submit">
      <label>
        <span>Codigo</span>
        <input
          v-model="code"
          inputmode="text"
          autocomplete="off"
          placeholder="AG-0247"
          maxlength="8"
          @input="code = code.toUpperCase()"
        />
      </label>
      <label>
        <span>WhatsApp</span>
        <input
          v-model="whatsapp"
          inputmode="tel"
          autocomplete="tel"
          placeholder="+51 999 888 777"
        />
      </label>
      <button class="secondary-button" type="submit">Ver estado</button>
    </form>
  </section>
</template>

<script setup>
import { ref } from "vue";

const emit = defineEmits(["lookup"]);
const code = ref("");
const whatsapp = ref("");

function submit() {
  emit("lookup", {
    code: code.value.trim().toUpperCase(),
    whatsapp: whatsapp.value.trim(),
  });
}
</script>
