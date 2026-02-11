import { connectToHostServer } from "@uniview/react-runtime/ws-client";
import AdvancedDemo from "./advanced-demo";

connectToHostServer({
  App: AdvancedDemo,
  serverUrl: "ws://localhost:3000",
  pluginId: "advanced-demo",
});
