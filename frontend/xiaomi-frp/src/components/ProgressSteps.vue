<template>
  <ol class="progress-steps" aria-label="Progreso del pedido">
    <li v-for="item in items" :key="item.index" :class="{ active: item.index <= current }">
      <span>{{ item.index }}</span>
      <strong>{{ item.label }}</strong>
    </li>
  </ol>
</template>

<script setup>
defineProps({
  current: {
    type: Number,
    required: true,
  },
});

const items = [
  { index: 1, label: "Pedido" },
  { index: 2, label: "Pago" },
  { index: 3, label: "Verificacion" },
  { index: 4, label: "Conexion" },
  { index: 5, label: "Proceso" },
  { index: 6, label: "Listo" },
];
</script>
