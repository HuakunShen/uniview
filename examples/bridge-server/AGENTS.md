# @uniview/bridge-server

**Parent:** [../../AGENTS.md](../../AGENTS.md)

## OVERVIEW

Shared WebSocket bridge server that multiplexes connections between Plugins and Hosts. Also serves static worker bundles.

## STRUCTURE

```
src/
└── index.ts  # Main Elysia server
```

## CONVENTIONS

### Protocol

- **Port**: Fixed at `:3000`
- **Plugin Connection**: `ws://localhost:3000/plugins/:pluginId`
- **Host Connection**: `ws://localhost:3000/host/:pluginId`
- **Static Files**: `http://localhost:3000/:filename` (serves from `../plugin-example/dist`)

### Message Forwarding

The bridge is a "dumb pipe". It does NOT parse messages. It blindly forwards bytes/strings from Plugin socket to Host socket and vice versa. This ensures protocol agnosticism.

## ANTI-PATTERNS

- ❌ **NEVER** add business logic here - keep it as a transparent proxy
- ❌ **NEVER** parse JSON messages - forwards raw data for performance and compatibility
