import { Elysia } from "elysia";
import { readFile } from "fs/promises";
import { join } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const connections = new Map<string, { pluginWs?: any; hostWs?: any }>();

function normalizeMessage(message: unknown): string {
  let msgStr =
    typeof message === "string"
      ? message
      : message instanceof Buffer
        ? message.toString()
        : JSON.stringify(message);
  if (!msgStr.endsWith("\n")) msgStr += "\n";
  return msgStr;
}

new Elysia()
  .get("/react/:filename", async ({ params }) => {
    try {
      const filePath = join(
        __dirname,
        "../../plugin-example/dist",
        params.filename,
      );
      const content = await readFile(filePath);
      return new Response(new Uint8Array(content), {
        headers: {
          "Content-Type": "application/javascript",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  })

  .get("/solid/:filename", async ({ params }) => {
    try {
      const filePath = join(
        __dirname,
        "../../plugin-solid-example/dist",
        params.filename,
      );
      const content = await readFile(filePath);
      return new Response(new Uint8Array(content), {
        headers: {
          "Content-Type": "application/javascript",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  })

  .ws("/plugins/:pluginId", {
    open(ws) {
      const pluginId = ws.data.params.pluginId;
      console.log(`[Bridge] Plugin connected: ${pluginId}`);
      if (!connections.has(pluginId)) {
        connections.set(pluginId, {});
      }
      connections.get(pluginId)!.pluginWs = ws;
    },
    message(ws, message: unknown) {
      const pluginId = ws.data.params.pluginId;
      const conn = connections.get(pluginId);
      if (conn?.hostWs) {
        conn.hostWs.send(normalizeMessage(message));
      }
    },
    close(ws) {
      const pluginId = ws.data.params.pluginId;
      const conn = connections.get(pluginId);
      if (conn) {
        conn.pluginWs = undefined;
        if (!conn.hostWs) connections.delete(pluginId);
      }
      console.log(`[Bridge] Plugin disconnected: ${pluginId}`);
    },
  })

  .ws("/host/:pluginId", {
    open(ws) {
      const pluginId = ws.data.params.pluginId;
      const conn = connections.get(pluginId);

      if (!conn?.pluginWs) {
        ws.close(1000, "Plugin not ready");
        return;
      }
      if (conn.hostWs) {
        console.log(`[Bridge] Replacing existing host connection: ${pluginId}`);
        conn.hostWs.close(1000, "Replaced by new connection");
      }

      conn.hostWs = ws;
      console.log(`[Bridge] Host connected: ${pluginId}`);
    },
    message(ws, message: unknown) {
      const pluginId = ws.data.params.pluginId;
      const conn = connections.get(pluginId);
      if (conn?.pluginWs) {
        conn.pluginWs.send(normalizeMessage(message));
      }
    },
    close(ws) {
      const pluginId = ws.data.params.pluginId;
      const conn = connections.get(pluginId);
      if (conn) {
        conn.hostWs = undefined;
        if (!conn.pluginWs) connections.delete(pluginId);
      }
      console.log(`[Bridge] Host disconnected: ${pluginId}`);
    },
  })

  .listen(3000);

console.log("🌉 Bridge server listening on http://localhost:3000");
