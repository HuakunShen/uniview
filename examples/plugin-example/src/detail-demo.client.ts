import { connectToHostServer } from "@uniview/react-runtime/ws-client";
import DetailDemo from "./detail-demo";

connectToHostServer({
  App: DetailDemo,
  serverUrl: "ws://localhost:3000",
  pluginId: "detail-demo",
  mode: "incremental",
});
