<script setup lang="ts">
import { Input } from "@/lib/components/ui/input";
import { Label } from "@/lib/components/ui/label";

interface Props {
  id?: string;
  label?: string;
  placeholder?: string;
  type?: string;
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
  class?: string;
  onInput?: (...args: unknown[]) => void;
  onChange?: (...args: unknown[]) => void;
}

const props = defineProps<Props>();

const inputId = props.id || `input-${Math.random().toString(36).slice(2, 9)}`;

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement;
  props.onInput?.(target.value);
  props.onChange?.(target.value);
}
</script>

<template>
  <div class="space-y-2">
    <Label v-if="label" :for="inputId">{{ label }}</Label>
    <Input
      :id="inputId"
      :type="type || 'text'"
      :placeholder="placeholder"
      :model-value="value"
      :default-value="defaultValue"
      :disabled="disabled"
      :class="$props.class"
      @input="handleInput"
    />
  </div>
</template>
