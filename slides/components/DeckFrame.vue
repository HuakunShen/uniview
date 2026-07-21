<script setup lang="ts">
withDefaults(defineProps<{
  eyebrow: string
  title: string
  subtitle?: string
  chapter?: string
  page?: string
}>(), {
  subtitle: '',
  chapter: 'Uniview',
  page: '',
})
</script>

<template>
  <section class="uv-frame">
    <div class="uv-frame__glow" />
    <div class="uv-frame__topline">
      <span class="uv-frame__eyebrow">{{ eyebrow }}</span>
      <span class="uv-frame__chapter">{{ chapter }}</span>
    </div>
    <h1 class="uv-frame__title">{{ title }}</h1>
    <p v-if="subtitle" class="uv-frame__subtitle">{{ subtitle }}</p>
    <div class="uv-frame__body"><slot /></div>
    <div class="uv-frame__footer">
      <span>one tree · every surface</span>
      <span>{{ page }}</span>
    </div>
  </section>
</template>
