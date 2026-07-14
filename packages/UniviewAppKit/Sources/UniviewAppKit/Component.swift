import AppKit
import UniviewNativeCore

/// Executes a plugin event handler by id with serialized args (e.g. a click
/// or an input change). Injected by the host so components stay transport- and
/// bridge-agnostic — and so tests can assert firing without a live connection.
public typealias HandlerExecutor = @MainActor (String, [JSONValue]) -> Void

/// Context handed to a component during create/update.
@MainActor
public struct MountContext {
    public let executeHandler: HandlerExecutor

    public init(executeHandler: @escaping HandlerExecutor) {
        self.executeHandler = executeHandler
    }

    /// A no-op context for tests / previews that don't route events.
    public static let noop = MountContext { _, _ in }
}

/// A native component: creates the `NSView` for a node type and updates it
/// in place (surgically — never teardown/recreate) from a `ShadowNode`.
@MainActor
public protocol Component {
    /// Create a fresh native view for this component type.
    func makeView() -> NSView
    /// Apply `node`'s props/style/text to an existing view of this type.
    func update(_ view: NSView, node: ShadowNode, context: MountContext)
}
