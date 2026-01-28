<script setup lang="ts">
import { computed, type HTMLAttributes } from "vue";
import { Label as LabelPrimitive, type LabelProps } from "reka-ui";
import { cn } from "@/lib/utils";

interface Props extends LabelProps {
  class?: HTMLAttributes["class"];
}

const props = defineProps<Props>();

const classes = computed(() =>
  cn(
    "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
    props.class,
  ),
);
</script>

<template>
  <LabelPrimitive :class="classes" v-bind="props">
    <slot />
  </LabelPrimitive>
</template>
