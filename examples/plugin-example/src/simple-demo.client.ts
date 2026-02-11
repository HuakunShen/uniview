import { connectToHostServer } from "@uniview/react-runtime/ws-client";
import SimpleDemo from "./simple-demo";

connectToHostServer({
  App: SimpleDemo,
  serverUrl: "ws://localhost:3000",
  pluginId: "simple-demo",
});
