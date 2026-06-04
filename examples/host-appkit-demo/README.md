# Host AppKit Demo

A native macOS host for uniview plugins using **pure AppKit** (no SwiftUI). Uses a view model layer and diff-based tree reconciler for efficient in-place updates — the same architecture as React Native.

The host now opens as a Raycast-style command window: search commands in the left pane, press Return or click **Run**, and render the selected plugin on the right. The Raycast-style demo plugins exercise native `List`, `Grid`, `Detail`, `Form`, `ActionPanel`, `Action`, `EmptyView`, and image preview nodes over the existing UINode/kkrpc bridge.

## Architecture

Unlike the SwiftUI demo (`host-macos-demo`) which rebuilds the entire view tree on each update, this example uses:

1. **View Model Layer** — `NodeViewModel` sits between `UINode` (JSON data) and `NSView`, tracking changes with a bitfield
2. **Diff-Based Reconciliation** — `TreeReconciler` matches nodes by stable ID, updates props in-place, and only adds/removes views when the tree structure changes
3. **Imperative NSView Updates** — Each `NSView` subclass conforms to `UpdatableNodeView` for surgical prop updates

```
React Plugin → UINode (JSON) → NodeViewModel → NSView (AppKit)
                                     ↑
                              TreeReconciler
                           (id-based diffing)
```

### Component Mapping

| UINode type | NSView | Notes |
|---|---|---|
| `div`, `section`, `form`, ... | `ContainerView` (NSStackView) | Vertical default, horizontal with flex hint |
| `p`, `span`, `strong`, `em`, `code` | `TextNodeView` (NSTextField label) | Typography varies by type |
| `h1`–`h6` | `TextNodeView` | Sized fonts |
| `img` | `RaycastImageNodeView` (NSImageView) | Data URL, file URL/path, and SF Symbol sources |
| `button` | `ButtonNodeView` (NSButton) | target/action → RPC handler |
| `input` | `InputNodeView` (NSTextField) | NSTextFieldDelegate → RPC handler |
| `Switch` | `SwitchNodeView` (NSSwitch) | Native macOS toggle switch |
| `Toggle` | `ToggleNodeView` (NSButton pushOnPushOff) | Toggle button with on/off state |
| `label` | `TextNodeView` (NSTextField label) | Same as `p`/`span` |
| `ul`, `ol` | `ListContainerView` (NSStackView) | Left-indented |
| `li` | `ListItemView` (NSStackView) | Bullet + text |
| `List` | `RaycastListNodeView` (NSSearchField + NSTableView) | Native command/list surface |
| `ListItem` | Row model inside `RaycastListNodeView` | Title, subtitle, icon, accessories |
| `Grid` | `RaycastGridNodeView` (NSCollectionView) | Searchable native visual grid |
| `Form` | `RaycastFormNodeView` (NSTextField/NSTextView/NSButton/NSPopUpButton) | Native preferences and command forms |
| `Detail` | `DetailNodeView` (NSImageView + NSTextView + metadata) | Markdown text plus explicit image preview |
| `ActionPanel` / `Action` | Native action buttons and popover | Handler IDs execute over RPC |
| `EmptyView` | Centered native empty state | Title + optional description |

## Running

1. Start the bridge server:
   ```bash
   cd examples/bridge-server && bun run dev
   ```

2. Start a plugin:
   ```bash
   # Simple counter demo
   cd examples/plugin-example && bun run client:simple

   # Advanced form demo (Switch, Toggle, Input)
   cd examples/plugin-example && bun run client:advanced

   # Raycast-style list/detail/action demo
   cd examples/plugin-example && bun run client:raycast

   # Clipboard history list/detail/image preview demo
   cd examples/plugin-example && bun run client:clipboard

   # Grid, form, or standalone detail demos
   cd examples/plugin-example && bun run client:grid
   cd examples/plugin-example && bun run client:form
   cd examples/plugin-example && bun run client:detail
   ```

3. Open `HostAppKitDemo.xcodeproj` in Xcode, build and run (⌘R)

4. Search for `Clipboard History`, `Grid Demo`, `Preferences Form`, `Detail Demo`, `Raycast Demo`, `Simple Demo`, or `Advanced Demo`, then press Return or click **Run**

## Testing

Run the standalone model and renderer regression tests:

```bash
bash examples/host-appkit-demo/tests/run.sh
```

The UI test target includes a bridge-free fixture mode for validating the native renderer directly:

```bash
xcodebuild test \
  -project examples/host-appkit-demo/HostAppKitDemo.xcodeproj \
  -scheme HostAppKitDemo \
  -configuration Debug \
  -derivedDataPath /tmp/uniview-host-appkit-derived \
  -destination 'platform=macOS' \
  -only-testing:HostAppKitDemoUITests
```

`UNIVIEW_APPKIT_UI_FIXTURE=clipboard-image` injects a Clipboard History `List` UINode tree at launch so tests can verify the AppKit `List`, `List.Item.Detail`, explicit `img` preview, metadata, and action button mapping without depending on the WebSocket bridge.

