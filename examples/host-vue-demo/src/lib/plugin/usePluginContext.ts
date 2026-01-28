import { inject, type InjectionKey, type Component } from "vue";
import type { PluginController, ComponentRegistry } from "@uniview/host-sdk";

export interface PluginContextValue {
  controller: PluginController;
  registry: ComponentRegistry<Component>;
}

export const PluginContextKey: InjectionKey<PluginContextValue> =
  Symbol("uniview:plugin");

export function usePluginContext(): PluginContextValue {
  const context = inject(PluginContextKey);
  if (!context) {
    throw new Error("usePluginContext must be used within a PluginHost");
  }
  return context;
}
