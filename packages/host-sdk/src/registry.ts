import type { ComponentRegistry, ComponentMetadata } from "./types";

interface RegistryEntry<T> {
  component: T;
  metadata?: ComponentMetadata;
}

export function createComponentRegistry<T>(): ComponentRegistry<T> {
  const entries = new Map<string, RegistryEntry<T>>();

  return {
    register(type: string, component: T, metadata?: ComponentMetadata): void {
      entries.set(type, { component, metadata });
    },

    get(type: string): T | undefined {
      return entries.get(type)?.component;
    },

    has(type: string): boolean {
      return entries.has(type);
    },

    list(): string[] {
      return Array.from(entries.keys());
    },

    clear(): void {
      entries.clear();
    },
  };
}