## Project Structure

```
HostAppKitDemo/
├── App/                  # App lifecycle (AppDelegate, no SwiftUI @main)
│   ├── main.swift
│   ├── AppDelegate.swift
│   ├── MainWindowController.swift
│   └── MainViewController.swift
├── Models/               # Shared protocol types (copied from host-macos-demo)
│   ├── UINode.swift
│   ├── RPCMessage.swift
│   └── MessageParser.swift
├── Services/             # Network + RPC (adapted for AppKit)
│   ├── WebSocketClient.swift
│   └── RPCClient.swift
├── ViewModels/           # Intermediate layer + reconciler
│   ├── NodeViewModel.swift
│   └── TreeReconciler.swift
└── Views/                # AppKit NSView subclasses
    ├── NodeViewFactory.swift
    ├── ContainerView.swift
    ├── TextNodeView.swift
    ├── ButtonNodeView.swift
    ├── InputNodeView.swift
    ├── SwitchNodeView.swift
    ├── ToggleNodeView.swift
    └── ListNodeView.swift
```

## Key Differences from SwiftUI Demo

| | SwiftUI Demo | AppKit Demo |
|---|---|---|
| **Framework** | SwiftUI declarative views | AppKit imperative NSViews |
| **Update strategy** | Full rebuild on each `updateTree` | Diff-based: only changed views update |
| **View model layer** | None (UINode → SwiftUI directly) | NodeViewModel with dirty tracking |
| **Entry point** | `@main` SwiftUI App | `main.swift` + AppDelegate |
| **State management** | `@StateObject`, `@Published` | Closure callbacks |

---

## Design Guide: Building a React-Native-Style Rendering System

This section documents how to design and implement a system that renders React component trees into native platform views — the same pattern used by React Native and this demo.

### The Core Idea

React plugins produce a **serialized UI tree** (JSON). A native host consumes this tree and renders it with platform-native views. The challenge is doing this *efficiently* — not rebuilding the entire view hierarchy on every state change.

The solution is a three-layer architecture:

```
┌─────────────────────────────────────────────────┐
│  React Plugin (JavaScript)                      │
│  - Standard React components (div, button, etc) │
│  - Custom reconciler serializes to UINode tree   │
│  - Sends tree over RPC on every state change     │
└──────────────────────┬──────────────────────────┘
                       │ JSON-RPC (WebSocket)
                       ▼
┌─────────────────────────────────────────────────┐
│  View Model Layer (NodeViewModel)               │
│  - Mirrors the UINode tree as reference types    │
│  - Tracks dirty fields with a bitfield           │
│  - Holds weak ref to associated native view      │
└──────────────────────┬──────────────────────────┘
                       │ diff(oldTree, newTree)
                       ▼
┌─────────────────────────────────────────────────┐
│  Native View Layer (NSView / UIView / etc.)     │
│  - One native view class per element type        │
│  - Conforms to UpdatableNodeView protocol        │
│  - Receives surgical prop updates, not rebuilds  │
└─────────────────────────────────────────────────┘
```

### Step 1: Define the Serialized UI Tree

The React side uses a custom reconciler (see `packages/renderer`) that converts React elements into a JSON-serializable tree:

```typescript
interface UINode {
  id: string;        // Stable ID from React reconciler
  type: string;      // "div", "button", "input", etc.
  props: Record<string, any>;
  children: (UINode | string)[];  // Nodes or text
}
```

Key design decisions:
- **Stable IDs**: The React reconciler assigns a unique `id` to each node. These are stable across re-renders (same component = same ID). This is what makes O(1) diffing possible.
- **Handler IDs instead of functions**: Functions can't be serialized. Instead, `onClick` becomes `_onClickHandlerId: "handler_0"`. The host calls back to the plugin with this ID when the event fires.
- **Flat props**: All styling/config is in the props dictionary. The host decides how to interpret them.

### Step 2: Build the View Model Layer

The view model sits between JSON data and native views. It's a **reference type** (class, not struct) so views can hold a reference to it.

```swift
final class NodeViewModel {
    let id: String                        // Stable ID for diffing
    var type: String                      // Element type
    var props: [String: JSONValue]         // Current props
    var textContent: String               // Pre-computed from text children
    var children: [NodeViewModel]          // Child view models
    var dirtyFields: DirtyFields = []     // What changed since last diff
    weak var associatedView: NSView?      // The native view (weak!)
}
```

The `DirtyFields` bitfield tracks exactly what changed:

```swift
struct DirtyFields: OptionSet {
    static let type     = DirtyFields(rawValue: 1 << 0)
    static let props    = DirtyFields(rawValue: 1 << 1)
    static let text     = DirtyFields(rawValue: 1 << 2)
    static let children = DirtyFields(rawValue: 1 << 3)
}
```

The `diff(against:)` method compares two view models and sets these flags. Native views then check which flags are set and only update the relevant properties.

