import Foundation
import Testing

@testable import UniviewNativeCore

@Suite struct ShadowTreeTests {
    private func rooted(_ root: UINode, revision: Int = 0) -> ShadowTree {
        let tree = ShadowTree()
        tree.apply(CommitBatch(revision: revision, mutations: [.setRoot(node: root)]))
        return tree
    }

    @Test func setRootBuildsTreeAndIndex() {
        let tree = rooted(
            UINode(id: "r", type: "View", children: [UINode(id: "a", type: "Button")])
        )
        #expect(tree.root?.id == "r")
        #expect(tree.node(id: "a")?.type == "Button")
        #expect(tree.revision == 0)
    }

    @Test func setPropsUpdatesPropsAndStyle() {
        let tree = rooted(UINode(id: "r", type: "View"))
        tree.apply(
            CommitBatch(
                revision: 1,
                mutations: [
                    .setProps(
                        nodeId: "r",
                        props: [
                            "style": .object(["gap": .number(8)]),
                            "title": .string("Hi"),
                        ]
                    )
                ]
            )
        )
        #expect(tree.node(id: "r")?.props["title"] == .string("Hi"))
        #expect(tree.node(id: "r")?.style.gap == 8)
    }

    @Test func setTextUpdatesTextNode() {
        let tree = rooted(
            UINode(id: "r", type: "p", children: [UINode.text("old", id: "t")])
        )
        tree.apply(CommitBatch(revision: 1, mutations: [.setText(nodeId: "t", text: "new")]))
        #expect(tree.node(id: "t")?.text == "new")
    }

    @Test func appendInsertRemoveMaintainOrderAndIndex() {
        let tree = rooted(UINode(id: "r", type: "View"))
        tree.apply(
            CommitBatch(
                revision: 1,
                mutations: [
                    .appendChild(parentId: "r", node: UINode(id: "a", type: "Button")),
                    .appendChild(parentId: "r", node: UINode(id: "c", type: "Button")),
                    .insertBefore(
                        parentId: "r", node: UINode(id: "b", type: "Button"), beforeId: "c"),
                ]
            )
        )
        #expect(tree.root?.children.map(\.id) == ["a", "b", "c"])

        tree.apply(CommitBatch(revision: 2, mutations: [.removeChild(parentId: "r", nodeId: "b")]))
        #expect(tree.root?.children.map(\.id) == ["a", "c"])
        #expect(tree.node(id: "b") == nil)
    }

    @Test func appendExistingNodeMovesItWithoutDuplicating() {
        let tree = rooted(
            UINode(
                id: "r", type: "View",
                children: [
                    UINode(id: "a", type: "Button"),
                    UINode(id: "b", type: "Button"),
                ]
            )
        )
        tree.apply(
            CommitBatch(
                revision: 1,
                mutations: [.appendChild(parentId: "r", node: UINode(id: "a", type: "Button"))]
            )
        )
        #expect(tree.root?.children.map(\.id) == ["b", "a"])
        #expect(tree.root?.children.count == 2)
    }

    @Test func staleOrDuplicateRevisionIsIgnored() {
        let tree = rooted(UINode(id: "r", type: "View"), revision: 5)
        let applied = tree.apply(
            CommitBatch(
                revision: 5,
                mutations: [.appendChild(parentId: "r", node: UINode(id: "x", type: "Button"))]
            )
        )
        #expect(applied == false)
        #expect(tree.node(id: "x") == nil)
    }
}
