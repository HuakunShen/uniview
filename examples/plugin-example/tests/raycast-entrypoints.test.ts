import { describe, expect, test } from "bun:test";
import { sampleScreenshotDataURL } from "../src/sample-assets";

describe("raycast demo entrypoints", () => {
  test("run in incremental update mode", async () => {
    const clientSource = await Bun.file(
      new URL("../src/raycast-demo.client.ts", import.meta.url),
    ).text();
    const workerSource = await Bun.file(
      new URL("../src/raycast-demo.worker.ts", import.meta.url),
    ).text();
    const clipboardClientSource = await Bun.file(
      new URL("../src/clipboard-history-demo.client.ts", import.meta.url),
    ).text();
    const clipboardWorkerSource = await Bun.file(
      new URL("../src/clipboard-history-demo.worker.ts", import.meta.url),
    ).text();
    const gridClientSource = await Bun.file(
      new URL("../src/grid-demo.client.ts", import.meta.url),
    ).text();
    const gridWorkerSource = await Bun.file(
      new URL("../src/grid-demo.worker.ts", import.meta.url),
    ).text();
    const formClientSource = await Bun.file(
      new URL("../src/form-demo.client.ts", import.meta.url),
    ).text();
    const formWorkerSource = await Bun.file(
      new URL("../src/form-demo.worker.ts", import.meta.url),
    ).text();
    const detailClientSource = await Bun.file(
      new URL("../src/detail-demo.client.ts", import.meta.url),
    ).text();
    const detailWorkerSource = await Bun.file(
      new URL("../src/detail-demo.worker.ts", import.meta.url),
    ).text();

    expect(clientSource).toContain('mode: "incremental"');
    expect(workerSource).toContain('mode: "incremental"');
    expect(clipboardClientSource).toContain('pluginId: "clipboard-history"');
    expect(clipboardWorkerSource).toContain('mode: "incremental"');
    expect(gridClientSource).toContain('pluginId: "grid-demo"');
    expect(gridWorkerSource).toContain('mode: "incremental"');
    expect(formClientSource).toContain('pluginId: "form-demo"');
    expect(formWorkerSource).toContain('mode: "incremental"');
    expect(detailClientSource).toContain('pluginId: "detail-demo"');
    expect(detailWorkerSource).toContain('mode: "incremental"');
  });

  test("include a valid non-trivial PNG sample image", () => {
    const dataURLPrefix = "data:image/png;base64,";
    expect(sampleScreenshotDataURL.startsWith(dataURLPrefix)).toBe(true);

    const bytes = Buffer.from(sampleScreenshotDataURL.slice(dataURLPrefix.length), "base64");
    expect(bytes.length).toBeGreaterThan(1000);
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });
});
