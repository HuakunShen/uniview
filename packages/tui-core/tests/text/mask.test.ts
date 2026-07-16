import { describe, expect, it } from "vitest";
import { DEFAULT_MASK, maskText } from "../../src/text/mask";

describe("maskText", () => {
  it("masks each grapheme with the default bullet", () => {
    expect(maskText("secret")).toBe("••••••");
    expect(DEFAULT_MASK).toBe("•");
  });

  it("honors a custom mask grapheme", () => {
    expect(maskText("pw", "*")).toBe("**");
  });

  it("counts grapheme clusters, not code points (emoji → one mask)", () => {
    expect(maskText("👍a")).toBe("••");
  });

  it("masks nothing for the empty string", () => {
    expect(maskText("")).toBe("");
  });
});
