<template>
  <div class="payment-list" role="radiogroup" aria-label="Metodos de pago">
    <button
      v-for="method in methods"
      :key="method.code"
      type="button"
      class="payment-option"
      :class="{ selected: method.code === selected }"
      role="radio"
      :aria-checked="method.code === selected"
      @click="$emit('select', method.code)"
    >
      <span>
        <strong>{{ method.displayName || method.label }}</strong>
        <small>{{ method.country || "Internacional" }} · {{ method.currency }}</small>
      </span>
      <span class="select-dot" aria-hidden="true"></span>
    </button>
  </div>
</template>

<script setup>
defineProps({
  methods: {
    type: Array,
    default: () => [],
  },
  selected: {
    type: String,
    default: "",
  },
});

defineEmits(["select"]);
</script>
