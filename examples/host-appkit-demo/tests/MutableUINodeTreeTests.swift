import Foundation

func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() {
        fputs("FAIL: \(message)\n", stderr)
        exit(1)
    }
}

@main
struct MutableUINodeTreeTests {
    static func main() throws {
        try testDecodesMutationBatch()
        testAppliesSetPropsAndSetText()
        testAppendsInsertsAndRemovesChildren()
        testPropagatesNestedMutationsToRoot()
        testSetRootInitializesAndClearsTree()

        print("MutableUINodeTreeTests passed")
    }

    private static func testDecodesMutationBatch() throws {
        let json = """
        [
            {"type":"setProps","nodeId":"label","props":{"className":"hot"}},
            {"type":"setText","nodeId":"label-text","text":"after"},
            {"type":"setRoot","node":null}
        ]
        """

        let mutations = try JSONDecoder().decode([Mutation].self, from: Data(json.utf8))

        expect(mutations.count == 3, "mutation batch decodes")
        if case .setProps(let nodeId, let props) = mutations[0] {
            expect(nodeId == "label", "setProps node ID decodes")
            expect(props["className"] == .string("hot"), "setProps props decode")
        } else {
            expect(false, "first mutation is setProps")
        }

        if case .setRoot(let node) = mutations[2] {
            expect(node == nil, "setRoot null decodes as nil")
        } else {
            expect(false, "third mutation is setRoot")
        }
    }

    private static func testAppliesSetPropsAndSetText() {
        let tree = MutableUINodeTree(root: createRoot())

        let next = tree.applyMutations([
            .setProps(nodeId: "label", props: ["className": .string("hot")]),
            .setText(nodeId: "label-text", text: "after"),
        ])

        let label = elementChild(next, at: 0)
        expect(label?.props["className"] == .string("hot"), "setProps updates indexed child")
        expect(textNodeChild(label, at: 0)?.text == "after", "setText updates text node by id")
    }

    private static func testAppendsInsertsAndRemovesChildren() {
        let tree = MutableUINodeTree(root: createRoot())

        tree.applyMutations([
            .appendChild(
                parentId: "root",
                node: UINode(id: "last", type: "p", children: [.text("last")])
            ),
            .insertBefore(
                parentId: "root",
                node: UINode(id: "middle", type: "p", children: [.text("middle")]),
                beforeId: "last"
            ),
        ])

        expect(childLabels(tree.getTree()) == ["label", "tail-text", "middle", "last"], "append and insert update order")

        let afterRemove = tree.applyMutations([
            .removeChild(parentId: "root", nodeId: "middle")
        ])

        expect(childLabels(afterRemove) == ["label", "tail-text", "last"], "removeChild removes indexed child")
    }

    private static func testPropagatesNestedMutationsToRoot() {
        let tree = MutableUINodeTree(root: createNestedRoot())

        let afterText = tree.applyMutations([
            .setText(nodeId: "nested-label-text", text: "after")
        ])

        let sectionAfterText = elementChild(afterText, at: 0)
        let labelAfterText = elementChild(sectionAfterText, at: 0)
        expect(textNodeChild(labelAfterText, at: 0)?.text == "after", "nested setText propagates to root")

        let afterAppend = tree.applyMutations([
            .appendChild(
                parentId: "nested-list",
                node: UINode(id: "item", type: "span", children: [.text("item")])
            )
        ])

        let sectionAfterAppend = elementChild(afterAppend, at: 0)
        let listAfterAppend = elementChild(sectionAfterAppend, at: 1)
        expect(childLabels(listAfterAppend) == ["item"], "nested appendChild propagates to root")
    }

    private static func testSetRootInitializesAndClearsTree() {
        let tree = MutableUINodeTree()
        let root = createRoot()

        expect(tree.getTree() == nil, "new tree starts empty")
        expect(tree.applyMutations([.setRoot(node: root)]) == root, "setRoot initializes empty tree")
        expect(tree.getTree() == root, "initialized tree is retained")
        expect(tree.applyMutations([.setRoot(node: nil)]) == nil, "setRoot null clears tree")
        expect(tree.getTree() == nil, "cleared tree is retained")
    }

    private static func textNode(_ id: String, _ text: String) -> UINode {
        UINode(id: id, type: UINode.textNodeType, text: text)
    }

    private static func createRoot() -> UINode {
        // Protocol v3: text children are explicit #text nodes with stable ids.
        UINode(
            id: "root",
            type: "div",
            props: ["className": .string("root")],
            children: [
                .node(UINode(id: "label", type: "span", children: [.node(textNode("label-text", "before"))])),
                .node(textNode("tail-text", "tail")),
            ]
        )
    }

    private static func createNestedRoot() -> UINode {
        UINode(
            id: "root",
            type: "div",
            children: [
                .node(UINode(
                    id: "section",
                    type: "section",
                    children: [
                        .node(UINode(id: "nested-label", type: "span", children: [.node(textNode("nested-label-text", "before"))])),
                        .node(UINode(id: "nested-list", type: "div")),
                    ]
                )),
            ]
        )
    }

    /// Return the child at `index` if it is a v3 #text node.
    private static func textNodeChild(_ node: UINode?, at index: Int) -> UINode? {
        guard let child = elementChild(node, at: index), child.isTextNode else { return nil }
        return child
    }

    private static func elementChild(_ node: UINode?, at index: Int) -> UINode? {
        guard let node,
              index >= 0,
              index < node.children.count,
              case .node(let child) = node.children[index] else {
            return nil
        }
        return child
    }

    private static func childLabels(_ node: UINode?) -> [String] {
        guard let node else { return [] }
        return node.children.map { child in
            switch child {
            case .node(let node):
                return node.id
            case .text(let text):
                return text
            }
        }
    }
}
