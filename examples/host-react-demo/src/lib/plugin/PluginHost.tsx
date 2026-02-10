import {
  useEffect,
  useState,
  useRef,
  type ReactNode,
  type ComponentType,
} from "react";
import type { UINode } from "@uniview/protocol";
import type {
  PluginController,
  ComponentRegistry,
  TreeUpdate,
} from "@uniview/host-sdk";
import { PluginContext } from "./PluginContext";
import { ComponentRenderer } from "./ComponentRenderer";

interface PluginHostProps {
  controller: PluginController;
  registry: ComponentRegistry<ComponentType>;
  loading?: ReactNode;
}

export function PluginHost({ controller, registry, loading }: PluginHostProps) {
  const [tree, setTree] = useState<UINode | null>(null);
  const controllerRef = useRef(controller);

  useEffect(() => {
    setTree(null);
    controllerRef.current = controller;

    const isActiveController = () => controllerRef.current === controller;

    const unsubscribe = controller.subscribe((update: TreeUpdate) => {
      if (isActiveController()) {
        if (update.type === "full") {
          setTree(update.tree);
        }
        // For "mutations" type, we'd need to apply them to the current tree
        // For now, we ignore mutation updates (could be implemented later)
      }
    });

    controller.connect().catch((err) => {
      console.error("Failed to connect to plugin:", err);
    });

    return () => {
      unsubscribe();
      controller.disconnect();
    };
  }, [controller]);

  return (
    <PluginContext.Provider value={{ controller, registry }}>
      {tree ? (
        <ComponentRenderer node={tree} />
      ) : loading ? (
        loading
      ) : (
        <div>Loading...</div>
      )}
    </PluginContext.Provider>
  );
}