### Step 3: Build the Tree Reconciler

The reconciler walks old and new view model trees in parallel, deciding what to create, update, or remove:

```
For each node in the new tree:
  1. Look up the old node by ID (O(1) hash map lookup)
  2. If found with same type → diff props, update native view in-place
  3. If found with different type → replace the entire native subtree
  4. If not found → create new native view and insert
  5. After processing all new nodes → remove any old nodes not in new tree
  6. Reorder children to match new tree order
```

The reconciler has three phases for children:

1. **Match & Update**: Walk new children, find matching old child by ID, diff and update
2. **Remove**: Delete old children whose IDs are absent from the new list
3. **Reorder**: Rearrange the native container's subviews to match new order

This is conceptually identical to React's own reconciliation algorithm, but operating on native views instead of DOM nodes.

### Step 4: Map Element Types to Native Views

Create one native view class per element type. Each conforms to an update protocol:

```swift
protocol UpdatableNodeView: NSView {
    func update(
        from oldModel: NodeViewModel,
        to newModel: NodeViewModel,
        handlerExecutor: @escaping (String, [JSONValue]) -> Void
    )
}
```

The `update` method receives the old model (with dirty flags set) and the new model. It checks which flags are set and only updates the relevant properties:

```swift
class ButtonNodeView: NSButton, UpdatableNodeView {
    func update(from oldModel: NodeViewModel, to newModel: NodeViewModel, ...) {
        if oldModel.dirtyFields.contains(.text) {
            self.title = newModel.textContent
        }
        if oldModel.dirtyFields.contains(.props) {
            self.isEnabled = !(newModel.props["disabled"]?.boolValue ?? false)
            self.handlerId = newModel.handlerId(for: "onClick")
        }
    }
}
```

A factory routes element types to view classes:

| Element type | Native view | Why |
|---|---|---|
| Container (`div`, `section`) | `NSStackView` | Natural container with Auto Layout |
| Text (`p`, `h1`, `span`) | `NSTextField` (label) | Non-editable, supports rich typography |
| Button | `NSButton` | Native target/action pattern |
| Input | `NSTextField` (editable) | `NSTextFieldDelegate` for change events |
| List (`ul`/`ol`) | `NSStackView` + indent | Vertical stack with left padding |

### Step 5: Wire Up Event Handling

Events flow in a cycle:

```
User clicks button
  → NSButton target/action fires
  → ButtonNodeView calls handlerExecutor("handler_0", [])
  → MainViewController forwards to RPCClient
  → RPCClient sends executeHandler("handler_0", []) over WebSocket
  → Bridge server relays to plugin
  → Plugin runs the handler (e.g., setState(count + 1))
  → React re-renders, reconciler produces new UINode tree
  → Plugin sends updateTree(newTree) back over WebSocket
  → RPCClient receives, decodes UINode
  → MainViewController calls handleTreeUpdate(tree)
  → TreeReconciler diffs old vs new, updates button title in-place
```

The handler ID convention: `onClick` → `_onClickHandlerId`, `onChange` → `_onChangeHandlerId`. The host reads these from props and stores them on the native view.

### Step 6: Pitfalls and Lessons Learned

**NSScrollView hit testing**: If your content renders inside an NSScrollView, the document view MUST have a defined height via Auto Layout constraints. NSView renders content outside its frame by default (so things *look* correct), but NSClipView clips hit testing to the document view's frame. If the document view has height 0, all mouse/keyboard events are silently dropped. Always pin the content's bottom edge to the document view's bottom.

**Threading with `@MainActor`**: If your RPC client tracks pending requests in a dictionary, that dictionary is accessed from multiple contexts: the send path (which may run in a Task) and the receive path (WebSocket callback). Use `@MainActor` isolation to prevent data races. Without it, responses may silently fail to match their pending requests.

**`FlippedView` for top-down layout**: AppKit's default coordinate system has origin at bottom-left. For top-to-bottom content (like a web page), subclass NSView and override `isFlipped` to return `true`.

**Feedback loops in input fields**: When the plugin sends a new tree with an updated input `value`, you update the NSTextField. But this triggers `controlTextDidChange`, which sends the value back to the plugin. Use an `isUpdatingFromPlugin` flag to break the cycle.

### Adapting to Other Platforms

This same architecture works on any imperative UI framework:

| Platform | Container | Text | Button | Input |
|---|---|---|---|---|
| **macOS AppKit** | NSStackView | NSTextField (label) | NSButton | NSTextField |
| **iOS UIKit** | UIStackView | UILabel | UIButton | UITextField |
| **Windows (WinUI)** | StackPanel | TextBlock | Button | TextBox |
| **GTK** | GtkBox | GtkLabel | GtkButton | GtkEntry |
| **Terminal** | Vertical layout | ANSI text | Highlighted text | Line editor |

The protocol layer (`UINode` tree + JSON-RPC) is platform-agnostic. Only the view factory and native view classes need to be implemented per platform.
