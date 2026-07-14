# @uniview/solid-renderer

A universal [SolidJS](https://www.solidjs.com/) renderer for Uniview plugins. It
runs Solid's reactivity against a custom renderer that produces the same
`@uniview/protocol` **UINode** tree the React renderer does — so a Solid plugin
renders in any Uniview host (Svelte, React, Vue, TUI) with no host changes.

It is the Solid counterpart of `@uniview/react-renderer`: a Solid plugin's
components become a serializable UI tree + a handler registry, and reactive
updates flow to the host as mutations.

```
Solid components → solid-renderer → UINode tree → kkrpc → host
```

Used by `@uniview/solid-runtime` (plugin bootstrap) and the
`@uniview/tui-solid` adapter. See `src/renderer`, `src/mutation`, and
`src/serialization`.

```bash
pnpm build      # bundle
pnpm test       # vitest
```
