import { connectToHostServer } from "@uniview/react-runtime/ws-client";
import ClipboardHistoryDemo from "./clipboard-history-demo";

connectToHostServer({
  App: ClipboardHistoryDemo,
  serverUrl: "ws://127.0.0.1:3000",
  pluginId: "clipboard-history",
  mode: "incremental",
});
