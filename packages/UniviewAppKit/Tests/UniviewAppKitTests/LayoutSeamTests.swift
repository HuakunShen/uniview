import AppKit
import Testing

@testable import UniviewAppKit
@testable import UniviewNativeCore

/// A trivial layout engine that stacks children vertically — proves the
/// LayoutEngine → Mounter frame-application seam independently of Yoga.
private struct StackLayout: LayoutEngine {
    let rowHeight: Double
    func calculate(root: ShadowNode, available: Size) {
        root.layout = LayoutRect(x: 0, y: 0, width: available.width, height: available.height)
        var y = 0.0
        for child in root.children where !child.isTextNode {
            child.layout = LayoutRect(x: 0, y: y, width: available.width, height: rowHeight)
            y += rowHeight
        }
    }
}

@MainActor
@Suite struct LayoutSeamTests {
    @Test func appliesComputedFramesToMountedViews() throws {
        let tree = ShadowTree()
        tree.apply(
            CommitBatch(
                revision: 0,
                mutations: [
                    .setRoot(
                        node: UINode(
                            id: "r", type: "View",
                            children: [
                                UINode(id: "a", type: "Button"),
                                UINode(id: "b", type: "Button"),
                            ]))
                ]))

        let root = try #require(tree.root)
        StackLayout(rowHeight: 50).calculate(root: root, available: Size(width: 200, height: 100))

        let mounter = Mounter(executeHandler: { _, _ in })
        mounter.reconcile(tree)
        mounter.applyLayout(tree)

        #expect(mounter.view(for: "r")?.frame == NSRect(x: 0, y: 0, width: 200, height: 100))
        #expect(mounter.view(for: "a")?.frame == NSRect(x: 0, y: 0, width: 200, height: 50))
        #expect(mounter.view(for: "b")?.frame == NSRect(x: 0, y: 50, width: 200, height: 50))
    }
}
