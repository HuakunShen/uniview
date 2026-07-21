<script setup lang="ts">
const props = withDefaults(defineProps<{ step?: number }>(), {step: 0})

const nodes = [
  {label: 'Plugin', detail: 'React / Solid', icon: '◇', tone: 'violet'},
  {label: 'Reconciler', detail: 'component tree → UINode', icon: '⌘', tone: 'sky'},
  {label: 'Typed RPC', detail: 'Mutation[] + handler calls', icon: '⇄', tone: 'amber'},
  {label: 'Host renderer', detail: 'DOM · TUI · AppKit', icon: '▣', tone: 'green'},
] as const
</script>

<template>
  <div class="uv-pipeline">
    <template v-for="(node, index) in nodes" :key="node.label">
      <article
        class="uv-pipeline__node"
        :class="[
          `uv-pipeline__node--${node.tone}`,
          {'is-reached': props.step === 0 || props.step >= index + 1, 'is-active': props.step === index + 1},
        ]"
      >
        <div class="uv-pipeline__icon">{{ node.icon }}</div>
        <div class="uv-pipeline__label">{{ node.label }}</div>
        <div class="uv-pipeline__detail">{{ node.detail }}</div>
      </article>
      <div
        v-if="index < nodes.length - 1"
        class="uv-pipeline__edge"
        :class="{'is-reached': props.step === 0 || props.step > index + 1}"
      >
        <span>{{ index === 1 ? 'RPC' : '' }}</span>
      </div>
    </template>
  </div>
</template>
