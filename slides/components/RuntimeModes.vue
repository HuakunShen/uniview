<script setup lang="ts">
const props = withDefaults(defineProps<{ active?: number }>(), {active: 0})

const modes = [
  {title: 'Web Worker', env: 'Browser · full sandbox', icon: '⬡', body: 'Production path for untrusted plugins. No window. No document.'},
  {title: 'WebSocket bridge', env: 'Node · Deno · Bun', icon: '⇆', body: 'Plugin connects out as a client and can live in another process or machine.'},
  {title: 'Main thread', env: 'Browser · development', icon: '⚒', body: 'Zero isolation, fast local debugging, identical host controller surface.'},
] as const
</script>

<template>
  <div class="uv-runtimes">
    <article
      v-for="(mode, index) in modes"
      :key="mode.title"
      class="uv-runtime"
      :class="{'is-active': props.active === 0 || props.active === index + 1, 'is-muted': props.active > 0 && props.active !== index + 1}"
    >
      <div class="uv-runtime__icon">{{ mode.icon }}</div>
      <div class="uv-runtime__title">{{ mode.title }}</div>
      <div class="uv-runtime__env">{{ mode.env }}</div>
      <p>{{ mode.body }}</p>
      <div v-if="index === 0" class="uv-runtime__boundary">sandbox boundary</div>
      <div v-else-if="index === 1" class="uv-runtime__boundary">process boundary</div>
      <div v-else class="uv-runtime__boundary uv-runtime__boundary--warn">no boundary</div>
    </article>
  </div>
</template>
