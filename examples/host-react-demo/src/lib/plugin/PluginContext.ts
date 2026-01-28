import { createContext, useContext } from "react";
import type { PluginController, ComponentRegistry } from "@uniview/host-sdk";
import type { ComponentType } from "react";

interface PluginContextValue {
  controller: PluginController;
  registry: ComponentRegistry<ComponentType>;
}

export const PluginContext = createContext<PluginContextValue | null>(null);

export function usePluginContext() {
  const context = useContext(PluginContext);
  if (!context) {
    throw new Error("usePluginContext must be used within a PluginHost");
  }
  return context;
}
