import { CellBuffer, type Size } from "@uniview/tui-core";

/**
 * Parse OpenTUI's `captureCharFrame()` output (newline-separated rows of
 * glyphs) into a tui-core {@link CellBuffer} so an OpenTUI-rendered frame can
 * be compared against the reference backend through the conformance harness.
 * Style capture would use `captureSpans()` instead; this covers glyph/layout
 * conformance.
 */
export function charFrameToBuffer(charFrame: string, size: Size): CellBuffer {
  const buffer = new CellBuffer(size.width, size.height);
  const rows = charFrame.split("\n");
  for (let y = 0; y < size.height; y += 1) {
    const row = rows[y];
    if (row) buffer.writeText(0, y, row, 0, 0);
  }
  return buffer;
}
