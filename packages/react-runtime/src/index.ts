// Native props on intrinsic elements (`keyDownEvents`, `material`). Declared
// here, in the runtime a plugin actually imports, because React's own JSX types
// describe a browser and a native host reads more than a browser does.
import "./jsx";

export {
  createPluginRuntime,
  type PluginRuntime,
  type PluginRuntimeOptions,
} from "./runtime";
export {
  startWorkerPlugin,
  type StartWorkerPluginOptions,
} from "./worker-entry";
export {
  createWebSocketPluginClient,
  type WebSocketPluginClientOptions,
  type WebSocketPluginClient,
} from "./ws-client";
export {
  connectToHostServer,
  type ConnectToHostServerOptions,
} from "./ws-client-entry";
export {
  getHostEnvironment,
  setHostEnvironment,
  useColorScheme,
  useHostEnvironment,
} from "./environment";
