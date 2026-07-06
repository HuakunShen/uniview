import { connectToHostServer } from "@uniview/react-runtime/ws-client";
import SimpleDemo from "./simple-demo";

connectToHostServer({
  App: SimpleDemo,
  serverUrl: "ws://127.0.0.1:3000",
  pluginId: "simple-demo",
});
