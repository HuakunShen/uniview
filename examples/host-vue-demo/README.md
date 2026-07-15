# @uniview/example-host-vue

A **Vue host** demo: a browser app (Vite + Vue 3) that embeds Uniview plugins
via `@uniview/host-sdk`. It demonstrates that the host controller is genuinely
framework-agnostic — the same plugins that run in the Svelte and React host
demos render here through a Vue adapter.

```bash
# from this directory — starts the bridge, waits for plugins, then the host:
pnpm dev:all

# or the host alone (expects a bridge already running):
pnpm dev
```

Then open the printed Vite URL. See also `examples/host-svelte-demo` and
`examples/host-react-demo`.
