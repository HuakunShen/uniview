import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_CLIPBOARD_BYTES,
  encodeOsc52Clipboard,
} from "../../src/terminal/clipboard";

describe("encodeOsc52Clipboard", () => {
  it("encodes UTF-8 text as an OSC 52 clipboard sequence", () => {
    expect(encodeOsc52Clipboard("hello")).toBe("\u001b]52;c;aGVsbG8=\u0007");
    expect(encodeOsc52Clipboard("界")).toBe("\u001b]52;c;55WM\u0007");
  });

  it("rejects empty text", () => {
    expect(() => encodeOsc52Clipboard("")).toThrow(/empty/i);
  });

  it("rejects text over the UTF-8 byte limit without truncating", () => {
    expect(() => encodeOsc52Clipboard("界", 2)).toThrow(/3 bytes.*2 bytes/i);
  });

  it("uses a one MiB default limit", () => {
    expect(DEFAULT_MAX_CLIPBOARD_BYTES).toBe(1024 * 1024);
    expect(() =>
      encodeOsc52Clipboard("x".repeat(DEFAULT_MAX_CLIPBOARD_BYTES + 1)),
    ).toThrow(/1048577 bytes.*1048576 bytes/i);
  });
});
