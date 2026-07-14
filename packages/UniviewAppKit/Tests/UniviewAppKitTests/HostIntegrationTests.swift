import AppKit
import Testing
import UniviewYoga

@testable import UniviewAppKit
@testable import UniviewNativeCore

/// End-to-end: CommitBatch → ShadowTree → real Yoga layout → mounted NSView
/// tree with correct content AND frames. This is the whole framework working.
@MainActor
@Suite struct HostIntegrationTests {
    @Test func rendersStyledFlexLayoutWithRealYoga() throws {
        let host = UniviewHost(
            layoutEngine: YogaLayoutEngine(),
            containerSize: Size(width: 300, height: 200),
            executeHandler: { _, _ in })

        host.apply(
            CommitBatch(
                revision: 0,
                mutations: [
                    .setRoot(
                        node: UINode(
                            id: "root", type: "View",
                            props: [
                                "style": .object([
                                    "flexDirection": .string("row"),
                                    "paddingTop": .number(12), "paddingLeft": .number(12),
                                    "paddingRight": .number(12), "paddingBottom": .number(12),
                                    "gap": .number(8),
                                    "width": .number(300), "height": .number(200),
                                ])
                            ],
                            children: [
                                UINode(
                                    id: "a", type: "Button",
                                    props: [
                                        "title": .string("A"),
                                        "style": .object(["width": .number(80), "height": .number(30)]),
                                    ]),
                                UINode(
                                    id: "b", type: "Button",
                                    props: [
                                        "title": .string("B"),
                                        "style": .object(["width": .number(80), "height": .number(30)]),
                                    ]),
                            ]))
                ]))

        let root = try #require(host.rootView)
        #expect(root.frame == NSRect(x: 0, y: 0, width: 300, height: 200))
        #expect(root.subviews.count == 2)

        let a = try #require(host.view(for: "a") as? NSButton)
        let b = try #require(host.view(for: "b") as? NSButton)
        #expect(a.title == "A")
        #expect(b.title == "B")
        #expect(a.frame == NSRect(x: 12, y: 12, width: 80, height: 30))
        #expect(b.frame == NSRect(x: 100, y: 12, width: 80, height: 30))  // 12 + 80 + 8 gap
    }

    @Test func resizeReflowsLayout() throws {
        let host = UniviewHost(
            layoutEngine: YogaLayoutEngine(),
            containerSize: Size(width: 100, height: 100),
            executeHandler: { _, _ in })

        host.apply(
            CommitBatch(
                revision: 0,
                mutations: [
                    .setRoot(
                        node: UINode(
                            id: "r", type: "View",
                            props: ["style": .object(["width": .string("100%"), "height": .string("100%")])]))
                ]))
        #expect(host.view(for: "r")?.frame.width == 100)

        host.setContainerSize(Size(width: 250, height: 120))
        #expect(host.view(for: "r")?.frame == NSRect(x: 0, y: 0, width: 250, height: 120))
    }
}
