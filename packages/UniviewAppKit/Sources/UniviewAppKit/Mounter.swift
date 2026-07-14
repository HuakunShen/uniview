import AppKit
import UniviewNativeCore

/// Reconciles a live `NSView` tree against a `ShadowTree`, keyed by node id.
///
/// The host applies a `CommitBatch` to the shadow tree, then calls
/// `reconcile`. The mounter reuses existing views (updating them in place),
/// creates only genuinely new nodes, removes departed ones, and reorders
/// siblings to match — never tearing down and rebuilding an unchanged subtree.
/// Frame positioning is left to the layout pass; this stage is structural.
@MainActor
public final class Mounter {
    private let registry: ComponentRegistry
    private let context: MountContext
    private var views: [String: NSView] = [:]
    private var types: [String: String] = [:]
    private var visited: Set<String> = []
    public private(set) var rootView: NSView?

    public init(
        registry: ComponentRegistry = .standard(),
        executeHandler: @escaping HandlerExecutor
    ) {
        self.registry = registry
        self.context = MountContext(executeHandler: executeHandler)
    }

    /// The mounted view for a node id, if currently mounted.
    public func view(for id: String) -> NSView? { views[id] }

    /// Apply computed layout: set each mounted view's frame from its node's
    /// `layout` rect (parent-relative, so it maps straight onto the NSView
    /// frame). Run after the layout engine has populated the tree.
    public func applyLayout(_ tree: ShadowTree) {
        if let root = tree.root { applyLayout(node: root) }
    }

    private func applyLayout(node: ShadowNode) {
        if let view = views[node.id] {
            let rect = node.layout
            view.frame = NSRect(x: rect.x, y: rect.y, width: rect.width, height: rect.height)

            // A corner radius can't exceed half the box. `rounded-full` asks for a
            // pill by naming an absurd radius (9999); left unclamped, CoreAnimation
            // renders a degenerate rounded rect and — once masked — nothing at all.
            // Only here is the final size known.
            if let radius = node.style.borderRadius, let layer = view.layer {
                layer.cornerRadius = min(CGFloat(radius), min(rect.width, rect.height) / 2)
            }
        }
        for child in node.children where !child.isTextNode {
            applyLayout(node: child)
        }
    }

    /// Sync the `NSView` tree to the current shadow tree; returns the root view.
    @discardableResult
    public func reconcile(_ tree: ShadowTree) -> NSView? {
        visited.removeAll(keepingCapacity: true)
        guard let root = tree.root else {
            rootView?.removeFromSuperview()
            rootView = nil
            views.removeAll()
            types.removeAll()
            return nil
        }
        let view = reconcile(node: root)
        rootView = view
        // Prune views for nodes that vanished from the tree.
        for (id, staleView) in views where !visited.contains(id) {
            staleView.removeFromSuperview()
            views[id] = nil
            types[id] = nil
        }
        return view
    }

    private func reconcile(node: ShadowNode) -> NSView {
        visited.insert(node.id)
        let component = registry.component(for: node.type)

        let view: NSView
        if let existing = views[node.id], types[node.id] == node.type {
            view = existing  // reuse — surgical update, no teardown
        } else {
            views[node.id]?.removeFromSuperview()
            view = component.makeView(for: node)
            views[node.id] = view
            types[node.id] = node.type
        }
        component.update(view, node: node, context: context)

        if component.mountsChildren {
            reconcileChildren(of: node, in: view)
        }
        return view
    }

    private func reconcileChildren(of node: ShadowNode, in parent: NSView) {
        // #text children are folded into the parent's renderedText, not mounted.
        let elementChildren = node.children.filter { !$0.isTextNode }
        let desired = elementChildren.map { reconcile(node: $0) }
        let desiredIdentifiers = Set(desired.map(ObjectIdentifier.init))

        // Remove managed subviews that are no longer children here.
        for subview in parent.subviews
        where !desiredIdentifiers.contains(ObjectIdentifier(subview)) {
            subview.removeFromSuperview()
        }
        // Attach new or reparented children (addSubview detaches from old parent).
        for childView in desired where childView.superview !== parent {
            parent.addSubview(childView)
        }
        // Enforce sibling order to match the tree (structural only).
        if parent.subviews != desired {
            for childView in desired { childView.removeFromSuperview() }
            for childView in desired { parent.addSubview(childView) }
        }
    }
}
