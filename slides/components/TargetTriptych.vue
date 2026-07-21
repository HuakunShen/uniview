<script setup lang="ts">
const props = withDefaults(defineProps<{ active?: number }>(), {active: 0})

const targets = [
  {
    title: 'DOM hosts',
    badge: 'AVAILABLE',
    detail: 'Svelte · Vue · React',
    art: 'browser',
    note: 'Native elements and local hover / focus / scroll',
  },
  {
    title: 'Terminal',
    badge: 'AVAILABLE',
    detail: 'React · Solid',
    art: 'terminal',
    note: 'Cells, styled text, Yoga layout, sub-cell charts',
  },
  {
    title: 'AppKit',
    badge: 'EXPERIMENTAL',
    detail: 'Native macOS',
    art: 'window',
    note: 'NSView tree with stable-id reconciliation',
  },
] as const
</script>

<template>
  <div class="uv-targets">
    <article
      v-for="(target, index) in targets"
      :key="target.title"
      class="uv-target"
      :class="{'is-active': props.active === 0 || props.active === index + 1, 'is-muted': props.active > 0 && props.active !== index + 1}"
    >
      <div class="uv-target__top">
        <span class="uv-target__badge" :class="{'is-experimental': index === 2}">{{ target.badge }}</span>
        <span class="uv-target__index">0{{ index + 1 }}</span>
      </div>
      <div class="uv-target__art" :class="`uv-target__art--${target.art}`">
        <template v-if="target.art === 'browser'">
          <span class="dot dot--red" /><span class="dot dot--amber" /><span class="dot dot--green" />
          <div class="mini-sidebar" /><div class="mini-content"><i /><i /><i /></div>
        </template>
        <template v-else-if="target.art === 'terminal'">
          <code>&gt; uniview<br><b>CPU</b> ███████░ 78%<br><b>MEM</b> █████░░░ 53%</code>
        </template>
        <template v-else>
          <div class="native-sidebar"><i /><i /><i /></div><div class="native-content"><b>Commands</b><span /><span /></div>
        </template>
      </div>
      <h3>{{ target.title }}</h3>
      <div class="uv-target__detail">{{ target.detail }}</div>
      <p>{{ target.note }}</p>
    </article>
  </div>
</template>
