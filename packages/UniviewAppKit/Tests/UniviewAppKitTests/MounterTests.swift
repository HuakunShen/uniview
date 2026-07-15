import AppKit
import Testing

@testable import UniviewAppKit
@testable import UniviewNativeCore

@MainActor
@Suite struct MounterTests {
    private func rooted(_ root: UINode) -> ShadowTree {
        let tree = ShadowTree()
        tree.apply(CommitBatch(revision: 0, mutations: [.setRoot(node: root)]))
        return tree
    }

    @Test func mountsTreeToViewHierarchy() throws {
        let tree = rooted(
            UINode(
                id: "root", type: "View",
                children: [
                    UINode(id: "t", type: "Text", children: [UINode.text("Hi", id: "x")]),
                    UINode(id: "b", type: "Button", props: ["title": .string("Go")]),
                ]
            )
        )
        let mounter = Mounter(executeHandler: { _, _ in })
        let root = try #require(mounter.reconcile(tree))
        #expect(root is FlippedView)
        #expect(root.subviews.count == 2)  // #text folded, Text + Button mounted
        #expect((root.subviews[0] as? NSTextField)?.stringValue == "Hi")
        #expect((root.subviews[1] as? NSButton)?.title == "Go")
    }

    @Test func surgicalUpdateReusesViewIdentity() throws {
        let tree = rooted(UINode(id: "b", type: "Button", props: ["title": .string("A")]))
        let mounter = Mounter(executeHandler: { _, _ in })
        let first = try #require(mounter.reconcile(tree))

        tree.apply(
            CommitBatch(
                revision: 1,
                mutations: [.setProps(nodeId: "b", props: ["title": .string("B")])]))
        let second = try #require(mounter.reconcile(tree))

        #expect(first === second)  // same NSButton reused, not recreated
        #expect((second as? NSButton)?.title == "B")
    }

    @Test func typeChangeRecreatesView() throws {
        let tree = rooted(UINode(id: "n", type: "Button", props: ["title": .string("A")]))
        let mounter = Mounter(executeHandler: { _, _ in })
        let first = try #require(mounter.reconcile(tree))
        #expect(first is NSButton)

        tree.apply(
            CommitBatch(
                revision: 1,
                mutations: [
                    .setRoot(node: UINode(id: "n", type: "Text", children: [UINode.text("hi", id: "t")]))
                ]))
        let second = try #require(mounter.reconcile(tree))
        #expect(!(second is NSButton))
        #expect((second as? NSTextField)?.stringValue == "hi")
    }

    @Test func appendAndRemoveChildrenUpdateHierarchy() throws {
        let tree = rooted(UINode(id: "r", type: "View"))
        let mounter = Mounter(executeHandler: { _, _ in })
        _ = mounter.reconcile(tree)

        tree.apply(
            CommitBatch(
                revision: 1,
                mutations: [
                    .appendChild(
                        parentId: "r", node: UINode(id: "a", type: "Button", props: ["title": .string("A")])),
                    .appendChild(
                        parentId: "r", node: UINode(id: "b", type: "Button", props: ["title": .string("B")])),
                ]))
        let root = try #require(mounter.reconcile(tree))
        #expect(root.subviews.count == 2)

        tree.apply(CommitBatch(revision: 2, mutations: [.removeChild(parentId: "r", nodeId: "a")]))
        let root2 = try #require(mounter.reconcile(tree))
        #expect(root2.subviews.count == 1)
        #expect((root2.subviews[0] as? NSButton)?.title == "B")
        #expect(mounter.view(for: "a") == nil)  // pruned
    }

    @Test func reordersChildrenToMatchTree() throws {
        let tree = rooted(
            UINode(
                id: "r", type: "View",
                children: [
                    UINode(id: "a", type: "Button", props: ["title": .string("A")]),
                    UINode(id: "b", type: "Button", props: ["title": .string("B")]),
                ]
            )
        )
        let mounter = Mounter(executeHandler: { _, _ in })
        _ = mounter.reconcile(tree)
        let viewA = mounter.view(for: "a")

        // Move "a" after "b" via appendChild (protocol MOVE semantics).
        tree.apply(
            CommitBatch(
                revision: 1,
                mutations: [
                    .appendChild(
                        parentId: "r", node: UINode(id: "a", type: "Button", props: ["title": .string("A")]))
                ]))
        let root = try #require(mounter.reconcile(tree))
        let titles = root.subviews.compactMap { ($0 as? NSButton)?.title }
        #expect(titles == ["B", "A"])
        #expect(mounter.view(for: "a") === viewA)  // identity preserved across move
    }
}
