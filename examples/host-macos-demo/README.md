# Host macOS Demo

A native macOS SwiftUI application that demonstrates rendering React plugins via the uniview protocol.

## Overview

This demo shows how uniview plugins can run in isolated environments and render UI in native macOS applications, not just web browsers. The architecture:

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  macOS Host     │◄─────►│  Bridge Server  │◄─────►│  Plugin Client  │
│  (SwiftUI)      │  WS   │  (Elysia)       │  WS   │  (Node.js)      │
└─────────────────┘       └─────────────────┘       └─────────────────┘
```

### What This Demonstrates

- **Cross-platform plugins**: Write React plugins once, run them in any host (Svelte, Vue, native macOS)
- **Full isolation**: Plugins run in separate processes (Node.js/Deno/Bun) via WebSocket
- **Native UI**: SwiftUI renders plugin UI with native look and feel
- **Bidirectional RPC**: Button clicks, input changes flow back to plugin; state updates flow to UI

### Key Problems Solved

1. **RPC Protocol Alignment**: Swift host must match kkrpc's request/response format exactly
2. **Handler Invocation**: Event handlers are IDs, not functions - need registry + execute pattern
3. **Text Rendering**: Nested text nodes (inline spans) require recursive extraction
4. **Input State Sync**: Two-way binding between SwiftUI TextField and plugin state

## Prerequisites

- macOS 14.0+
- Xcode 15.0+
- [Bun](https://bun.sh/) runtime for the bridge server and plugins

## Project Structure

```
HostMacOSDemo/
├── HostMacOSDemoApp.swift      # App entry point
├── ContentView.swift           # Main UI with connection controls
├── Models/
│   ├── UINode.swift           # Protocol types (UINode, JSONValue)
│   ├── RPCMessage.swift       # kkrpc message structures
│   └── MessageParser.swift    # Message serialization/deserialization
├── Services/
│   ├── WebSocketClient.swift  # URLSessionWebSocketTask wrapper
│   └── RPCClient.swift        # High-level RPC protocol client
└── Views/
    └── UINodeRenderer.swift   # Recursive SwiftUI view builder
```

## Quick Start

### 1. Start the Bridge Server

```bash
cd examples/bridge-server
bun src/index.ts
```

The bridge will start on `ws://localhost:3000`.

### 2. Start a Plugin Client

In a new terminal:

```bash
cd examples/plugin-example
bun src/simple-demo.client.ts
```

This connects the plugin to the bridge.

### 3. Launch the macOS App

Open the project in Xcode:

```bash
open examples/host-macos-demo/HostMacOSDemo.xcodeproj
```

Then press **Cmd+R** to run.

## Usage

1. **Connect**: Click the "Connect" button to connect to the bridge
2. **Plugin ID**: The default plugin ID is `simple-demo`, change it to connect to other plugins
3. **Interact**: Click buttons and type in input fields - all interactions flow back to the plugin via RPC
4. **Disconnect**: Click "Disconnect" to close the connection

## Supported Components

The macOS host supports these UINode types:

- `div` - VStack container
- `p`, `span` - Text views
- `h1` through `h6` - Headings with appropriate font sizes
- `ul`, `li` - Lists with bullet points
- `button`, `Button` - SwiftUI buttons with tap handlers
- `input`, `Input` - SwiftUI text fields with change handlers

## How It Works

### Data Flow

1. **Plugin renders React** → `@uniview/react-renderer` serializes to UINode tree
2. **Plugin sends tree** → `rpc.getAPI().updateTree(tree)` via kkrpc
3. **Bridge forwards** → WebSocket message to connected macOS host
4. **Host parses** → `MessageParser` decodes JSON → `UINode` Swift struct
5. **SwiftUI renders** → `UINodeRenderer` recursively builds view hierarchy
6. **User interacts** → Button click → `executeHandler(handlerId, args)` → Plugin updates state → New tree sent

### RPC Protocol (kkrpc)

**Request Format:**

```json
{
  "id": "msg_123",
  "method": "executeHandler",
  "args": ["handler_0", ["new value"]],
  "type": "request"
}
```

**Response Format:**

```json
{
  "id": "msg_123",
  "args": { "result": null },
  "type": "response"
}
```

**Host → Plugin:**

- `initialize({ protocolVersion: 1 })` - Handshake, plugin returns void
- `executeHandler(handlerId, args)` - Invoke event handler by ID

**Plugin → Host:**

- `updateTree(tree)` - UI tree updates after each React render
- `log(level, message)` - Plugin console output
- `reportError(error)` - Error reporting

### Handler ID Convention

Event handlers become IDs before crossing RPC boundary:

| React Event | UINode Prop          | Example Value |
| ----------- | -------------------- | ------------- |
| `onClick`   | `_onClickHandlerId`  | `"handler_0"` |
| `onChange`  | `_onChangeHandlerId` | `"handler_1"` |

Host extracts ID, calls `executeHandler(id, args)`, plugin invokes original function.

## Development

### Project Structure

