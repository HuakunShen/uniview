<script setup lang="ts">
import { computed } from "vue";
import { Toggle } from "@/lib/components/ui/toggle";

interface Props {
  pressed?: boolean;
  defaultPressed?: boolean;
  disabled?: boolean;
  variant?: "default" | "outline";
  size?: "default" | "sm" | "lg";
  class?: string;
  onClick?: () => void;
}

const props = defineProps<Props>();

// Use computed to directly reflect the controlled state from props
// The pressed state is fully controlled by the plugin via props.pressed
const pressedState = computed(
  () => props.pressed ?? props.defaultPressed ?? false,
);

// Handle user interaction - only fires when user clicks, not on prop changes
function handlePressedChange() {
  props.onClick?.();
}
</script>

<template>
  <Toggle
    :model-value="pressedState"
    :disabled="disabled"
    :variant="variant || 'default'"
    :size="size || 'default'"
    :class="$props.class"
    @update:model-value="handlePressedChange"
  >
    <slot />
  </Toggle>
</template>
