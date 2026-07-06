/**
 * Integration tests against the REAL bridge implementation (the previous
 * test file exercised a copied inline reimplementation, so the actual
 * server code was never under test).
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createBridgeServer, type BridgeServer } from "./bridge";

let bridge: BridgeServer;
let port: number;

function open(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = (e) => reject(e);
  });
}

function nextMessage(ws: WebSocket): Promise<string> {
  return new Promise((resolve) => {
    ws.onmessage = (event) => resolve(String(event.data));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeAll(() => {
  bridge = createBridgeServer({
    port: 0,
    quiet: true,
    hostWaitMs: 500,
    heartbeatIntervalMs: 60_000,
  });
  port = bridge.port;
});

afterAll(() => {
  bridge.stop();
});

describe("bridge server", () => {
  it("forwards messages in both directions with newline framing", async () => {
    const plugin = await open(`ws://127.0.0.1:${port}/plugins/fwd`);
    const host = await open(`ws://127.0.0.1:${port}/host/fwd`);

    const toPlugin = nextMessage(plugin);
    host.send(JSON.stringify({ t: "q", id: "1" }));
    expect(await toPlugin).toBe(JSON.stringify({ t: "q", id: "1" }) + "\n");

    const toHost = nextMessage(host);
    plugin.send(JSON.stringify({ t: "r", id: "1" }));
    expect(await toHost).toBe(JSON.stringify({ t: "r", id: "1" }) + "\n");

    plugin.close();
    host.close();
    await sleep(50);
  });

  it("buffers host messages while the plugin is absent and flushes on arrival", async () => {
    // Host connects FIRST and immediately sends (like kkrpc initialize)
    const host = await open(`ws://127.0.0.1:${port}/host/late-plugin`);
    host.send("hello-1");
    host.send("hello-2");
    await sleep(50);

    // Plugin arrives late — buffered messages must be delivered in order
    const received: string[] = [];
    const plugin = await open(`ws://127.0.0.1:${port}/plugins/late-plugin`);
    plugin.onmessage = (event) => received.push(String(event.data));
    await sleep(100);

    expect(received).toEqual(["hello-1\n", "hello-2\n"]);

    plugin.close();
    host.close();
    await sleep(50);
  });

  it("closes a waiting host after the bounded wait if no plugin shows up", async () => {
    const host = await open(`ws://127.0.0.1:${port}/host/never-plugin`);
    const closed = new Promise<{ code: number; reason: string }>((resolve) => {
      host.onclose = (event) =>
        resolve({ code: event.code, reason: event.reason });
    });

    const result = await closed;
    expect(result.code).toBe(1013);
    expect(result.reason).toContain("Plugin not available");
  });

  it("keeps the plugin connected when the host disconnects", async () => {
    const plugin = await open(`ws://127.0.0.1:${port}/plugins/sticky`);
    const host = await open(`ws://127.0.0.1:${port}/host/sticky`);

    let pluginClosed = false;
    plugin.onclose = () => {
      pluginClosed = true;
    };

    host.close();
    await sleep(100);
    expect(pluginClosed).toBe(false);

    plugin.close();
    await sleep(50);
  });

  it("replaces an existing host connection", async () => {
    const plugin = await open(`ws://127.0.0.1:${port}/plugins/replace`);
    const host1 = await open(`ws://127.0.0.1:${port}/host/replace`);
    const host1Closed = new Promise<number>((resolve) => {
      host1.onclose = (event) => resolve(event.code);
    });

    const host2 = await open(`ws://127.0.0.1:${port}/host/replace`);
    expect(await host1Closed).toBe(1000);

    // New host receives plugin traffic
    const toHost2 = nextMessage(host2);
    plugin.send("after-replace");
    expect(await toHost2).toBe("after-replace\n");

    plugin.close();
    host2.close();
    await sleep(50);
  });

  it("serves 404 for unknown files and routes", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/react/nope.js`);
    // no pluginDirs configured in this test server
    expect(res.status).toBe(404);
    const res2 = await fetch(`http://127.0.0.1:${port}/unknown`);
    expect(res2.status).toBe(404);
  });
});
