# @uniview/plugin-solid-example

Example **SolidJS plugins** for Uniview, proving the Solid authoring path end to
end (`@uniview/solid-renderer` + `@uniview/solid-runtime`). The same plugins run
in any host, alongside the React demo plugins.

Included:

- **advanced-demo** — a richer interactive Solid plugin (worker + client).
- **benchmark-full / benchmark-incremental** — measure full-tree vs
  incremental-mutation update paths.

Each has a `*.worker.ts` (the plugin, run in a Web Worker or bridge client) and
a `*.client.ts` driver.

```bash
pnpm build                     # bundle all entries
pnpm client:advanced           # run the advanced demo client
pnpm client:benchmark-incremental
```
