import Foundation

/// Applies protocol incremental mutations to a UINode tree.
final class MutableUINodeTree {
    private var tree: UINode?
    private var nodeIndex: [String: UINode] = [:]

    init(root: UINode? = nil) {
        initialize(root)
    }

    func initialize(_ root: UINode?) {
        tree = root
        rebuildIndex()
    }

    func getTree() -> UINode? {
        tree
    }

    @discardableResult
    func applyMutations(_ mutations: [Mutation]) -> UINode? {
        for mutation in mutations {
            applyMutation(mutation)
        }
        return tree
    }

    private func applyMutation(_ mutation: Mutation) {
        switch mutation {
        case .setRoot(let node):
            tree = node
            rebuildIndex()

        case .appendChild(let parentId, let node):
            applyAppendChild(parentId: parentId, node: node)

        case .insertBefore(let parentId, let node, let beforeId):
            applyInsertBefore(parentId: parentId, node: node, beforeId: beforeId)

        case .removeChild(let parentId, let nodeId):
            applyRemoveChild(parentId: parentId, nodeId: nodeId)

        case .setText(let nodeId, let text):
            applySetText(nodeId: nodeId, text: text)

        case .setProps(let nodeId, let props):
            applySetProps(nodeId: nodeId, props: props)
        }
    }

    private func rebuildIndex() {
        nodeIndex.removeAll()
        if let tree {
            indexNode(tree)
        }
    }

    private func indexNode(_ node: UINode) {
        nodeIndex[node.id] = node
        for child in node.children {
            if case .node(let childNode) = child {
                indexNode(childNode)
            }
        }
    }

    private func unindexNode(_ node: UINode) {
        nodeIndex.removeValue(forKey: node.id)
        for child in node.children {
            if case .node(let childNode) = child {
                unindexNode(childNode)
            }
        }
    }

    private func applyAppendChild(parentId: String, node: UINode) {
        guard let parent = nodeIndex[parentId] else { return }

        let newParent = UINode(
            id: parent.id,
            type: parent.type,
            props: parent.props,
            children: parent.children + [.node(node)]
        )

        nodeIndex[parentId] = newParent
        indexNode(node)
        updateNode(id: parentId, replacement: newParent)
    }

    private func applyInsertBefore(parentId: String, node: UINode, beforeId: String) {
        guard let parent = nodeIndex[parentId] else { return }

        var insertIndex = parent.children.count
        for (index, child) in parent.children.enumerated() {
            if case .node(let childNode) = child, childNode.id == beforeId {
                insertIndex = index
                break
            }
        }

        var newChildren = parent.children
        newChildren.insert(.node(node), at: insertIndex)

        let newParent = UINode(
            id: parent.id,
            type: parent.type,
            props: parent.props,
            children: newChildren
        )

        nodeIndex[parentId] = newParent
        indexNode(node)
        updateNode(id: parentId, replacement: newParent)
    }

    private func applyRemoveChild(parentId: String, nodeId: String) {
        guard let parent = nodeIndex[parentId] else { return }

        let newChildren = parent.children.filter { child in
            guard case .node(let childNode) = child else {
                return true
            }

            if childNode.id == nodeId {
                unindexNode(childNode)
                return false
            }

            return true
        }

        let newParent = UINode(
            id: parent.id,
            type: parent.type,
            props: parent.props,
            children: newChildren
        )

        nodeIndex[parentId] = newParent
        updateNode(id: parentId, replacement: newParent)
    }

    private func applySetText(nodeId: String, text: String) {
        // Protocol v3: the text node is addressed directly by its stable id
        // and carries its content in the `text` field.
        guard let node = nodeIndex[nodeId] else { return }

        let newNode = UINode(
            id: node.id,
            type: node.type,
            props: node.props,
            children: node.children,
            text: text
        )

        nodeIndex[nodeId] = newNode
        updateNode(id: nodeId, replacement: newNode)
    }

    private func applySetProps(nodeId: String, props: [String: JSONValue]) {
        guard let node = nodeIndex[nodeId] else { return }

        let newNode = UINode(
            id: node.id,
            type: node.type,
            props: props,
            children: node.children
        )

        nodeIndex[nodeId] = newNode
        updateNode(id: nodeId, replacement: newNode)
    }

    private func updateNode(id: String, replacement: UINode) {
        if tree?.id == id {
            tree = replacement
            nodeIndex[id] = replacement
            return
        }

        if let updatedRoot = replaceNode(in: tree, targetId: id, replacement: replacement) {
            tree = updatedRoot
        }
    }

    private func replaceNode(in node: UINode?, targetId: String, replacement: UINode) -> UINode? {
        guard let node else { return nil }

        if node.id == targetId {
            nodeIndex[targetId] = replacement
            return replacement
        }

        var didReplace = false
        let newChildren = node.children.map { child -> UINodeChild in
            guard case .node(let childNode) = child else {
                return child
            }

            if let updatedChild = replaceNode(in: childNode, targetId: targetId, replacement: replacement) {
                didReplace = true
                return .node(updatedChild)
            }

            return child
        }

        guard didReplace else { return nil }

        let updatedNode = UINode(
            id: node.id,
            type: node.type,
            props: node.props,
            children: newChildren
        )
        nodeIndex[node.id] = updatedNode
        return updatedNode
    }
}
