# @uniview/bridge-server

The shared WebSocket **bridge** for server-side Uniview plugins — a small
[Elysia](https://elysiajs.com/) server that multiplexes plugin ↔ host
connections over a single port.

Server-side plugins (Node/Deno/Bun) connect _to_ the bridge instead of the host
connecting to each plugin, which sidesteps port/NAT issues and keeps deployment
to one stable address. The bridge forwards kkrpc frames transparently.

```
┌────────────┐   WS   ┌───────────────┐   WS   ┌────────────────┐
│ Browser    │◄──────►│ Bridge Server │◄──────►│ Plugin Client  │
│ Host       │        │ (Elysia)      │        │ (Node/Deno/Bun)│
└────────────┘        └───────────────┘        └────────────────┘
```

Listens on **port 3000**. Used by the React and Vue host demos (their
`dev:all` scripts start it automatically).

```bash
pnpm start      # run the bridge
pnpm dev        # watch mode
pnpm test       # vitest
```
