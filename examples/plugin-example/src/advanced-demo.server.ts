import { startWebSocketPluginServer } from "@uniview/react-runtime/ws-server";
import AdvancedDemo from "./advanced-demo";

startWebSocketPluginServer({
  App: AdvancedDemo,
  port: 3002,
});
