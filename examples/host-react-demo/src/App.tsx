import {
  useState,
  useMemo,
  useEffect,
  useRef,
  type ComponentType,
} from "react";
import type { PluginController } from "@uniview/host-sdk";
import {
  createWorkerController,
  createWebSocketController,
  createMainController,
  createComponentRegistry,
} from "@uniview/host-sdk";
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

function App() {
  const [currentDemo, setCurrentDemo] = useState<DemoType>("simple");
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>("worker");

  const pluginUrl =
    currentDemo === "simple"
      ? "http://localhost:3000/simple-demo.worker.js"
      : "http://localhost:3000/advanced-demo.worker.js";

  const bridgeServerUrl = "ws://localhost:3000";

  const pluginId = currentDemo === "simple" ? "simple-demo" : "advanced-demo";

  const registry = useMemo(() => {
    const newRegistry = createComponentRegistry<ComponentType>();
    newRegistry.register("Button", PluginButton);
    newRegistry.register("Input", PluginInput);
    newRegistry.register("Switch", PluginSwitch);
    newRegistry.register("Toggle", PluginToggle);
    return newRegistry;
  }, []);

  const controllerRef = useRef<PluginController | null>(null);
  const [controller, setController] = useState<PluginController | null>(null);

  useEffect(() => {
    controllerRef.current?.disconnect();

    let newController: PluginController;
    if (runtimeMode === "worker") {
      newController = createWorkerController({ pluginUrl });
    } else if (runtimeMode === "node-server") {
      newController = createWebSocketController({
        serverUrl: bridgeServerUrl,
        pluginId,
      });
    } else {
      newController = createMainController({
        App: currentDemo === "simple" ? SimpleDemo : AdvancedDemo,
      });
    }

    controllerRef.current = newController;
    setController(newController);

    return () => {
      controllerRef.current?.disconnect();
      controllerRef.current = null;
    };
  }, [runtimeMode, currentDemo, pluginUrl, pluginId, bridgeServerUrl]);

  const getModeButtonClass = (mode: RuntimeMode) => {
    const baseClass =
      "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none";
    return runtimeMode === mode
      ? `${baseClass} bg-zinc-700 text-zinc-50 shadow-sm`
      : `${baseClass} text-zinc-400 hover:text-zinc-300`;
  };

  const getDemoButtonClass = (demo: DemoType) => {
    const baseClass =
      "inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none";
    return currentDemo === demo
      ? `${baseClass} bg-zinc-700 text-zinc-50 shadow-sm`
      : `${baseClass} text-zinc-400 hover:text-zinc-300`;
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8 space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-50">
              Uniview React Demo
            </h1>
            <p className="text-lg text-zinc-400">
              React plugins rendered in React via @uniview
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
            <div className="p-6">
              <div className="space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm font-medium text-zinc-400">
                    Runtime Mode:
                  </div>
                  <div className="flex gap-1 rounded-lg bg-zinc-800 p-1">
                    <button
                      className={getModeButtonClass("worker")}
                      onClick={() => setRuntimeMode("worker")}
                    >
                      <span className="text-base">⚡</span> Worker
                    </button>
                    <button
                      className={getModeButtonClass("node-server")}
                      onClick={() => setRuntimeMode("node-server")}
                    >
                      <span className="text-base">🖥️</span> Node.js
                    </button>
                    <button
                      className={getModeButtonClass("main-thread")}
                      onClick={() => setRuntimeMode("main-thread")}
                    >
                      <span className="text-base">🧵</span> Main
                    </button>
                  </div>
                </div>

                <div className="flex gap-1 rounded-lg bg-zinc-800 p-1">
                  <button
                    className={getDemoButtonClass("simple")}
                    onClick={() => setCurrentDemo("simple")}
                  >
                    Simple Demo
                  </button>
                  <button
                    className={getDemoButtonClass("advanced")}
                    onClick={() => setCurrentDemo("advanced")}
                  >
                    Advanced Demo
                  </button>
                </div>

                <div className="flex items-center gap-2 border-b border-zinc-800 pb-4">
                  <div className="h-3 w-3 rounded-full bg-red-500" />
                  <div className="h-3 w-3 rounded-full bg-yellow-500" />
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                  <span className="ml-4 font-mono text-sm text-zinc-500">
                    {runtimeMode === "worker"
                      ? pluginUrl
                      : runtimeMode === "node-server"
                        ? `${bridgeServerUrl}/host/${pluginId}`
                        : `${currentDemo}-demo.tsx (local)`}
                  </span>
                </div>

                <div className="min-h-[300px] rounded-lg bg-zinc-950/50 p-4">
                  {controller && (
                    <PluginHost
                      key={`${runtimeMode}-${currentDemo}`}
                      controller={controller}
                      registry={registry}
                      loading={
                        <div className="flex h-[200px] items-center justify-center">
                          <div className="flex items-center gap-3 text-zinc-500">
                            <svg
                              className="h-5 w-5 animate-spin"
                              viewBox="0 0 24 24"
                              fill="none"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              />
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              />
                            </svg>
                            <span>Loading plugin...</span>
                          </div>
                        </div>
                      }
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 space-y-2 text-center text-sm text-zinc-500">
            <p>Built with React 19 and @uniview</p>
            <p className="text-xs">
              {currentDemo === "simple"
                ? "Showing: Basic Button and Input components"
                : "Showing: Form, Switch, and Toggle components"}
            </p>
            {runtimeMode === "worker" && (
              <p className="text-xs text-violet-400">
                ⚡ React plugin running in Web Worker (sandboxed)
              </p>
            )}
            {runtimeMode === "node-server" && (
              <p className="text-xs text-purple-400">
                🖥️ React plugin running in Node.js (WebSocket)
              </p>
            )}
            {runtimeMode === "main-thread" && (
              <p className="text-xs text-emerald-400">
                🧵 React plugin running in Main Thread (direct)
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
