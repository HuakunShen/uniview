import { startWebSocketPluginServer } from "@uniview/runtime/ws-server";
import AdvancedDemo from "./advanced-demo";

startWebSocketPluginServer({
  App: AdvancedDemo,
  port: 3002,
});
