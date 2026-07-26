import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createWorkerController } from "../src/controllers/worker";

type Listener = (event: never) => void;

interface PostedMessage {
  t?: string;
  id?: string;
}

/**
 * Stand-in for a Web Worker: records what the host posted, answers RPC requests
 * so connect() can complete, and lets a test fire the failure events a real
 * worker fires when the plugin thread dies.
 */
class FakeWorker {
  static instances: FakeWorker[] = [];

  readonly listeners = new Map<string, Set<Listener>>();
  readonly posted: PostedMessage[] = [];
  terminated = false;
  /** Turn off to leave host requests unanswered (simulates a wedged thread). */
  autoRespond = true;

  constructor() {
    FakeWorker.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  postMessage(message: PostedMessage): void {
    this.posted.push(message);
    if (!this.autoRespond || message?.t !== "q") return;
    queueMicrotask(() => {
      this.dispatch("message", { data: { t: "r", id: message.id, v: null } });
    });
  }

  terminate(): void {
    this.terminated = true;
  }

  dispatch(type: string, event: unknown): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      (listener as (event: unknown) => void)(event);
    }
  }
}

async function connectController(): Promise<{
  controller: ReturnType<typeof createWorkerController>;
  worker: FakeWorker;
  errors: string[];
}> {
  const controller = createWorkerController({
    pluginUrl: "https://example.test/plugin.js",
  });
  const errors: string[] = [];
  controller.subscribeErrors?.((message) => errors.push(message));

  await controller.connect();

  const worker = FakeWorker.instances.at(-1);
  if (!worker) throw new Error("Expected the controller to create a worker");
  return { controller, worker, errors };
}

describe("createWorkerController", () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("Worker", FakeWorker);
    vi.stubGlobal("fetch", async () => new Response("// plugin"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("reports connected after a successful connect", async () => {
    const { controller, worker } = await connectController();

    expect(controller.getStatus()).toMatchObject({
      mode: "worker",
      connected: true,
    });
    expect(controller.getStatus().lastError).toBeUndefined();
    expect(worker.terminated).toBe(false);
  });

  test("stops reporting connected when the worker crashes", async () => {
    const { controller, worker, errors } = await connectController();

    worker.dispatch("error", { message: "boom", error: new Error("boom") });

    expect(controller.getStatus()).toMatchObject({
      mode: "worker",
      connected: false,
      lastError: "Plugin worker crashed: boom",
    });
    expect(errors).toEqual(["Plugin worker crashed: boom"]);
    // The dead channel is torn down, which terminates the worker.
    expect(worker.terminated).toBe(true);
  });

  test("stops reporting connected on messageerror and exit", async () => {
    const first = await connectController();
    first.worker.dispatch("messageerror", {});
    expect(first.controller.getStatus().connected).toBe(false);
    expect(first.controller.getStatus().lastError).toContain("deserialize");

    const second = await connectController();
    second.worker.dispatch("exit", { code: 1 });
    expect(second.controller.getStatus()).toMatchObject({
      connected: false,
      lastError: "Plugin worker exited",
    });
  });

  test("rejects an in-flight call instead of awaiting a dead worker", async () => {
    const { controller, worker } = await connectController();

    worker.autoRespond = false;
    const pending = controller.executeHandler("handler-1", []);

    worker.dispatch("error", { message: "boom" });

    await expect(pending).rejects.toThrow(/destroyed/i);
  });

  test("later calls settle instead of hanging once the worker is gone", async () => {
    const { controller, worker } = await connectController();

    worker.autoRespond = false;
    worker.dispatch("error", { message: "boom" });

    await expect(
      controller.executeHandler("handler-1", []),
    ).resolves.toBeUndefined();
    await expect(controller.updateProps({ a: 1 })).resolves.toBeUndefined();
    await expect(controller.syncTree()).resolves.toBeUndefined();
  });

  test("reports the failure once even if several events fire", async () => {
    const { controller, worker, errors } = await connectController();

    worker.dispatch("error", { message: "boom" });
    worker.dispatch("error", { message: "boom again" });
    worker.dispatch("messageerror", {});

    expect(errors).toEqual(["Plugin worker crashed: boom"]);
    expect(controller.getStatus().lastError).toBe(
      "Plugin worker crashed: boom",
    );
  });

  test("disconnect after a crash is still safe", async () => {
    const { controller, worker } = await connectController();

    worker.dispatch("error", { message: "boom" });
    await controller.disconnect();

    expect(controller.getStatus()).toMatchObject({ connected: false });
    expect(controller.getTree()).toBeNull();
  });
});
