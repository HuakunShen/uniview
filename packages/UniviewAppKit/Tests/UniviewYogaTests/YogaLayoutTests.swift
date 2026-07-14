import Testing

@testable import UniviewNativeCore
@testable import UniviewYoga

@Suite struct YogaLayoutTests {
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
}
