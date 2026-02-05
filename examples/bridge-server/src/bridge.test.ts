import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { readFile } from "fs/promises";
import { join } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Bridge server implementation (copied for testing)
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

describe("Bridge Server Integration Tests", () => {
  let server: any;
  let port: number;

  beforeAll(async () => {
    // Find available port
    const ports = [9999, 10001, 10011, 10021];
    let lastError: unknown = null;

    for (const candidate of ports) {
      try {
        port = candidate;
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
            } catch {
              return new Response("Not found", { status: 404 });
            }
          })

          .ws("/plugins/:pluginId", {
            open(ws) {
              const pluginId = ws.data.params.pluginId;
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
                conn.hostWs.close(1000, "Replaced by new connection");
              }

              conn.hostWs = ws;
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
            },
          })

          .listen({ port: candidate, hostname: "127.0.0.1" });

        // Wait for server to start
        await new Promise((resolve) => setTimeout(resolve, 100));
        return;
      } catch (error: unknown) {
        lastError = error;
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error as { code: string }).code !== "EADDRINUSE"
        ) {
          throw error;
        }
      }
    }

    throw (
      lastError ??
      new Error("Unable to find available port for Bridge Server tests")
    );
  });

  afterAll(async () => {
    if (server) {
      server.stop();
    }
    // Clear connections
    connections.clear();
  });

  describe("Scenario 1: Plugin connects → Host connects → bidirectional message forwarding", () => {
    it("should forward messages from plugin to host", async () => {
      const pluginId = "test-plugin-1";
      const messages: string[] = [];

      // Create plugin connection
      const pluginWs = new WebSocket(
        `ws://127.0.0.1:${port}/plugins/${pluginId}`,
      );

      // Wait for plugin to connect
      await new Promise<void>((resolve) => {
        pluginWs.onopen = () => resolve();
      });

      // Create host connection
      const hostWs = new WebSocket(`ws://127.0.0.1:${port}/host/${pluginId}`);

      // Wait for host to connect
      await new Promise<void>((resolve) => {
        hostWs.onopen = () => resolve();
      });

      // Set up host message listener
      hostWs.onmessage = (event) => {
        messages.push(event.data);
      };

      // Send message from plugin
      const testMessage = "Hello from plugin";
      pluginWs.send(testMessage);

      // Wait for message to be forwarded
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify message was forwarded
      expect(messages).toContain(testMessage + "\n");

      // Cleanup
      pluginWs.close();
      hostWs.close();
    });

    it("should forward messages from host to plugin", async () => {
      const pluginId = "test-plugin-2";
      const messages: string[] = [];

      // Create plugin connection
      const pluginWs = new WebSocket(
        `ws://127.0.0.1:${port}/plugins/${pluginId}`,
      );

      // Wait for plugin to connect
      await new Promise<void>((resolve) => {
        pluginWs.onopen = () => resolve();
      });

      // Create host connection
      const hostWs = new WebSocket(`ws://127.0.0.1:${port}/host/${pluginId}`);

      // Wait for host to connect
      await new Promise<void>((resolve) => {
        hostWs.onopen = () => resolve();
      });

      // Set up plugin message listener
      pluginWs.onmessage = (event) => {
        messages.push(event.data);
      };

      // Send message from host
      const testMessage = "Hello from host";
      hostWs.send(testMessage);

      // Wait for message to be forwarded
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify message was forwarded
      expect(messages).toContain(testMessage + "\n");

      // Cleanup
      pluginWs.close();
      hostWs.close();
    });

    it("should handle bidirectional message exchange", async () => {
      const pluginId = "test-plugin-3";
      const pluginMessages: string[] = [];
      const hostMessages: string[] = [];

      // Create plugin connection
      const pluginWs = new WebSocket(
        `ws://127.0.0.1:${port}/plugins/${pluginId}`,
      );

      // Wait for plugin to connect
      await new Promise<void>((resolve) => {
        pluginWs.onopen = () => resolve();
      });

      // Create host connection
      const hostWs = new WebSocket(`ws://127.0.0.1:${port}/host/${pluginId}`);

      // Wait for host to connect
      await new Promise<void>((resolve) => {
        hostWs.onopen = () => resolve();
      });

      // Set up message listeners
      pluginWs.onmessage = (event) => {
        pluginMessages.push(event.data);
      };
      hostWs.onmessage = (event) => {
        hostMessages.push(event.data);
      };

      // Exchange messages
      pluginWs.send("Message 1 from plugin");
      await new Promise((resolve) => setTimeout(resolve, 50));

      hostWs.send("Message 1 from host");
      await new Promise((resolve) => setTimeout(resolve, 50));

      pluginWs.send("Message 2 from plugin");
      await new Promise((resolve) => setTimeout(resolve, 50));

      hostWs.send("Message 2 from host");
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify all messages were forwarded
      expect(hostMessages).toContain("Message 1 from plugin\n");
      expect(hostMessages).toContain("Message 2 from plugin\n");
      expect(pluginMessages).toContain("Message 1 from host\n");
      expect(pluginMessages).toContain("Message 2 from host\n");

      // Cleanup
      pluginWs.close();
      hostWs.close();
    });

    it("should normalize messages with newline", async () => {
      const pluginId = "test-plugin-4";
      const messages: string[] = [];

      // Create plugin connection
      const pluginWs = new WebSocket(
        `ws://127.0.0.1:${port}/plugins/${pluginId}`,
      );

      // Wait for plugin to connect
      await new Promise<void>((resolve) => {
        pluginWs.onopen = () => resolve();
      });

      // Create host connection
      const hostWs = new WebSocket(`ws://127.0.0.1:${port}/host/${pluginId}`);

      // Wait for host to connect
      await new Promise<void>((resolve) => {
        hostWs.onopen = () => resolve();
      });

      // Set up host message listener
      hostWs.onmessage = (event) => {
        messages.push(event.data);
      };

      // Send message without newline
      const testMessage = "Test message";
      pluginWs.send(testMessage);

      // Wait for message to be forwarded
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify message has newline appended
      expect(messages[0]).toBe(testMessage + "\n");

      // Cleanup
      pluginWs.close();
      hostWs.close();
    });
  });

  describe("Scenario 2: Host connects first (Plugin not ready) → receives error", () => {
    it("should reject host connection with close code 1000 when plugin not ready", async () => {
      const pluginId = "test-plugin-5";
      let closeCode: number | undefined;
      let closeReason: string | undefined;

      // Try to connect host WITHOUT plugin being connected first
      const hostWs = new WebSocket(`ws://127.0.0.1:${port}/host/${pluginId}`);

      // Wait for connection close
      await new Promise<void>((resolve) => {
        hostWs.onclose = (event) => {
          closeCode = event.code;
          closeReason = event.reason;
          resolve();
        };
      });

      // Verify connection was rejected with correct code and reason
      expect(closeCode).toBe(1000);
      expect(closeReason).toBe("Plugin not ready");
    });

    it("should allow host connection after plugin connects", async () => {
      const pluginId = "test-plugin-6";
      let hostConnected = false;

      // Create plugin connection first
      const pluginWs = new WebSocket(
        `ws://127.0.0.1:${port}/plugins/${pluginId}`,
      );

      // Wait for plugin to connect
      await new Promise<void>((resolve) => {
        pluginWs.onopen = () => resolve();
      });

      // Now try to connect host
      const hostWs = new WebSocket(`ws://127.0.0.1:${port}/host/${pluginId}`);

      // Wait for host to connect
      await new Promise<void>((resolve) => {
        hostWs.onopen = () => {
          hostConnected = true;
          resolve();
        };
        // Set timeout in case connection fails
        setTimeout(() => resolve(), 500);
      });

      // Verify host connected successfully
      expect(hostConnected).toBe(true);

      // Cleanup
      pluginWs.close();
      hostWs.close();
    });
  });

  describe("Scenario 3: Second Host connects to same Plugin → first Host is replaced", () => {
    it("should close first host connection when second host connects", async () => {
      const pluginId = "test-plugin-7";
      let firstHostClosed = false;
      let firstHostCloseCode: number | undefined;
      let firstHostCloseReason: string | undefined;

      // Create plugin connection
      const pluginWs = new WebSocket(
        `ws://127.0.0.1:${port}/plugins/${pluginId}`,
      );

      // Wait for plugin to connect
      await new Promise<void>((resolve) => {
        pluginWs.onopen = () => resolve();
      });

      // Create first host connection
      const firstHostWs = new WebSocket(
        `ws://127.0.0.1:${port}/host/${pluginId}`,
      );

      // Wait for first host to connect
      await new Promise<void>((resolve) => {
        firstHostWs.onopen = () => resolve();
      });

      // Set up close listener for first host
      firstHostWs.onclose = (event) => {
        firstHostClosed = true;
        firstHostCloseCode = event.code;
        firstHostCloseReason = event.reason;
      };

      // Create second host connection
      const secondHostWs = new WebSocket(
        `ws://127.0.0.1:${port}/host/${pluginId}`,
      );

      // Wait for second host to connect
      await new Promise<void>((resolve) => {
        secondHostWs.onopen = () => resolve();
      });

      // Wait for first host to close
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify first host was closed with correct code and reason
      expect(firstHostClosed).toBe(true);
      expect(firstHostCloseCode).toBe(1000);
      expect(firstHostCloseReason).toBe("Replaced by new connection");

      // Cleanup
      pluginWs.close();
      secondHostWs.close();
    });

    it("should route messages to second host after replacement", async () => {
      const pluginId = "test-plugin-8";
      const firstHostMessages: string[] = [];
      const secondHostMessages: string[] = [];

      // Create plugin connection
      const pluginWs = new WebSocket(
        `ws://127.0.0.1:${port}/plugins/${pluginId}`,
      );

      // Wait for plugin to connect
      await new Promise<void>((resolve) => {
        pluginWs.onopen = () => resolve();
      });

      // Create first host connection
      const firstHostWs = new WebSocket(
        `ws://127.0.0.1:${port}/host/${pluginId}`,
      );

      // Wait for first host to connect
      await new Promise<void>((resolve) => {
        firstHostWs.onopen = () => resolve();
      });

      // Set up message listener for first host
      firstHostWs.onmessage = (event) => {
        firstHostMessages.push(event.data);
      };

      // Create second host connection (replaces first)
      const secondHostWs = new WebSocket(
        `ws://127.0.0.1:${port}/host/${pluginId}`,
      );

      // Wait for second host to connect
      await new Promise<void>((resolve) => {
        secondHostWs.onopen = () => resolve();
      });

      // Set up message listener for second host
      secondHostWs.onmessage = (event) => {
        secondHostMessages.push(event.data);
      };

      // Wait for first host to close
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Send message from plugin
      pluginWs.send("Message after replacement");

      // Wait for message to be forwarded
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify message was routed to second host, not first
      expect(secondHostMessages).toContain("Message after replacement\n");
      expect(firstHostMessages.length).toBe(0);

      // Cleanup
      pluginWs.close();
      secondHostWs.close();
    });

    it("should handle multiple sequential host replacements", async () => {
      const pluginId = "test-plugin-9";
      const closedHosts: { code: number; reason: string }[] = [];

      // Create plugin connection
      const pluginWs = new WebSocket(
        `ws://127.0.0.1:${port}/plugins/${pluginId}`,
      );

      // Wait for plugin to connect
      await new Promise<void>((resolve) => {
        pluginWs.onopen = () => resolve();
      });

      // Create and replace hosts multiple times
      for (let i = 0; i < 3; i++) {
        const hostWs = new WebSocket(`ws://127.0.0.1:${port}/host/${pluginId}`);

        // Wait for host to connect
        await new Promise<void>((resolve) => {
          hostWs.onopen = () => resolve();
        });

        // Set up close listener
        hostWs.onclose = (event) => {
          closedHosts.push({ code: event.code, reason: event.reason });
        };

        // Wait before creating next host
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // Wait for all close events
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify first two hosts were replaced
      expect(closedHosts.length).toBeGreaterThanOrEqual(2);
      expect(closedHosts[0].code).toBe(1000);
      expect(closedHosts[0].reason).toBe("Replaced by new connection");

      // Cleanup
      pluginWs.close();
    });
  });

  describe("Edge cases and robustness", () => {
    it("should handle plugin disconnection while host is connected", async () => {
      const pluginId = "test-plugin-10";
      let hostStillConnected = true;

      // Create plugin connection
      const pluginWs = new WebSocket(
        `ws://127.0.0.1:${port}/plugins/${pluginId}`,
      );

      // Wait for plugin to connect
      await new Promise<void>((resolve) => {
        pluginWs.onopen = () => resolve();
      });

      // Create host connection
      const hostWs = new WebSocket(`ws://127.0.0.1:${port}/host/${pluginId}`);

      // Wait for host to connect
      await new Promise<void>((resolve) => {
        hostWs.onopen = () => resolve();
      });

      // Set up host close listener
      hostWs.onclose = () => {
        hostStillConnected = false;
      };

      // Disconnect plugin
      pluginWs.close();

      // Wait for cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Host should still be connected (bridge doesn't close host when plugin disconnects)
      expect(hostStillConnected).toBe(true);

      // Cleanup
      hostWs.close();
    });

    it("should handle host disconnection while plugin is connected", async () => {
      const pluginId = "test-plugin-11";
      let pluginStillConnected = true;

      // Create plugin connection
      const pluginWs = new WebSocket(
        `ws://127.0.0.1:${port}/plugins/${pluginId}`,
      );

      // Wait for plugin to connect
      await new Promise<void>((resolve) => {
        pluginWs.onopen = () => resolve();
      });

      // Create host connection
      const hostWs = new WebSocket(`ws://127.0.0.1:${port}/host/${pluginId}`);

      // Wait for host to connect
      await new Promise<void>((resolve) => {
        hostWs.onopen = () => resolve();
      });

      // Set up plugin close listener
      pluginWs.onclose = () => {
        pluginStillConnected = false;
      };

      // Disconnect host
      hostWs.close();

      // Wait for cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Plugin should still be connected (bridge doesn't close plugin when host disconnects)
      expect(pluginStillConnected).toBe(true);

      // Cleanup
      pluginWs.close();
    });

    it("should handle JSON message forwarding", async () => {
      const pluginId = "test-plugin-12";
      const messages: string[] = [];

      // Create plugin connection
      const pluginWs = new WebSocket(
        `ws://127.0.0.1:${port}/plugins/${pluginId}`,
      );

      // Wait for plugin to connect
      await new Promise<void>((resolve) => {
        pluginWs.onopen = () => resolve();
      });

      // Create host connection
      const hostWs = new WebSocket(`ws://127.0.0.1:${port}/host/${pluginId}`);

      // Wait for host to connect
      await new Promise<void>((resolve) => {
        hostWs.onopen = () => resolve();
      });

      // Set up host message listener
      hostWs.onmessage = (event) => {
        messages.push(event.data);
      };

      // Send JSON message from plugin
      const jsonMessage = { type: "test", data: { value: 42 } };
      pluginWs.send(JSON.stringify(jsonMessage));

      // Wait for message to be forwarded
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify JSON message was forwarded with newline
      expect(messages[0]).toBe(JSON.stringify(jsonMessage) + "\n");

      // Cleanup
      pluginWs.close();
      hostWs.close();
    });
  });
});
