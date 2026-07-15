import { connectToHostServer } from "@uniview/react-runtime/ws-client";
import AppShell from "./app-shell";

connectToHostServer({
  App: AppShell,
  serverUrl: "ws://127.0.0.1:3000",
  pluginId: "app-shell",
});
