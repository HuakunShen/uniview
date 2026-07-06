import { connectToHostServer } from "@uniview/react-runtime/ws-client";
import FormDemo from "./form-demo";

connectToHostServer({
  App: FormDemo,
  serverUrl: "ws://127.0.0.1:3000",
  pluginId: "form-demo",
  mode: "incremental",
});
