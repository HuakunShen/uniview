import { connectToHostServer } from "@uniview/react-runtime/ws-client";
import RaycastDemo from "./raycast-demo";

connectToHostServer({
  App: RaycastDemo,
  serverUrl: "ws://localhost:3000",
  pluginId: "raycast-demo",
  mode: "incremental",
});
