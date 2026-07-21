<script setup lang="ts">
withDefaults(defineProps<{
  at: number
  x: number
  y: number
  width: number
  height: number
  until?: number
  tone?: 'sky' | 'violet' | 'green' | 'amber' | 'red'
}>(), {tone: 'sky'})
</script>

<template>
  <div
    v-click="until ? [at, until] : at"
    class="uv-focus-ring"
    :class="`uv-focus-ring--${tone}`"
    :style="{left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px`}"
  />
</template>
