import { join } from "path";
import { fileURLToPath } from "url";
import { createBridgeServer } from "./bridge";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const bridge = createBridgeServer({
  port: 3000,
  pluginDirs: {
    react: join(__dirname, "../../plugin-example/dist"),
    solid: join(__dirname, "../../plugin-solid-example/dist"),
  },
});

console.log(`🌉 Bridge server listening on http://127.0.0.1:${bridge.port}`);
