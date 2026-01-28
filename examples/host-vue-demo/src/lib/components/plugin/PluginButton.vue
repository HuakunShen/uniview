<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/lib/components/ui/button";

type PluginVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "destructive"
  | "ghost";
type ButtonVariant =
  | "default"
  | "secondary"
  | "outline"
  | "destructive"
  | "ghost"
  | "link";

const variantMap: Record<PluginVariant, ButtonVariant> = {
  primary: "default",
  secondary: "secondary",
  outline: "outline",
  destructive: "destructive",
  ghost: "ghost",
};

interface Props {
  title?: string;
  variant?: PluginVariant | ButtonVariant;
  disabled?: boolean;
  class?: string;
  onClick?: (...args: unknown[]) => void;
}

const props = withDefaults(defineProps<Props>(), {
  variant: "secondary",
});

const mappedVariant = computed(
  () =>
    variantMap[props.variant as PluginVariant] ??
    (props.variant as ButtonVariant),
);

function handleClick(event: Event) {
  props.onClick?.(event);
}
</script>

<template>
  <Button
    :variant="mappedVariant"
    :disabled="disabled"
    :class="$props.class"
    @click="handleClick"
  >
    <slot>{{ title }}</slot>
  </Button>
</template>
