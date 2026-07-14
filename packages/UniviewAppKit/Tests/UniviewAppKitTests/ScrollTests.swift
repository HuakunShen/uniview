import AppKit
import Testing

@testable import UniviewAppKit
@testable import UniviewNativeCore
@testable import UniviewYoga

/// `overflow-scroll` becomes a real `NSScrollView` — a clip view and a document
/// view, with the children in the document. Before this it reached Yoga (the
/// layout was right) and stopped there: the prop looked wired and nothing
/// scrolled.
@MainActor
@Suite struct ScrollTests {

    private func host() -> UniviewHost {
        UniviewHost(
            registry: .standard(), layoutEngine: YogaLayoutEngine(),
            containerSize: Size(width: 200, height: 100), executeHandler: { _, _ in })
    }

    /// A column of 5×40pt rows inside a 100pt-tall scroll box: 200pt of content
    /// in a 100pt window.
    private func list(rows: Int) -> UINode {
        UINode(
            id: "scroll", type: "View",
            props: [
                "_style": .object([
                    "flexDirection": .string("column"),
                    "overflow": .string("scroll"),
                    "width": .number(200), "height": .number(100),
                ])
            ],
            children: (0..<rows).map { i in
                UINode(
                    id: "row\(i)", type: "View",
                    props: ["_style": .object(["height": .number(40)])])
            })
    }

    @Test func anOverflowScrollBoxIsARealScrollView() throws {
        let host = self.host()
        host.apply(CommitBatch(revision: 0, mutations: [.setRoot(node: list(rows: 5))]))

        let view = try #require(host.view(for: "scroll") as? ScrollView)
        // The children are in the DOCUMENT, not in the scroll view itself.
        #expect(view.subviews.contains { $0 is NSClipView })
        #expect(view.content.subviews.count == 5)
    }

    /// The whole point: the document is taller than the window, so there is
    /// somewhere to scroll to.
    @Test func theDocumentIsSizedToTheContentNotToTheBox() throws {
        let host = self.host()
        host.apply(CommitBatch(revision: 0, mutations: [.setRoot(node: list(rows: 5))]))

        let view = try #require(host.view(for: "scroll") as? ScrollView)
        #expect(view.frame.height == 100)
        #expect(view.content.frame.height == 200, "5 rows of 40pt")
    }

    /// A short list must still fill its box — a document smaller than the clip
    /// view leaves the background stopping halfway down.
    @Test func aShortListStillFillsTheBox() throws {
        let host = self.host()
        host.apply(CommitBatch(revision: 0, mutations: [.setRoot(node: list(rows: 1))]))

        let view = try #require(host.view(for: "scroll") as? ScrollView)
        #expect(view.content.frame.height >= view.contentView.bounds.height)
    }

    /// Reuse used to be keyed on the node's TYPE, so a `<div>` that grew an
    /// `overflow-scroll` (or a `material`) kept its old plain view forever and the
    /// prop looked dead. It is keyed on the kind of view the style implies now.
    @Test func aBoxThatBecomesScrollableIsRebuiltAsAScrollView() throws {
        let host = self.host()
        let plain = UINode(
            id: "box", type: "View",
            props: ["_style": .object(["height": .number(100)])])
        host.apply(CommitBatch(revision: 0, mutations: [.setRoot(node: plain)]))
        #expect(host.view(for: "box") is FlippedView)
        #expect(!(host.view(for: "box") is ScrollView))

        let scrollable = UINode(
            id: "box", type: "View",
            props: [
                "_style": .object([
                    "height": .number(100), "overflow": .string("scroll"),
                ])
            ])
        host.apply(CommitBatch(revision: 1, mutations: [.setRoot(node: scrollable)]))
        #expect(host.view(for: "box") is ScrollView)
    }
}
