import { describe, expect, it } from "vitest";
import {
  CONFORMANCE_FIXTURES,
  createTypeScriptBackend,
  renderBackendFrame,
  type RenderBackend,
} from "../../src/backend/render-backend";

describe("createTypeScriptBackend", () => {
  it("identifies as the typescript backend and renders a scene", () => {
    const backend = createTypeScriptBackend();
    expect(backend.kind).toBe("typescript");
    const { buffer } = backend.render(
      { type: "text", text: "hi" },
      { width: 5, height: 1 },
    );
    expect(buffer.width).toBe(5);
  });

  it("renders a blank frame for a null scene", () => {
    const backend = createTypeScriptBackend();
    const { buffer } = backend.render(null, { width: 3, height: 2 });
    expect(buffer.width).toBe(3);
    expect(buffer.height).toBe(2);
  });
});

describe("backend conformance harness", () => {
  it("provides fixtures every backend must reproduce", () => {
    expect(CONFORMANCE_FIXTURES.length).toBeGreaterThan(0);
    for (const fixture of CONFORMANCE_FIXTURES) {
      expect(fixture.name).toBeTypeOf("string");
      expect(fixture.size.width).toBeGreaterThan(0);
    }
  });

  it("the typescript backend passes every conformance fixture", () => {
    const backend = createTypeScriptBackend();
    for (const fixture of CONFORMANCE_FIXTURES) {
      const lines = renderBackendFrame(backend, fixture);
      // Each fixture pins its expected first line.
      expect(lines[0]).toBe(fixture.expectedFirstLine);
    }
  });

  it("two instances of the same backend agree (deterministic)", () => {
    const a = createTypeScriptBackend();
    const b = createTypeScriptBackend();
    for (const fixture of CONFORMANCE_FIXTURES) {
      expect(renderBackendFrame(a, fixture)).toEqual(renderBackendFrame(b, fixture));
    }
  });
});

// A stub alternative backend proves the interface is implementable by others.
function stubBackend(): RenderBackend {
  const ts = createTypeScriptBackend();
  return { kind: "opentui", render: (r, s) => ts.render(r, s), destroy: () => {} };
}

describe("alternate backend", () => {
  it("a non-typescript backend can run the same fixtures", () => {
    const backend = stubBackend();
    expect(backend.kind).toBe("opentui");
    for (const fixture of CONFORMANCE_FIXTURES) {
      expect(renderBackendFrame(backend, fixture)[0]).toBe(fixture.expectedFirstLine);
    }
  });
});
