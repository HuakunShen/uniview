import { CellBuffer } from "../buffer/cell-buffer";
import { frameToLines } from "../buffer/frame";
import { renderToBuffer, type RenderNode } from "../paint/paint";
import { OwnerTable } from "../paint/owner-table";
import { StyleTable } from "../style/style-table";
import type { Size } from "../surface/types";

export interface RenderResult {
  buffer: CellBuffer;
  owners: OwnerTable;
}

/**
 * Computes a frame from a scene. Separating this from {@link CellSurface}
 * (which presents a frame) is the plan's §4.3 boundary: the TypeScript backend
 * is the reference; OpenTUI / WASM / native backends are alternatives that must
 * produce the same cells — verified by the conformance harness below.
 */
export interface RenderBackend {
  readonly kind: "typescript" | "opentui" | "wasm" | "native";
  render(root: RenderNode | null, size: Size): RenderResult;
  destroy(): void;
}

/** The reference backend — wraps the TypeScript paint pipeline. */
export function createTypeScriptBackend(styles?: StyleTable): RenderBackend {
  const table = styles ?? new StyleTable();
  return {
    kind: "typescript",
    render(root, size) {
      if (!root) {
        return { buffer: new CellBuffer(size.width, size.height), owners: new OwnerTable() };
      }
      return renderToBuffer(root, size, table);
    },
    destroy() {},
  };
}

export interface BackendFixture {
  name: string;
  scene: RenderNode;
  size: Size;
  /** Expected first rendered line (trimmed) — the conformance assertion. */
  expectedFirstLine: string;
}

/** Render a fixture through a backend and return the frame lines. */
export function renderBackendFrame(backend: RenderBackend, fixture: BackendFixture): string[] {
  const { buffer } = backend.render(fixture.scene, fixture.size);
  return frameToLines(buffer, { trimRight: true });
}

/**
 * The shared fixtures every backend must reproduce identically. A candidate
 * backend (OpenTUI, WASM, native) is only adopted once it passes all of these
 * — the plan's Gate A conformance requirement (§11.5).
 */
export const CONFORMANCE_FIXTURES: BackendFixture[] = [
  {
    name: "text",
    scene: { type: "text", text: "Hello" },
    size: { width: 10, height: 1 },
    expectedFirstLine: "Hello",
  },
  {
    name: "wide-unicode",
    scene: { type: "text", text: "中x" },
    size: { width: 6, height: 1 },
    expectedFirstLine: "中x",
  },
  {
    name: "bordered-box",
    scene: { type: "box", style: { border: "single", width: 5, height: 3 } },
    size: { width: 5, height: 3 },
    expectedFirstLine: "┌───┐",
  },
  {
    name: "column",
    scene: {
      type: "box",
      style: { flexDirection: "column" },
      children: [
        { type: "text", text: "one" },
        { type: "text", text: "two" },
      ],
    },
    size: { width: 6, height: 2 },
    expectedFirstLine: "one",
  },
];
