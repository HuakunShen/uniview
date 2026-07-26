import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createWebSocketController } from "../src/controllers/websocket";

type Listener = (event: never) => void;

/**
 * Stand-in for a browser WebSocket: opens immediately, answers RPC requests so
 * connect() can complete, and lets a test fire the close/error events a real
 * socket fires when the plugin process goes away.
 */
class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly listeners = new Map<string, Set<Listener>>();
  readonly sent: string[] = [];
  readyState = FakeWebSocket.OPEN;
  closedLocally = false;
  /** Turn off to leave host requests unanswered (simulates a dead peer). */
  autoRespond = true;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  send(raw: string): void {
    this.sent.push(raw);
    if (!this.autoRespond) return;
    const message = JSON.parse(raw) as { t?: string; id?: string };
    if (message.t !== "q") return;
    queueMicrotask(() => {
      this.dispatch("message", {
        data: JSON.stringify({ t: "r", id: message.id, v: null }),
      });
    });
  }

  close(): void {
    this.closedLocally = true;
    this.readyState = FakeWebSocket.CLOSED;
  }

  dispatch(type: string, event: unknown): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      (listener as (event: unknown) => void)(event);
    }
  }
}

async function connectController(): Promise<{
  controller: ReturnType<typeof createWebSocketController>;
  socket: FakeWebSocket;
  errors: string[];
}> {
  const controller = createWebSocketController({
    serverUrl: "ws://example.test",
    pluginId: "demo",
  });
  const errors: string[] = [];
  controller.subscribeErrors?.((message) => errors.push(message));

  await controller.connect();

  const socket = FakeWebSocket.instances.at(-1);
  if (!socket) throw new Error("Expected the controller to open a socket");
  return { controller, socket, errors };
}

describe("createWebSocketController", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("reports connected after a successful connect", async () => {
    const { controller, socket } = await connectController();

    expect(socket.url).toBe("ws://example.test/host/demo");
    expect(controller.getStatus()).toMatchObject({
      mode: "websocket",
      connected: true,
    });
    expect(controller.getStatus().lastError).toBeUndefined();
  });

  test("stops reporting connected when the socket drops", async () => {
    const { controller, socket, errors } = await connectController();

    socket.dispatch("close", { code: 1006, reason: "plugin process exited" });

    expect(controller.getStatus()).toMatchObject({
      mode: "websocket",
      connected: false,
    });
    expect(controller.getStatus().lastError).toContain("1006");
    expect(errors).toEqual([expect.stringContaining("1006")]);
  });

  test("stops reporting connected on a clean remote close", async () => {
    const { controller, socket } = await connectController();

    socket.dispatch("close", { code: 1000 });

    expect(controller.getStatus()).toMatchObject({
      connected: false,
      lastError: "WebSocket closed by remote",
    });
  });

  test("stops reporting connected on a socket error", async () => {
    const { controller, socket, errors } = await connectController();

    socket.dispatch("error", {});

    expect(controller.getStatus()).toMatchObject({ connected: false });
    expect(errors).toEqual(["WebSocket error"]);
  });

  test("rejects an in-flight call instead of awaiting a dead socket", async () => {
    const { controller, socket } = await connectController();

    socket.autoRespond = false;
    const pending = controller.executeHandler("handler-1", []);

    socket.dispatch("close", { code: 1006, reason: "plugin process exited" });

    await expect(pending).rejects.toThrow(/transport closed/i);
  });

  test("later calls settle instead of hanging once the socket is gone", async () => {
    const { controller, socket } = await connectController();

    socket.autoRespond = false;
    socket.dispatch("close", { code: 1006 });

    await expect(
      controller.executeHandler("handler-1", []),
    ).resolves.toBeUndefined();
    await expect(controller.updateProps({ a: 1 })).resolves.toBeUndefined();
    await expect(controller.syncTree()).resolves.toBeUndefined();
  });

  test("reports the loss once even if close and error both fire", async () => {
    const { controller, socket, errors } = await connectController();

    socket.dispatch("close", { code: 1006 });
    socket.dispatch("error", {});

    expect(errors).toHaveLength(1);
    expect(controller.getStatus().connected).toBe(false);
  });

  test("disconnect after a drop is still safe", async () => {
    const { controller, socket } = await connectController();

    socket.dispatch("close", { code: 1006 });
    await controller.disconnect();

    expect(controller.getStatus()).toMatchObject({ connected: false });
    expect(controller.getTree()).toBeNull();
  });
});
