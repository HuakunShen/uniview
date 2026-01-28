import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Elysia } from "elysia";
import { readFile } from "fs/promises";
import { join } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

describe("Bridge", () => {
  let server: any;
  let port: number;
  let baseUrl: string;

  beforeAll(async () => {
    port = 28300 + Math.floor(Math.random() * 100);
    baseUrl = `ws://localhost:${port}`;

    const connections = new Map<string, { pluginWs?: any; hostWs?: any }>();

    server = new Elysia()
      .get("/:filename", async ({ params }) => {
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
        } catch (error) {
          return new Response("Not found", { status: 404 });
        }
      })

      .ws("/plugins/:pluginId", {
        open(ws) {
          const pluginId = ws.data.params.pluginId;

          if (!connections.has(pluginId)) {
            connections.set(pluginId, {});
          }
          const conn = connections.get(pluginId)!;
          conn.pluginWs = ws;
        },
        message(ws, message) {
          const pluginId = ws.data.params.pluginId;
          const conn = connections.get(pluginId);

          if (conn?.hostWs) {
            conn.hostWs.send(message);
          }
        },
        close(ws) {
          const pluginId = ws.data.params.pluginId;
          const conn = connections.get(pluginId);

          if (conn) {
            conn.pluginWs = undefined;
            if (!conn.hostWs) {
              connections.delete(pluginId);
            }
          }
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
            ws.close(1000, "Host already connected");
            return;
          }

          conn.hostWs = ws;
        },
        message(ws, message) {
          const pluginId = ws.data.params.pluginId;
          const conn = connections.get(pluginId);

          if (conn?.pluginWs) {
            conn.pluginWs.send(message);
          }
        },
        close(ws) {
          const pluginId = ws.data.params.pluginId;
          const conn = connections.get(pluginId);

          if (conn) {
            conn.hostWs = undefined;
            if (!conn.pluginWs) {
              connections.delete(pluginId);
            }
          }
        },
      })

      .listen(port);

    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  afterAll(() => {
    server?.stop();
  });

  it("should forward messages bidirectionally when plugin and host both connected", async () => {
    const pluginId = "test-plugin-1";
    let hostReceivedMessage: string | undefined;
    let pluginReceivedMessage: string | undefined;

    const pluginWs = new WebSocket(`${baseUrl}/plugins/${pluginId}`);
    await new Promise<void>((resolve, reject) => {
      pluginWs.onopen = () => resolve();
      pluginWs.onerror = reject;
      setTimeout(() => reject(new Error("Plugin connection timeout")), 2000);
    });

    pluginWs.onmessage = (event) => {
      pluginReceivedMessage = event.data;
    };

    const hostWs = new WebSocket(`${baseUrl}/host/${pluginId}`);
    await new Promise<void>((resolve, reject) => {
      hostWs.onopen = () => resolve();
      hostWs.onerror = reject;
      setTimeout(() => reject(new Error("Host connection timeout")), 2000);
    });

    hostWs.onmessage = (event) => {
      hostReceivedMessage = event.data;
    };

    pluginWs.send("hello from plugin");
    await new Promise<void>((resolve) => {
      const maxWait = 1000;
      const startTime = Date.now();
      const check = () => {
        if (hostReceivedMessage === "hello from plugin") {
          resolve();
        } else if (Date.now() - startTime > maxWait) {
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });

    expect(hostReceivedMessage).toEqual("hello from plugin");

    hostWs.send("hello from host");
    await new Promise<void>((resolve) => {
      const maxWait = 1000;
      const startTime = Date.now();
      const check = () => {
        if (pluginReceivedMessage === "hello from host") {
          resolve();
        } else if (Date.now() - startTime > maxWait) {
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });

    expect(pluginReceivedMessage).toEqual("hello from host");

    pluginWs.close();
    hostWs.close();
  });

  it("should reject host connection when plugin not ready", async () => {
    const pluginId = "test-plugin-2";
    let closeCode: number | undefined;
    let closeReason: string | undefined;

    // Try to connect host without plugin
    const hostWs = new WebSocket(`${baseUrl}/host/${pluginId}`);

    await new Promise((resolve) => {
      hostWs.onclose = (event) => {
        closeCode = event.code;
        closeReason = event.reason;
        resolve(undefined);
      };
    });

    expect(closeCode).toBe(1000);
    expect(closeReason).toBe("Plugin not ready");
  });

  it("should reject second host connection to same plugin", async () => {
    const pluginId = "test-plugin-3";
    let secondCloseCode: number | undefined;
    let secondCloseReason: string | undefined;

    // Connect plugin
    const pluginWs = new WebSocket(`${baseUrl}/plugins/${pluginId}`);
    await new Promise((resolve) => {
      pluginWs.onopen = resolve;
    });

    // Connect first host (should succeed)
    const firstHostWs = new WebSocket(`${baseUrl}/host/${pluginId}`);
    await new Promise((resolve) => {
      firstHostWs.onopen = resolve;
    });

    // Try to connect second host (should be rejected)
    const secondHostWs = new WebSocket(`${baseUrl}/host/${pluginId}`);

    await new Promise((resolve) => {
      secondHostWs.onclose = (event) => {
        secondCloseCode = event.code;
        secondCloseReason = event.reason;
        resolve(undefined);
      };
    });

    expect(secondCloseCode).toBe(1000);
    expect(secondCloseReason).toBe("Host already connected");

    // Cleanup
    pluginWs.close();
    firstHostWs.close();
  });
});
