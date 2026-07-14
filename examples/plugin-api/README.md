# @uniview/example-plugin-api

A small library of **React component primitives** for Uniview demo plugins —
`Button`, `Input`, `List`, `Detail`, and a Raycast-style layout. Plugins compose
these instead of emitting raw protocol nodes; each primitive maps to the shared
UINode contract so any host can render it.

This package is imported by the demo plugins (e.g. `examples/plugin-example`),
not run on its own.

```tsx
import { List, Detail } from "@uniview/example-plugin-api";

<List searchBarPlaceholder="Search…">
  <List.Item title="Hello" detail={<Detail markdown="# Hi" />} />
</List>;
```

The SolidJS equivalent is `@uniview/example-solid-plugin-api`.

```bash
pnpm build
```
