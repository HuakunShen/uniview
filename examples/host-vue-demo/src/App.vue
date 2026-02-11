<script setup lang="ts">
import { ref, computed, watch, type Component } from "vue";
import {
  createWorkerController,
  createWebSocketController,
  createMainController,
  createComponentRegistry,
} from "@uniview/host-sdk";
import type { PluginController } from "@uniview/host-sdk";
import { SimpleDemo, AdvancedDemo } from "@uniview/example-plugin";
import { PluginHost } from "@/lib/plugin";
import {
  PluginButton,
  PluginInput,
  PluginSwitch,
  PluginToggle,
} from "@/lib/components/plugin";

type DemoType = "simple" | "advanced";
type RuntimeMode = "worker" | "main-thread" | "node-server";

const currentDemo = ref<DemoType>("simple");
const runtimeMode = ref<RuntimeMode>("worker");

const pluginUrl = computed(() =>
  currentDemo.value === "simple"
    ? "http://localhost:3000/react/simple-demo.worker.js"
    : "http://localhost:3000/react/advanced-demo.worker.js",
);

const bridgeServerUrl = "ws://localhost:3000";

const pluginId = computed(() =>
  currentDemo.value === "simple" ? "simple-demo" : "advanced-demo",
);

const controllerConfig = computed(() => {
  const newRegistry = createComponentRegistry<Component>();
  newRegistry.register("Button", PluginButton);
  newRegistry.register("Input", PluginInput);
  newRegistry.register("Switch", PluginSwitch);
  newRegistry.register("Toggle", PluginToggle);

  let newController: PluginController;
  if (runtimeMode.value === "worker") {
    newController = createWorkerController({
      pluginUrl: pluginUrl.value,
    });
  } else if (runtimeMode.value === "node-server") {
    newController = createWebSocketController({
      serverUrl: bridgeServerUrl,
      pluginId: pluginId.value,
    });
  } else {
    newController = createMainController({
      App: currentDemo.value === "simple" ? SimpleDemo : AdvancedDemo,
    });
  }

  return { controller: newController, registry: newRegistry };
});

watch(
  () => controllerConfig.value,
  (_, oldConfig) => {
    if (oldConfig?.controller) {
      oldConfig.controller.disconnect();
    }
  },
);

const getModeButtonClass = (mode: RuntimeMode) => {
  const baseClass =
    "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none";
  return runtimeMode.value === mode
    ? `${baseClass} bg-zinc-700 text-zinc-50 shadow-sm`
    : `${baseClass} text-zinc-400 hover:text-zinc-300`;
};

const getDemoButtonClass = (demo: DemoType) => {
  const baseClass =
    "inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none";
  return currentDemo.value === demo
    ? `${baseClass} bg-zinc-700 text-zinc-50 shadow-sm`
    : `${baseClass} text-zinc-400 hover:text-zinc-300`;
};

const displayUrl = computed(() => {
  if (runtimeMode.value === "worker") return pluginUrl.value;
  if (runtimeMode.value === "node-server")
    return `${bridgeServerUrl}/host/${pluginId.value}`;
  return `${currentDemo.value}-demo.tsx (local)`;
});
</script>

<template>
  <div class="min-h-screen bg-zinc-950">
    <div class="container mx-auto px-4 py-8">
      <div class="mx-auto max-w-4xl">
        <div class="mb-8 space-y-2">
          <h1 class="text-3xl font-bold tracking-tight text-zinc-50">
            Uniview Vue Demo
          </h1>
          <p class="text-lg text-zinc-400">
            React plugins rendered in Vue via @uniview
          </p>
        </div>

        <div class="rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
          <div class="p-6">
            <div class="space-y-6">
              <div
                class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div class="text-sm font-medium text-zinc-400">
                  Runtime Mode:
                </div>
                <div class="flex gap-1 rounded-lg bg-zinc-800 p-1">
                  <button
                    :class="getModeButtonClass('worker')"
                    @click="runtimeMode = 'worker'"
                  >
                    <span class="text-base">⚡</span> Worker
                  </button>
                  <button
                    :class="getModeButtonClass('node-server')"
                    @click="runtimeMode = 'node-server'"
                  >
                    <span class="text-base">🖥️</span> Node.js
                  </button>
                  <button
                    :class="getModeButtonClass('main-thread')"
                    @click="runtimeMode = 'main-thread'"
                  >
                    <span class="text-base">🧵</span> Main
                  </button>
                </div>
              </div>

              <div class="flex gap-1 rounded-lg bg-zinc-800 p-1">
                <button
                  :class="getDemoButtonClass('simple')"
                  @click="currentDemo = 'simple'"
                >
                  Simple Demo
                </button>
                <button
                  :class="getDemoButtonClass('advanced')"
                  @click="currentDemo = 'advanced'"
                >
                  Advanced Demo
                </button>
              </div>

              <div
                class="flex items-center gap-2 border-b border-zinc-800 pb-4"
              >
                <div class="h-3 w-3 rounded-full bg-red-500" />
                <div class="h-3 w-3 rounded-full bg-yellow-500" />
                <div class="h-3 w-3 rounded-full bg-green-500" />
                <span class="ml-4 font-mono text-sm text-zinc-500">
                  {{ displayUrl }}
                </span>
              </div>

              <div class="min-h-[300px] rounded-lg bg-zinc-950/50 p-4">
                <PluginHost
                  :key="`${runtimeMode}-${currentDemo}`"
                  :controller="controllerConfig.controller"
                  :registry="controllerConfig.registry"
                >
                  <template #loading>
                    <div class="flex h-[200px] items-center justify-center">
                      <div class="flex items-center gap-3 text-zinc-500">
                        <svg
                          class="h-5 w-5 animate-spin"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            class="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            stroke-width="4"
                          />
                          <path
                            class="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        <span>Loading plugin...</span>
                      </div>
                    </div>
                  </template>
                </PluginHost>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-8 space-y-2 text-center text-sm text-zinc-500">
          <p>Built with Vue 3 and @uniview</p>
          <p class="text-xs">
            {{
              currentDemo === "simple"
                ? "Showing: Basic Button and Input components"
                : "Showing: Form, Switch, and Toggle components"
            }}
          </p>
          <p v-if="runtimeMode === 'worker'" class="text-xs text-violet-400">
            ⚡ React plugin running in Web Worker (sandboxed)
          </p>
          <p
            v-else-if="runtimeMode === 'node-server'"
            class="text-xs text-purple-400"
          >
            🖥️ React plugin running in Node.js (WebSocket)
          </p>
          <p v-else class="text-xs text-emerald-400">
            🧵 React plugin running in Main Thread (direct)
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
