import { connectToHostServer } from "@uniview/react-runtime/ws-client";
import MenuDemo from "./menu-demo";

connectToHostServer({
  App: MenuDemo,
  serverUrl: "ws://127.0.0.1:3000",
  pluginId: "menu-demo",
});
