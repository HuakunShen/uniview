<script setup lang="ts">
const props = withDefaults(defineProps<{ step?: number }>(), {step: 0})

const steps = [
  {label: 'Click', value: 'onClick()', detail: 'host receives native input'},
  {label: 'Lookup', value: 'h_7f2', detail: 'prop contains a handler ID'},
  {label: 'Execute', value: 'executeHandler()', detail: 'typed RPC returns to plugin'},
  {label: 'State', value: 'setCount()', detail: 'original function runs locally'},
  {label: 'Mutation', value: 'setText', detail: 'only the changed node returns'},
] as const
</script>

<template>
  <div class="uv-handler-journey">
    <template v-for="(item, index) in steps" :key="item.label">
      <article
        class="uv-handler-step"
        :class="{'is-reached': props.step === 0 || props.step >= index + 1, 'is-active': props.step === index + 1}"
      >
        <div class="uv-handler-step__number">0{{ index + 1 }}</div>
        <div class="uv-handler-step__label">{{ item.label }}</div>
        <code>{{ item.value }}</code>
        <p>{{ item.detail }}</p>
      </article>
      <div v-if="index < steps.length - 1" class="uv-handler-arrow" :class="{'is-reached': props.step === 0 || props.step > index + 1}">→</div>
    </template>
  </div>
</template>
