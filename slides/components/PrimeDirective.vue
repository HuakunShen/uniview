<script setup lang="ts">
const props = withDefaults(defineProps<{ active?: number }>(), {active: 0})

const rules = [
  {title: 'Framework-agnostic', icon: '△', body: 'The protocol never learns React, Solid, Svelte, or Vue.'},
  {title: 'App-agnostic', icon: '□', body: 'A sidebar or command palette is plugin code—not a core primitive.'},
  {title: 'Brand-agnostic', icon: '○', body: 'The host paints the Style IR. The renderer invents no visual identity.'},
] as const
</script>

<template>
  <div class="uv-directive">
    <article
      v-for="(rule, index) in rules"
      :key="rule.title"
      class="uv-directive__rule"
      :class="{'is-active': props.active === 0 || props.active === index + 1, 'is-muted': props.active > 0 && props.active !== index + 1}"
    >
      <div class="uv-directive__icon">{{ rule.icon }}</div>
      <h3>{{ rule.title }}</h3>
      <p>{{ rule.body }}</p>
      <div class="uv-directive__zero">zero protocol change</div>
    </article>
  </div>
</template>
