import { connectToHostServer } from "@uniview/react-runtime/ws-client";
import FormDemo from "./form-demo";

connectToHostServer({
  App: FormDemo,
  serverUrl: "ws://localhost:3000",
  pluginId: "form-demo",
  mode: "incremental",
});
