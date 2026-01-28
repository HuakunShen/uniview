# @uniview/protocol

Core types, schemas, and versioning for the Uniview plugin system.

## Installation

```bash
pnpm add @uniview/protocol
```

## Overview

This package defines the protocol for communication between Uniview plugins (React) and hosts (Svelte, Vue, etc.). It includes:

- **UINode**: The serializable tree structure representing UI
- **RPC interfaces**: Type-safe communication contracts
- **Event handling**: Handler ID conventions for cross-boundary events
- **Validators**: Zod schemas for runtime validation

## API

### Types

```typescript
import type {
  UINode,
  UILayoutTag,
  JSONValue,
  HandlerId,
  EventPropName,
  HostToPluginAPI,
  PluginToHostAPI,
} from "@uniview/protocol";
```

#### UINode

The core tree structure that plugins produce and hosts consume:

```typescript
interface UINode {
  id: string; // Unique identifier
  type: string; // Layout tag OR custom component type
  props: Record<string, JSONValue>;
  children: (UINode | string)[];
}
```

#### Layout Tags

Built-in HTML-like elements that hosts must support:

```typescript
const LAYOUT_TAGS = [
  "div",
  "span",
  "p",
  "section",
  "header",
  "footer",
  "ul",
  "ol",
  "li",
  "br",
  "hr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "button",
  "input",
  "form",
  "label",
] as const;
```

### Event Handling

```typescript
import { EVENT_PROPS, handlerIdProp } from "@uniview/protocol";

// Supported events
EVENT_PROPS; // ['onClick', 'onChange', 'onInput', 'onSubmit', ...]

// Get the handler ID prop name for an event
handlerIdProp("onClick"); // '_onClickHandlerId'
```

### RPC Interfaces

```typescript
// Host calls these on plugin
interface HostToPluginAPI {
  initialize(req: {
    protocolVersion: number;
    props?: JSONValue;
  }): Promise<void>;
  updateProps(props: JSONValue): Promise<void>;
  executeHandler(handlerId: HandlerId, args: JSONValue[]): Promise<void>;
  destroy(): Promise<void>;
}

// Plugin calls these on host
interface PluginToHostAPI {
  updateTree(tree: UINode | null): void;
  log(level: "log" | "info" | "warn" | "error", args: JSONValue[]): void;
  reportError(err: { message: string; stack?: string }): void;
}
```

### Validators

```typescript
import { UINodeSchema, validateUINode } from "@uniview/protocol";

// Validate a tree
const result = UINodeSchema.safeParse(tree);
if (result.success) {
  // tree is valid UINode
}
```

## Protocol Version

```typescript
import { PROTOCOL_VERSION } from "@uniview/protocol";
// Currently: 1
```

The protocol version is used during initialization to ensure host/plugin compatibility.
