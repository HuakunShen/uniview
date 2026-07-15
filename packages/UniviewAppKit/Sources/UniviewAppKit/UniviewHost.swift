import AppKit
import UniviewNativeCore

/// Ties the pieces together: owns the `ShadowTree`, applies commits, runs the
/// injected `LayoutEngine`, and reconciles + positions the `NSView` tree. This
/// is the single object a demo/app drives — feed it commits and a container
/// size, read back `rootView`.
///
/// The layout engine is injected (not imported) so `UniviewAppKit` stays
/// engine-agnostic; the app wires in `YogaLayoutEngine`.
@MainActor
public final class UniviewHost {
    public let tree = ShadowTree()
    private let mounter: Mounter
    private let layoutEngine: LayoutEngine
    public private(set) var containerSize: Size

    public init(
        registry: ComponentRegistry = .standard(),
        layoutEngine: LayoutEngine,
        containerSize: Size = .zero,
        executeHandler: @escaping HandlerExecutor
    ) {
        self.mounter = Mounter(registry: registry, executeHandler: executeHandler)
        self.layoutEngine = layoutEngine
        self.containerSize = containerSize
        // Leaves size to their content, and the components themselves say how.
        layoutEngine.measurer = ComponentMeasurer(registry: registry)
    }

    /// The current root native view (nil before the first non-empty commit).
    public var rootView: NSView? { mounter.rootView }

    /// The mounted view for a node id, if any.
    public func view(for id: String) -> NSView? { mounter.view(for: id) }

    /// Apply a commit batch, then re-render (layout + mount + frames).
    public func apply(_ batch: CommitBatch) {
        tree.apply(batch)
        render()
    }

    /// Update the container size (e.g. on window resize) and re-render.
    public func setContainerSize(_ size: Size) {
        containerSize = size
        render()
    }

    /// Run layout over the current tree and sync the view hierarchy + frames.
    public func render() {
        if let root = tree.root {
            layoutEngine.calculate(root: root, available: containerSize)
        }
        mounter.reconcile(tree)
        mounter.applyLayout(tree)
    }
}
