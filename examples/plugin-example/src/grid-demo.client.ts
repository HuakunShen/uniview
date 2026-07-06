import { connectToHostServer } from "@uniview/react-runtime/ws-client";
import GridDemo from "./grid-demo";

connectToHostServer({
  App: GridDemo,
  serverUrl: "ws://127.0.0.1:3000",
  pluginId: "grid-demo",
  mode: "incremental",
});
