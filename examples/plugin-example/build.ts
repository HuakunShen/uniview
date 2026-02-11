import { serve, type BunPlugin } from "bun";

// Force all react imports to resolve from this package's node_modules,
// preventing multiple React copies when pnpm creates separate copies
// across the dependency tree (e.g. react-reconciler/node_modules/react).
const reactDedup: BunPlugin = {
	name: "react-dedup",
	setup(build) {
		const cwd = process.cwd();
		build.onResolve({ filter: /^react(\/.*)?$/ }, (args) => {
			return { path: Bun.resolveSync(args.path, cwd) };
		});
	},
};

const workerEntrypoints = [
  "./src/simple-demo.worker.ts",
  "./src/advanced-demo.worker.ts",
];

const clientEntrypoints = [
  "./src/simple-demo.client.ts",
  "./src/advanced-demo.client.ts",
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
      plugins: [reactDedup],
    });
    return { entry, result };
  }),
);

const clientResults = await Promise.all(
  clientEntrypoints.map(async (entry) => {
    const result = await Bun.build({
      entrypoints: [entry],
      outdir: "./dist",
      target: "bun",
      format: "esm",
      minify: false,
      sourcemap: "external",
      naming: "[name].js",
      plugins: [reactDedup],
    });
    return { entry, result };
  }),
);

const results = [...workerResults, ...clientResults];

let allSuccess = true;
for (const { entry, result } of results) {
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
}
