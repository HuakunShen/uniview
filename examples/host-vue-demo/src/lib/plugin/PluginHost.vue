<script setup lang="ts">
import { ref, provide, watch, onUnmounted, type Component } from "vue";
import type { UINode } from "@uniview/protocol";
import type { PluginController, ComponentRegistry } from "@uniview/host-sdk";
import { PluginContextKey } from "./usePluginContext";
import ComponentRenderer from "./ComponentRenderer.vue";

interface Props {
  controller: PluginController;
  registry: ComponentRegistry<Component>;
}

const props = defineProps<Props>();

const tree = ref<UINode | null>(null);
let unsubscribe: (() => void) | null = null;

// Use reactive provide that updates when props change
provide(PluginContextKey, {
  get controller() {
    return props.controller;
  },
  get registry() {
    return props.registry;
  },
});

async function initController() {
  // Reset tree when controller changes
  tree.value = null;

  // Subscribe to tree updates
  unsubscribe = props.controller.subscribe((newTree) => {
    tree.value = newTree;
  });

  // Connect to plugin
  try {
    await props.controller.connect();
  } catch (err) {
    console.error("Failed to connect to plugin:", err);
  }
}

function cleanupController() {
  unsubscribe?.();
  unsubscribe = null;
  props.controller.disconnect();
}

// Watch for controller changes and reinitialize
watch(
  () => props.controller,
  async (newController, oldController) => {
    if (oldController && oldController !== newController) {
      // Cleanup old controller - but the old one might already be disconnected
      // The parent component handles disconnect via watch
    }
    await initController();
  },
  { immediate: true },
);

onUnmounted(() => {
  cleanupController();
});
</script>

<template>
  <div v-if="tree">
    <ComponentRenderer :node="tree" />
  </div>
  <div v-else>
    <slot name="loading">
      <div>Loading...</div>
    </slot>
  </div>
</template>
