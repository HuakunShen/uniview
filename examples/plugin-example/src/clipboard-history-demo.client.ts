import { connectToHostServer } from "@uniview/react-runtime/ws-client";
import ClipboardHistoryDemo from "./clipboard-history-demo";

connectToHostServer({
  App: ClipboardHistoryDemo,
  serverUrl: "ws://localhost:3000",
  pluginId: "clipboard-history",
  mode: "incremental",
});
