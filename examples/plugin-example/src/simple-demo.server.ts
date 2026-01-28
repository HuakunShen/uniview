import { startWebSocketPluginServer } from "@uniview/runtime/ws-server";
import SimpleDemo from "./simple-demo";

startWebSocketPluginServer({
  App: SimpleDemo,
  port: 3001,
});
