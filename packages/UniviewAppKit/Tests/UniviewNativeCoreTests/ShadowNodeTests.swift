import Foundation
import Testing

@testable import UniviewNativeCore

@Suite struct ShadowNodeTests {
    @Test func buildsFromUINodeWithStyleAndChildren() {
        let node = UINode(
            id: "root",
            type: "View",
            props: [
                "style": .object([
                    "flexDirection": .string("row"),
                    "gap": .number(16),
                ])
            ],
            children: [
                UINode(id: "b", type: "Button", props: ["title": .string("Save")]),
                UINode.text("hi", id: "t"),
            ]
        )
        let shadow = ShadowNode.from(node)
        #expect(shadow.id == "root")
        #expect(shadow.type == "View")
        #expect(shadow.style.flexDirection == .row)
        #expect(shadow.style.gap == 16)
        #expect(shadow.children.count == 2)
        #expect(shadow.children[0].type == "Button")
        #expect(shadow.children[0].props["title"] == .string("Save"))
        #expect(shadow.children[0].parent === shadow)
        #expect(shadow.children[1].isTextNode)
        #expect(shadow.children[1].text == "hi")
        #expect(shadow.children[1].parent === shadow)
    }

    @Test func defaultsToEmptyStyleAndZeroLayout() {
        let shadow = ShadowNode.from(UINode(id: "x", type: "View"))
        #expect(shadow.style == StyleIR())
        #expect(shadow.layout == .zero)
        #expect(shadow.parent == nil)
    }

    @Test func ignoresMalformedStyleProp() {
        // A non-object style prop must not throw — falls back to empty style.
        let shadow = ShadowNode.from(
            UINode(id: "x", type: "View", props: ["style": .string("nonsense")])
        )
        #expect(shadow.style == StyleIR())
    }

    @Test func handlerIdFollowsConvention() {
        let shadow = ShadowNode.from(
            UINode(id: "b", type: "Button", props: ["_onClickHandlerId": .string("h1")])
        )
        #expect(shadow.handlerId(for: "onClick") == "h1")
        #expect(shadow.handlerId(for: "onChange") == nil)
    }

    @Test func renderedTextFlattensNestedChildren() {
        let shadow = ShadowNode.from(
            UINode(
                id: "p", type: "p",
                children: [
                    UINode.text("Hello ", id: "a"),
                    UINode(id: "s", type: "span", children: [UINode.text("world", id: "b")]),
                ]
            )
        )
        #expect(shadow.renderedText == "Hello world")
    }
}
