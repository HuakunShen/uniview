<script setup lang="ts">
import { computed, type HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

interface Props {
  defaultValue?: string | number;
  modelValue?: string | number;
  class?: HTMLAttributes["class"];
}

const props = defineProps<Props>();

const emits = defineEmits<{
  "update:modelValue": [value: string | number];
}>();

const classes = computed(() =>
  cn(
    "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
    props.class,
  ),
);
</script>

<template>
  <input
    :class="classes"
    :value="modelValue"
    @input="
      emits('update:modelValue', ($event.target as HTMLInputElement).value)
    "
  />
</template>
