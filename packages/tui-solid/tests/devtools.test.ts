import { describe, expect, it } from "vitest";
import { connectSolidDevTools } from "../src/index";

describe("connectSolidDevTools", () => {
  it("does nothing when the dev flag is off", async () => {
    let called = 0;
    await connectSolidDevTools({ enabled: false, connect: () => void (called += 1) });
    expect(called).toBe(0);
  });

  it("runs the injected connector when enabled", async () => {
    let called = 0;
    await connectSolidDevTools({ enabled: true, connect: () => void (called += 1) });
    expect(called).toBe(1);
  });

  it("swallows a connector failure (devtools package absent) without throwing", async () => {
    await expect(
      connectSolidDevTools({
        enabled: true,
        connect: () => {
          throw new Error("not installed");
        },
      }),
    ).resolves.toBeUndefined();
  });
});
