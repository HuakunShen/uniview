import { connectToHostServer } from "@uniview/react-runtime/ws-client";
import AdvancedDemo from "./advanced-demo";

connectToHostServer({
  App: AdvancedDemo,
  serverUrl: "ws://127.0.0.1:3000",
  pluginId: "advanced-demo",
});
