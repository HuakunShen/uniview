import Testing

@testable import UniviewNativeCore
@testable import UniviewYoga

/// The Style IR grew the fields Tailwind's `hidden` / `overflow` / `aspect` / the
/// position offsets have always needed. These are *layout* properties — asserting
/// them on the layout engine is the only way to know they arrived.
@Suite @MainActor struct LayoutGapsTests {

    private func layout(_ node: UINode, width: Double = 200, height: Double = 100) -> ShadowNode {
        let root = ShadowNode.from(node)
        YogaLayoutEngine().calculate(root: root, available: Size(width: width, height: height))
        return root
    }

    /// `hidden` is not "invisible" — the box leaves the flow and the siblings
    /// close the gap. Hiding the *view* would leave a hole exactly its size.
    @Test func hiddenRemovesTheBoxFromLayoutRatherThanJustFromView() throws {
        let root = layout(
            UINode(
                id: "r", type: "View",
                props: ["_style": .object(["flexDirection": .string("row")])],
                children: [
                    UINode(
                        id: "a", type: "View",
                        props: [
                            "_style": .object([
                                "width": .number(40), "height": .number(20),
                                "display": .string("none"),
                            ])
                        ]),
                    UINode(
                        id: "b", type: "View",
                        props: ["_style": .object(["width": .number(40), "height": .number(20)])]),
                ]))

        let b = try #require(root.children.first(where: { $0.id == "b" }))
        #expect(b.layout.x == 0, "the hidden sibling still took up its 40pt")
        #expect(root.children[0].layout.width == 0)
    }

    @Test func absoluteBoxesCanFinallySayWhereTheyGo() throws {
        let root = layout(
            UINode(
                id: "r", type: "View",
                props: ["_style": .object(["width": .number(200), "height": .number(100)])],
                children: [
                    UINode(
                        id: "badge", type: "View",
                        props: [
                            "_style": .object([
                                "position": .string("absolute"),
                                "top": .number(8), "right": .number(12),
                                "width": .number(20), "height": .number(20),
                            ])
                        ])
                ]))

        let badge = try #require(root.children.first)
        #expect(badge.layout.y == 8)
        #expect(badge.layout.x == 200 - 12 - 20)
    }

    @Test func negativeOffsetsPullABoxOutsideItsParent() throws {
        let root = layout(
            UINode(
                id: "r", type: "View",
                props: ["_style": .object(["width": .number(200), "height": .number(100)])],
                children: [
                    UINode(
                        id: "n", type: "View",
                        props: [
                            "_style": .object([
                                "position": .string("absolute"),
                                "top": .number(-4), "left": .number(-4),
                                "width": .number(10), "height": .number(10),
                            ])
                        ])
                ]))
        #expect(try #require(root.children.first).layout.y == -4)
    }

    /// Asserted on a CHILD, not the root: the root is handed an available height
    /// and stretches to fill it, so an aspect ratio there has nothing to decide.
    @Test func aspectRatioSizesTheAxisYouDidNotGive() throws {
        let root = layout(
            UINode(
                id: "r", type: "View",
                props: ["_style": .object(["alignItems": .string("flex-start")])],
                children: [
                    UINode(
                        id: "thumb", type: "View",
                        props: [
                            "_style": .object([
                                "width": .number(80), "aspectRatio": .number(2),
                            ])
                        ])
                ]))

        let thumb = try #require(root.children.first)
        #expect(thumb.layout.width == 80)
        #expect(thumb.layout.height == 40)
    }
}
