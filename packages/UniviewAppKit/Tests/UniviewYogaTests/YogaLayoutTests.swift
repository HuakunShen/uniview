import Testing

@testable import UniviewNativeCore
@testable import UniviewYoga

/// Layout is main-actor work (measuring a leaf asks its AppKit component), which
/// also keeps Yoga's process-global state on a single thread.
@Suite @MainActor struct YogaLayoutTests {
    @Test func rowLayoutWithGapAndPadding() {
        let root = ShadowNode.from(
            UINode(
                id: "r", type: "View",
                props: [
                    "style": .object([
                        "flexDirection": .string("row"),
                        "paddingTop": .number(10), "paddingLeft": .number(10),
                        "paddingRight": .number(10), "paddingBottom": .number(10),
                        "gap": .number(8),
                        "width": .number(200), "height": .number(100),
                    ])
                ],
                children: [
                    UINode(
                        id: "a", type: "View",
                        props: ["style": .object(["width": .number(40), "height": .number(20)])]),
                    UINode(
                        id: "b", type: "View",
                        props: ["style": .object(["width": .number(40), "height": .number(20)])]),
                ]))

        YogaLayoutEngine().calculate(root: root, available: Size(width: 200, height: 100))

        #expect(root.layout == LayoutRect(x: 0, y: 0, width: 200, height: 100))
        #expect(root.children[0].layout == LayoutRect(x: 10, y: 10, width: 40, height: 20))
        #expect(root.children[1].layout == LayoutRect(x: 58, y: 10, width: 40, height: 20))
    }

    @Test func columnFlexGrowDistributesRemainingSpace() {
        let root = ShadowNode.from(
            UINode(
                id: "r", type: "View",
                props: [
                    "style": .object([
                        "flexDirection": .string("column"),
                        "width": .number(50), "height": .number(100),
                    ])
                ],
                children: [
                    UINode(
                        id: "a", type: "View",
                        props: ["style": .object(["height": .number(20)])]),
                    UINode(
                        id: "b", type: "View",
                        props: ["style": .object(["flexGrow": .number(1)])]),
                ]))

        YogaLayoutEngine().calculate(root: root, available: Size(width: 50, height: 100))

        #expect(root.children[0].layout.height == 20)
        #expect(root.children[1].layout == LayoutRect(x: 0, y: 20, width: 50, height: 80))
    }

    @Test func percentWidthResolvesAgainstParent() {
        let root = ShadowNode.from(
            UINode(
                id: "r", type: "View",
                props: ["style": .object(["width": .number(200), "height": .number(50)])],
                children: [
                    UINode(
                        id: "a", type: "View",
                        props: ["style": .object(["width": .string("50%"), "height": .number(10)])])
                ]))

        YogaLayoutEngine().calculate(root: root, available: Size(width: 200, height: 50))

        #expect(root.children[0].layout.width == 100)
    }

    /// `mx-auto`: two auto margins split the free space, centering the box. This
    /// is how every Tailwind-authored plugin centers its content column.
    @Test func autoMarginsCenterTheBox() {
        let root = ShadowNode.from(
            UINode(
                id: "r", type: "View",
                props: ["_style": .object(["width": .number(200), "height": .number(50)])],
                children: [
                    UINode(
                        id: "a", type: "View",
                        props: [
                            "_style": .object([
                                "width": .number(100), "height": .number(10),
                                "marginLeft": .string("auto"), "marginRight": .string("auto"),
                            ])
                        ])
                ]))

        YogaLayoutEngine().calculate(root: root, available: Size(width: 200, height: 50))

        #expect(root.children[0].layout.x == 50)
    }

    /// Without a measurer a leaf is 0×0, so a container that sizes to its content
    /// collapses — which is exactly what a Tailwind-authored tree does, since it
    /// states no widths or heights at all. The measurer is what gives it size.
    @Test func aContentLeafSizesTheContainerAroundIt() {
        final class FixedMeasurer: NodeMeasurer {
            func isContentLeaf(_ node: ShadowNode) -> Bool { node.type == "Text" }
            func measure(_ node: ShadowNode, maxWidth: Double) -> Size? {
                node.type == "Text" ? Size(width: 120, height: 17) : nil
            }
        }

        // A column with padding, holding one text run. Nothing states a size.
        let tree = UINode(
            id: "r", type: "View",
            props: ["_style": .object(["paddingLeft": .number(10), "paddingTop": .number(6)])],
            children: [UINode(id: "t", type: "Text", children: [UINode.text("hi", id: "x")])])

        // No measurer: the text has no height at all — it is not on screen.
        let unmeasured = ShadowNode.from(tree)
        YogaLayoutEngine().calculate(root: unmeasured, available: Size(width: 400, height: 400))
        #expect(unmeasured.children[0].layout.height == 0)

        let measured = ShadowNode.from(tree)
        let engine = YogaLayoutEngine()
        engine.measurer = FixedMeasurer()
        engine.calculate(root: measured, available: Size(width: 400, height: 400))

        let text = measured.children[0]
        #expect(text.layout.height == 17)
        #expect(text.layout.x == 10)  // the container's padding
        #expect(text.layout.y == 6)
    }
}
