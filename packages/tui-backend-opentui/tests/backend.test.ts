import { describe, expect, it } from "vitest";
import { frameToLines, type RenderNode } from "@uniview/tui-core";
import {
  createOpenTuiBackend,
  createOpenTuiBackendFromDeps,
  OpenTuiUnavailableError,
  type OpenTuiRenderDeps,
} from "../src/backend";
import type { OpenTuiApi, OpenTuiNode } from "../src/mount";

/** Mock OpenTUI deps whose capture echoes the mounted text. */
function mockDeps(captured: string): { deps: OpenTuiRenderDeps; mounts: number; clears: number } {
  const state = { mounts: 0, clears: 0 };
  const node: OpenTuiNode = { add() {} };
  const api = {
    BoxRenderable: class {
      add() {}
    },
    TextRenderable: class {
      add() {}
    },
  } as unknown as OpenTuiApi;
  const deps: OpenTuiRenderDeps = {
    api,
    renderer: {},
    clearRoot: () => {
      state.clears += 1;
    },
    addToRoot: () => {
      state.mounts += 1;
    },
    renderOnce: () => {},
    captureCharFrame: () => captured,
  };
  return { deps, get mounts() { return state.mounts; }, get clears() { return state.clears; } };
}

describe("createOpenTuiBackendFromDeps", () => {
  it("renders a scene through the OpenTUI deps into a CellBuffer", () => {
    const m = mockDeps("Hello\n");
    const backend = createOpenTuiBackendFromDeps(m.deps);
    expect(backend.kind).toBe("opentui");

    const scene: RenderNode = { type: "text", text: "Hello" };
    const { buffer } = backend.render(scene, { width: 8, height: 1 });
    expect(frameToLines(buffer, { trimRight: true })).toEqual(["Hello"]);
    expect(m.clears).toBe(1);
    expect(m.mounts).toBe(1);
  });

  it("clears without mounting for a null scene", () => {
    const m = mockDeps("\n");
    const backend = createOpenTuiBackendFromDeps(m.deps);
    backend.render(null, { width: 4, height: 1 });
    expect(m.clears).toBe(1);
    expect(m.mounts).toBe(0);
  });
});

describe("createOpenTuiBackend", () => {
  it("throws a structured error when @opentui/core is unavailable", async () => {
    // @opentui/core is not installed in this environment (native runtime gated).
    await expect(createOpenTuiBackend()).rejects.toBeInstanceOf(OpenTuiUnavailableError);
    await expect(createOpenTuiBackend()).rejects.toMatchObject({ code: "opentui_unavailable" });
  });
});