```
HostMacOSDemo/
├── HostMacOSDemoApp.swift      # App entry point
├── ContentView.swift           # Main UI with connection controls
├── Models/
│   ├── UINode.swift           # Protocol types (UINode, JSONValue, UINodeChild)
│   ├── RPCMessage.swift       # kkrpc message structures (request/response/callback)
│   └── MessageParser.swift    # JSON serialization with superjson support
├── Services/
│   ├── WebSocketClient.swift  # URLSessionWebSocketTask wrapper
│   └── RPCClient.swift        # High-level RPC client with state machine
└── Views/
    └── UINodeRenderer.swift   # Recursive SwiftUI view builder
```

### Adding New Components

To add support for new UINode types:

1. Add a new case in `UINodeRenderer.swift`'s `renderNode` switch statement
2. Implement a `@ViewBuilder` function for the component
3. Extract handler IDs using `node.handlerId(for: "eventName")`
4. For input components, handle two-way binding with `onChange` modifiers

### Key Implementation Details

**State Machine (RPCClient.swift):**

- `.disconnected` → `.connecting` → `.connected` → `.initialized`
- Must reach `.initialized` before `executeHandler` works
- State transitions trigger UI updates via `@Published`

**Message Parsing (MessageParser.swift):**

- Handles superjson format: `{"json": {...}, "meta": {...}}`
- Detects superjson by checking for `"json"` and `"meta"` keys
- Falls back to raw JSON if not superjson

**Handler Registry Pattern:**

- Plugin registers handlers, gets IDs like `"handler_0"`
- Host stores ID → callback mapping
- On interaction, host calls `executeHandler(id, args)`
- Plugin invokes original function, returns new state

### Debugging

Enable verbose logging:

```swift
// In RPCClient.swift, add to key methods:
print("[RPC] State: \(state), Method: \(method)")
```

Check Console app:

- Filter by "HostMacOSDemo"
- Look for `[log]` messages from the plugin
- Connection state changes logged to stdout

## Common Pitfalls & Lessons Learned

### 1. RPC Response Format Mismatch

**Problem:** `initialize()` fails, state stuck at `.connected`, handlers return `notConnected` error.

**Root Cause:** kkrpc responses use object format `args: { result, error }`, not array `args: [result]`.

**Fix:** Updated `RPCMessage` and response parsing to extract from object:

```swift
guard let args = message.args?.objectValue else { ... }
let result = args["result"]
let error = args["error"]
```

### 2. Handler Invocation Pattern

**Problem:** Button clicks don't trigger state updates.

**Root Cause:** Initially sent handler invocation as `callback` type message. Plugin expects `request` to `executeHandler` method.

**Fix:** Changed to proper request format:

```swift
let requestArgs: [JSONValue] = [
    .string(handlerId),    // First arg: handler ID
    .array(args)           // Second arg: handler arguments
]
return try await sendRequest(method: "executeHandler", args: requestArgs)
```

### 3. Text Content Extraction

**Problem:** "Hello, ! You clicked the button times" - missing name and count.

**Root Cause:** Text was in nested `<span>` elements, not direct children. Original extraction only looked at direct text children.

**Fix:** Recursive text extraction that flattens all nested nodes:

```swift
private func extractTextContent(_ node: UINode) -> String {
    var result = ""
    for child in node.children {
        switch child {
        case .text(let text): result.append(text)
        case .node(let nested): result.append(extractTextContent(nested))
        }
    }
    return result
}
```

### 4. Button Title Source

**Problem:** All buttons show "Button" instead of actual labels.

**Root Cause:** Custom `Button` component uses `title` prop, not children text.

**Fix:** Check both sources:

```swift
let titleFromProp = node.props["title"]?.stringValue
let titleFromChildren = extractTextContent(node)
let title = titleFromProp ?? (titleFromChildren.isEmpty ? "Button" : titleFromChildren)
```

### 5. Input Two-Way Binding

**Problem:** Input doesn't reflect plugin state changes.

**Root Cause:** SwiftUI `@State` was initialized once, never updated when plugin sent new value.

**Fix:** Added `onChange(of: value)` to sync external updates:

```swift
.onChange(of: value) { newValue in
    if newValue != text {
        text = newValue
    }
}
```

### 6. Initialize Success Handling

**Problem:** Plugin's `initialize()` returns `void`, but host expected `{ success: true }`.

**Fix:** Treat any successful response (no error) as success:

```swift
_ = try await sendRequest(method: "initialize", args: args)
updateState(.initialized)  // Don't check for success flag
```

## Troubleshooting

### "Cannot find type 'UINode' in scope"

This is an LSP false positive. The project builds correctly in Xcode. The LSP server doesn't understand the Swift module structure.

### Build hangs or crashes

There may be an issue with the kkrpc SPM dependency. Try:

1. Clean build folder (Cmd+Shift+K)
2. Reset package caches (File → Packages → Reset Package Caches)
3. Delete derived data

### Connection fails

- Ensure bridge server is running on port 3000
- Ensure plugin client is connected
- Check that plugin ID matches exactly

## License

MIT - Part of the uniview project
