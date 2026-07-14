# @uniview/example-host-react

A **React host** demo: a browser app (Vite + React) that embeds Uniview plugins
via `@uniview/host-sdk`. It shows the host side of the system — loading plugins
in Worker mode and over the WebSocket bridge, rendering their UINode trees with
React, and routing events back.

Because the host is framework-agnostic, the very same plugins also run in the
Svelte and Vue host demos.

```bash
# from this directory — starts the bridge, waits for plugins, then the host:
pnpm dev:all

# or the host alone (expects a bridge already running):
pnpm dev
```

Then open the printed Vite URL. See also `examples/host-svelte-demo` and
`examples/host-vue-demo`.
