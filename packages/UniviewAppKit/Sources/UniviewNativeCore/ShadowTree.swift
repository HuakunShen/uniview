import Foundation

/// The authoritative shadow tree on the host side. Applies revisioned
/// `CommitBatch`es (Fabric-style) to a `ShadowNode` tree, maintaining an
/// `id → node` index for O(1) lookup. Migrates the POC's `MutableUINodeTree`
/// idea but stores style-aware `ShadowNode`s (not raw `UINode`s).
///
/// This is the data model; the AppKit host mounts/patches `NSView`s against it.
public final class ShadowTree {
    public private(set) var root: ShadowNode?
    /// The last applied commit revision; `-1` before the first commit.
    public private(set) var revision: Int = -1

    private var index: [String: ShadowNode] = [:]

    public init() {}

    /// Look up a node by its stable id.
    public func node(id: String) -> ShadowNode? { index[id] }

    /// Apply a commit batch in revision order. A batch whose revision is not
    /// newer than the last applied is ignored (idempotent replay / drift
    /// guard); returns whether it was applied.
    @discardableResult
    public func apply(_ batch: CommitBatch) -> Bool {
        if batch.revision <= revision { return false }
        for mutation in batch.mutations {
            apply(mutation)
        }
        revision = batch.revision
        return true
    }

    /// Apply a single mutation. Public for host-side replay and testing.
    public func apply(_ mutation: Mutation) {
        switch mutation {
        case .setRoot(let node):
            setRoot(node)

        case .setProps(let nodeId, let props):
            guard let node = index[nodeId] else { return }
            node.props = props
            node.style = ShadowNode.resolveStyle(from: props)

        case .setText(let nodeId, let text):
            index[nodeId]?.text = text

        case .appendChild(let parentId, let node):
            guard let parent = index[parentId] else { return }
            detachIfPresent(node.id)  // MOVE-safe: never duplicate an id
            let child = ShadowNode.from(node)
            parent.appendChild(child)
            indexSubtree(child)

        case .insertBefore(let parentId, let node, let beforeId):
            guard let parent = index[parentId] else { return }
            detachIfPresent(node.id)
            let child = ShadowNode.from(node)
            parent.insertChild(child, before: beforeId)
            indexSubtree(child)

        case .removeChild(_, let nodeId):
            guard let target = index[nodeId] else { return }
            target.detachFromParent()
            unindexSubtree(target)
        }
    }

    // MARK: - Internals

    private func setRoot(_ node: UINode?) {
        index.removeAll()
        if let node {
            let newRoot = ShadowNode.from(node)
            root = newRoot
            indexSubtree(newRoot)
        } else {
            root = nil
        }
    }

    private func detachIfPresent(_ id: String) {
        guard let existing = index[id] else { return }
        existing.detachFromParent()
        unindexSubtree(existing)
    }

    private func indexSubtree(_ node: ShadowNode) {
        index[node.id] = node
        for child in node.children { indexSubtree(child) }
    }

    private func unindexSubtree(_ node: ShadowNode) {
        index[node.id] = nil
        for child in node.children { unindexSubtree(child) }
    }
}
