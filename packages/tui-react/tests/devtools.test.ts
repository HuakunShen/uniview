import { describe, expect, it } from "vitest";
import { connectReactDevTools } from "../src/index";

describe("connectReactDevTools", () => {
  it("does nothing when the dev flag is off", async () => {
    let called = 0;
    await connectReactDevTools({ enabled: false, connect: () => void (called += 1) });
    expect(called).toBe(0);
  });

  it("runs the injected connector when enabled", async () => {
    let called = 0;
    await connectReactDevTools({ enabled: true, connect: () => void (called += 1) });
    expect(called).toBe(1);
  });

  it("swallows a connector failure (devtools package absent) without throwing", async () => {
    await expect(
      connectReactDevTools({
        enabled: true,
        connect: () => {
          throw new Error("not installed");
        },
      }),
    ).resolves.toBeUndefined();
  });
});
