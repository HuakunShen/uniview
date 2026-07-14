# @uniview/solid-runtime

Runtime bootstrap for SolidJS-based Uniview plugins. It wires a Solid plugin
(rendered via `@uniview/solid-renderer`) to a host over kkrpc, mirroring
`@uniview/react-runtime` for Solid.

Entry points for the three execution environments:

| Entry | Environment | Use |
| --- | --- | --- |
| `worker-entry.ts` | browser Web Worker | production, sandboxed plugins |
| `ws-client-entry.ts` / `ws-client.ts` | Node / Deno / Bun | server-side plugins via the WebSocket bridge |
| `runtime.ts` | shared | the transport-agnostic plugin loop |

```ts
// worker plugin
import { startWorkerPlugin } from "@uniview/solid-runtime";
startWorkerPlugin(() => <App />);
```

```bash
pnpm build
pnpm test
```
