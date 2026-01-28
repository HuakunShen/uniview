<script setup lang="ts">
import { computed } from "vue";
import { Switch } from "@/lib/components/ui/switch";

interface Props {
  id?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  class?: string;
  onChange?: (checked: boolean) => void;
}

const props = defineProps<Props>();

// Use computed to directly reflect the controlled state from props
// The checked state is fully controlled by the plugin via props.checked
const checkedState = computed(
  () => props.checked ?? props.defaultChecked ?? false,
);

// Handle user interaction - only fires when user clicks, not on prop changes
function handleCheckedChange(newChecked: boolean) {
  props.onChange?.(newChecked);
}
</script>

<template>
  <Switch
    :id="id"
    :model-value="checkedState"
    :disabled="disabled"
    :class="$props.class"
    @update:model-value="handleCheckedChange"
  />
</template>
