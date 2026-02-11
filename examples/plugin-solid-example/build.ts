import { transformAsync } from "@babel/core"
import ts from "@babel/preset-typescript"
import solid from "babel-preset-solid"

const isWatch = process.argv.includes("--watch")

const solidTransformPlugin = {
  name: "bun-plugin-solid",
  setup(build: { onLoad: (filter: { filter: RegExp }, callback: (args: { path: string }) => Promise<{ contents: string; loader: string }>) => void }) {
    build.onLoad({ filter: /\.(js|ts)x$/ }, async (args: { path: string }) => {
      const file = Bun.file(args.path)
      const code = await file.text()
      const transforms = await transformAsync(code, {
        filename: args.path,
        presets: [
          [
            solid,
            {
              moduleName: "@uniview/solid-renderer",
              generate: "universal",
            },
          ],
          [ts],
        ],
      })
      return {
        contents: transforms?.code ?? "",
        loader: "js",
      }
    })
  },
}

const workerEntrypoints = [
  "./src/simple-demo.worker.ts",
  "./src/advanced-demo.worker.ts",
  "./src/benchmark-full.worker.ts",
  "./src/benchmark-incremental.worker.ts",
]

const clientEntrypoints = [
  "./src/simple-demo.client.ts",
  "./src/advanced-demo.client.ts",
  "./src/benchmark-full.client.ts",
  "./src/benchmark-incremental.client.ts",
]

async function build() {
  console.log("Building Solid plugins...")

  const workerBuilds = workerEntrypoints.map(async (entry) => {
    const result = await Bun.build({
      entrypoints: [entry],
      outdir: "./dist",
      plugins: [solidTransformPlugin as any],
      target: "browser",
      format: "esm",
      sourcemap: "external",
    })
    return { entry, result }
  })

  const clientBuilds = clientEntrypoints.map(async (entry) => {
    const result = await Bun.build({
      entrypoints: [entry],
      outdir: "./dist",
      plugins: [solidTransformPlugin as any],
      target: "bun",
      format: "esm",
      conditions: ["browser"],
      sourcemap: "external",
    })
    return { entry, result }
  })

  const results = await Promise.all([...workerBuilds, ...clientBuilds])

  let allSuccess = true
  for (const { entry, result } of results) {
    if (!result.success) {
      console.error(`Build failed for ${entry}:`)
      for (const log of result.logs) {
        console.error(log)
      }
      allSuccess = false
    } else {
      const outputFile = result.outputs[0]
      const size = outputFile ? (await outputFile.text()).length : 0
      console.log(`Built ${entry}: ${(size / 1024).toFixed(2)} KB`)
    }
  }

  if (!allSuccess) {
    process.exit(1)
  }

  console.log("Build complete!")
}

if (isWatch) {
  console.log("Watching for changes...")
  build()

  const watcher = Bun.watch("./src", async (event, filename) => {
    console.log(`File changed: ${filename}`)
    await build()
  })

  process.on("SIGINT", () => {
    watcher.stop()
    process.exit(0)
  })
} else {
  await build()
}
