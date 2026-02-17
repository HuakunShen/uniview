# Protocol

<cite>
**Referenced Files in This Document**
- [packages/protocol/src/index.ts](file://packages/protocol/src/index.ts)
- [packages/protocol/src/rpc.ts](file://packages/protocol/src/rpc.ts)
- [packages/protocol/src/tree.ts](file://packages/protocol/src/tree.ts)
- [packages/protocol/src/events.ts](file://packages/protocol/src/events.ts)
- [packages/protocol/src/mutations.ts](file://packages/protocol/src/mutations.ts)
- [packages/protocol/package.json](file://packages/protocol/package.json)
</cite>

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Type Definitions](#type-definitions)
4. [RPC Interfaces](#rpc-interfaces)
5. [Event Handling](#event-handling)
6. [Mutations](#mutations)
7. [Validators](#validators)

## Overview

`@uniview/protocol` is the foundation package defining types, Zod schemas, and version contracts for plugin/host communication. It has zero runtime dependencies beyond Zod for validation.

**Section sources**

- [packages/protocol/package.json](file://packages/protocol/package.json)
- [packages/protocol/src/index.ts](file://packages/protocol/src/index.ts)

## Installation

```bash
pnpm add @uniview/protocol
```

## Type Definitions

### UINode

The core tree structure that plugins produce and hosts consume:

```typescript
interface UINode {
  id: string; // Unique identifier for reconciliation
  type: string; // Layout tag OR custom component type
  props: Record<string, JSONValue>; // JSON-serializable props only
  children: (UINode | string)[]; // Nested nodes or text
}
```

### JSONValue

Type for cross-boundary serialization:

```typescript
type JSONValue =
  | null
  | boolean
  | number
  | string
  | JSONValue[]
  | { [k: string]: JSONValue };
```

### UILayoutTag

Built-in HTML-like elements:

```typescript
type UILayoutTag =
  | "div"
  | "span"
  | "p"
  | "section"
  | "header"
  | "footer"
  | "nav"
  | "main"
  | "aside"
  | "article"
  | "ul"
  | "ol"
  | "li"
  | "br"
  | "hr"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "button"
  | "input"
  | "textarea"
  | "select"
  | "option"
  | "label"
  | "form"
  | "a"
  | "img"
  | "table"
  | "thead"
  | "tbody"
  | "tr"
  | "th"
  | "td"
  | "strong"
  | "em"
  | "code"
  | "pre";
```

**Section sources**

- [packages/protocol/src/tree.ts](file://packages/protocol/src/tree.ts#L1-L130)

## RPC Interfaces

### HostToPluginAPI

Methods the host calls on the plugin:

```typescript
interface HostToPluginAPI {
  initialize(req: {
    protocolVersion: number;
    props?: JSONValue;
  }): Promise<void>;
  updateProps(props: JSONValue): Promise<void>;
  executeHandler(handlerId: HandlerId, args: JSONValue[]): Promise<void>;
  destroy(): Promise<void>;
  updateItem(itemId: string, text: string): Promise<void>;
  syncTree(): Promise<void>;
}
```

### PluginToHostAPI

Methods the plugin calls on the host:

```typescript
interface PluginToHostAPI {
  updateTree(tree: UINode | null): void;
  applyMutations(mutations: Mutation[]): void;
  log(level: "log" | "info" | "warn" | "error", args: JSONValue[]): void;
  reportError(err: { message: string; stack?: string }): void;
}
```

**Section sources**

- [packages/protocol/src/rpc.ts](file://packages/protocol/src/rpc.ts#L9-L88)

## Event Handling

### Supported Events

```typescript
type EventPropName =
  | "onClick"
  | "onChange"
  | "onInput"
  | "onSubmit"
  | "onFocus"
  | "onBlur"
  | "onKeyDown"
  | "onKeyUp"
  | "onMouseEnter"
  | "onMouseLeave";
```

### Helper Functions

```typescript
// Convert event prop to handler ID prop
handlerIdProp("onClick"); // "_onClickHandlerId"

// Check if prop is a handler ID
isHandlerIdProp("_onClickHandlerId"); // true

// Extract event name from handler ID prop
extractEventName("_onClickHandlerId"); // "onClick"
```

**Section sources**

- [packages/protocol/src/events.ts](file://packages/protocol/src/events.ts)

## Mutations

For incremental updates:

```typescript
type Mutation =
  | { type: "appendChild"; parentId: string; node: UINode }
  | { type: "insertBefore"; parentId: string; node: UINode; beforeId: string }
  | { type: "removeChild"; parentId: string; nodeId: string }
  | { type: "setText"; parentId: string; childIndex: number; text: string }
  | { type: "setProps"; nodeId: string; props: Record<string, JSONValue> }
  | { type: "setRoot"; node: UINode | null };
```

### Update Modes

```typescript
type UpdateMode = "full" | "incremental";
```

**Section sources**

- [packages/protocol/src/mutations.ts](file://packages/protocol/src/mutations.ts)

## Validators

Zod schemas for runtime validation:

```typescript
import {
  UINodeSchema,
  JSONValueSchema,
  validateUINode,
} from "@uniview/protocol";

// Validate a tree
const result = UINodeSchema.safeParse(tree);
if (result.success) {
  // tree is valid UINode
}

// Direct validation with error handling
const validNode = validateUINode(rawNode);
```

### Available Schemas

| Schema                     | Purpose                            |
| -------------------------- | ---------------------------------- |
| `UINodeSchema`             | Validates full UINode structure    |
| `JSONValueSchema`          | Validates JSON-serializable values |
| `InitializeRequestSchema`  | Validates initialize request       |
| `UpdatePropsRequestSchema` | Validates updateProps request      |

**Section sources**

- [packages/protocol/src/validators.ts](file://packages/protocol/src/validators.ts)
