import { serve } from "bun";

const workerEntrypoints = [
  "./src/simple-demo.worker.ts",
  "./src/advanced-demo.worker.ts",
  "./src/raycast-demo.worker.ts",
  "./src/clipboard-history-demo.worker.ts",
  "./src/grid-demo.worker.ts",
  "./src/form-demo.worker.ts",
  "./src/detail-demo.worker.ts",
  "./src/benchmark-full.worker.ts",
  "./src/benchmark-incremental.worker.ts",
];

const workerResults = await Promise.all(
  workerEntrypoints.map(async (entry) => {
    const result = await Bun.build({
      entrypoints: [entry],
      outdir: "./dist",
      target: "browser",
      format: "esm",
      minify: false,
      sourcemap: "external",
      naming: "[name].js",
      external: ["ioredis", "kafkajs", "amqplib"],
    });
    return { entry, result };
  }),
);

let allSuccess = true;
for (const { entry, result } of workerResults) {
  if (!result.success) {
    console.error(`Build failed for ${entry}:`);
    for (const log of result.logs) {
      console.error(log);
    }
    allSuccess = false;
  } else {
    console.log(
      `Built ${entry}:`,
      result.outputs.map((o) => o.path),
    );
  }
}

if (!allSuccess) {
  process.exit(1);
}

console.log("Build complete!");

if (process.argv.includes("--serve")) {
  const PORT = 3000;
  serve({
    port: PORT,
    fetch(req) {
      const url = new URL(req.url);
      let pathname = url.pathname;
      if (pathname === "/") {
        pathname = "/index.html";
      }
      const file = Bun.file(`./dist${pathname}`);
      const contentType = pathname.endsWith(".js")
        ? "application/javascript"
        : pathname.endsWith(".map")
          ? "application/json"
          : "text/plain";
      return new Response(file, {
        headers: {
          "Content-Type": contentType,
          "Access-Control-Allow-Origin": "*",
        },
      });
    },
  });
  console.log(`Serving on http://localhost:${PORT}`);
  console.log("Available plugins:");
  console.log(`  - http://localhost:${PORT}/simple-demo.worker.js`);
  console.log(`  - http://localhost:${PORT}/advanced-demo.worker.js`);
  console.log(`  - http://localhost:${PORT}/raycast-demo.worker.js`);
  console.log(`  - http://localhost:${PORT}/clipboard-history-demo.worker.js`);
  console.log(`  - http://localhost:${PORT}/grid-demo.worker.js`);
  console.log(`  - http://localhost:${PORT}/form-demo.worker.js`);
  console.log(`  - http://localhost:${PORT}/detail-demo.worker.js`);
  console.log(`  - http://localhost:${PORT}/benchmark-full.worker.js`);
  console.log(`  - http://localhost:${PORT}/benchmark-incremental.worker.js`);
}
