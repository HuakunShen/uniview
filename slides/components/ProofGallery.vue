<script setup lang="ts">
const props = withDefaults(defineProps<{ active?: number }>(), {active: 0})

const shots = [
  {title: 'htop', file: 'htop-react.svg', framework: 'React'},
  {title: 'lazygit', file: 'lazygit-react.svg', framework: 'React'},
  {title: 'charts', file: 'charts-react.svg', framework: 'React'},
  {title: '2048 + AI', file: '2048-solid.svg', framework: 'Solid'},
  {title: 'scope', file: 'scope-react.svg', framework: 'React'},
  {title: 'image', file: 'image-react.svg', framework: 'React'},
] as const
</script>

<template>
  <div class="uv-gallery">
    <article
      v-for="(shot, index) in shots"
      :key="shot.title"
      class="uv-shot"
      :class="{'is-active': props.active === 0 || props.active === index + 1, 'is-muted': props.active > 0 && props.active !== index + 1}"
    >
      <header>
        <span><i class="dot dot--red" /><i class="dot dot--amber" /><i class="dot dot--green" /></span>
        <code>{{ shot.title }}</code>
        <b>{{ shot.framework }}</b>
      </header>
      <div class="uv-shot__image"><img :src="`/tui/${shot.file}`" :alt="`${shot.title} renderer snapshot`"></div>
    </article>
  </div>
</template>
