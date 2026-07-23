# Deno terminal adapter

`@uniview/tui-core` accepts a Node-style TTY contract: input/output listeners,
raw-mode control, terminal dimensions, and ANSI writes. Deno exposes terminal
resources through `Deno.stdin` and `Deno.stdout`, so keep the adaptation in one
small module.

## Required adapter behavior

1. Reject non-terminal stdin/stdout before entering raw mode.
2. Enable raw mode only when starting the app; restore it in every stop/error
   path.
3. Read `Deno.stdin.readable` as bytes and forward chunks to the input side of
   the core contract.
4. Encode ANSI strings and write them to `Deno.stdout`.
5. Read current terminal columns/rows from Deno's terminal APIs. Emit a resize
   event only when the runtime exposes a reliable resize source; otherwise
   document the limitation rather than polling silently.
6. Keep a disposer for every reader, listener, and raw-mode change. Test normal
   quit, Ctrl-C, and an exception while running.

## Installation and import

```bash
deno add @uniview/tui-core
```

Use the bare import recorded by `deno add`, or an explicit npm specifier:

```ts
import { createTuiApp } from "npm:@uniview/tui-core"
```

## Validation

Run from a real terminal using the current Deno command. Verify the adapter,
not only the render tree: send one input character, resize if supported, quit,
and confirm the terminal is restored. Do not treat a piped `deno run` as proof
of raw-mode behavior.
