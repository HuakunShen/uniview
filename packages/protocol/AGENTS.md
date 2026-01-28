# @uniview/protocol

**Parent:** [../../AGENTS.md](../../AGENTS.md)

## OVERVIEW

Protocol definitions for Uniview plugin/host communication. Pure TypeScript with Zod schemas - zero dependencies beyond validation.

## WHERE TO LOOK

| Task             | Location            | Notes                                 |
| ---------------- | ------------------- | ------------------------------------- |
| Type definitions | `src/types.ts`      | UINode, JSONValue, layout tags        |
| RPC contracts    | `src/rpc.ts`        | HostToPluginAPI, PluginToHostAPI      |
| Event mappings   | `src/events.ts`     | Click, change, input, submit handlers |
| Validation       | `src/validators.ts` | Zod schemas for runtime checks        |
| Version constant | `src/version.ts`    | Protocol version number               |

## CONVENTIONS

### Exports

Single entry point exports all types, constants, and validators:

```typescript
export * from "./types";
export * from "./rpc";
export * from "./events";
export * from "./validators";
export * from "./version";
```

### Event Prop Convention

Event handlers → handler IDs via naming pattern:

- `onClick` → `_onClickHandlerId`
- `onChange` → `_onChangeHandlerId`
- Use `handlerIdProp(eventName)` helper

### JSONValue Constraint

All props/args serializable - functions become handler IDs before crossing RPC.

## ANTI-PATTERNS

- ❌ **NEVER** add product-specific types (Button, Card, etc.) - keep product-agnostic
- ❌ **NEVER** add dependencies beyond Zod - protocol must be lightweight
- ❌ **NEVER** change types without bumping PROTOCOL_VERSION

## NOTES

### Protocol Versioning

Host/plugin check version on `initialize()` - mismatch = clear error. Breaking changes require version bump.

### Layout Tags

`LAYOUT_TAGS` defines HTML-like primitives all hosts must support. Adding tags is non-breaking; removing is breaking.
