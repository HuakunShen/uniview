import AppKit
import Testing

@testable import UniviewAppKit
@testable import UniviewNativeCore
@testable import UniviewYoga

/// `onClick` on a plain box. Not everything clickable is a button — a sidebar row,
/// a card, a tile — and `<div onClick>` used to cross the wire, reach the node,
/// and be read by nobody at all.
@MainActor
@Suite struct ClickTests {

    private func click(at point: NSPoint, in view: NSView) -> NSEvent {
        NSEvent.mouseEvent(
            with: .leftMouseUp, location: view.convert(point, to: nil), modifierFlags: [],
            timestamp: 0, windowNumber: 0, context: nil, eventNumber: 0, clickCount: 1,
            pressure: 1)!
    }

    private func host(
        _ props: [String: JSONValue], onClick: @escaping @MainActor (String, [JSONValue]) -> Void
    ) -> UniviewHost {
        var props = props
        props["_style"] = .object(["width": .number(100), "height": .number(40)])
        let host = UniviewHost(
            registry: .standard(), layoutEngine: YogaLayoutEngine(),
            containerSize: Size(width: 100, height: 100), executeHandler: onClick)
        host.apply(
            CommitBatch(
                revision: 0,
                mutations: [.setRoot(node: UINode(id: "row", type: "View", props: props))]))
        return host
    }

    @Test func clickingABoxWithAnOnClickFiresIt() throws {
        var fired: [String] = []
        let host = self.host(["_onClickHandlerId": .string("h1")]) { id, _ in fired.append(id) }
        let row = try #require(host.view(for: "row") as? FlippedView)

        row.mouseUp(with: click(at: NSPoint(x: 50, y: 20), in: row))

        #expect(fired == ["h1"])
    }

    /// Press, slide off, release: no click — the way it works for every button on
    /// the machine.
    @Test func releasingOutsideTheBoxIsNotAClick() throws {
        var fired = 0
        let host = self.host(["_onClickHandlerId": .string("h1")]) { _, _ in fired += 1 }
        let row = try #require(host.view(for: "row") as? FlippedView)

        row.mouseUp(with: click(at: NSPoint(x: 500, y: 20), in: row))

        #expect(fired == 0)
    }

    /// A box nobody listens to must not swallow the event: `movableByWindow-
    /// Background` drags the window by exactly the clicks that nothing claims.
    @Test func aBoxWithNoHandlerClaimsNothing() throws {
        let host = self.host([:]) { _, _ in Issue.record("nothing was listening") }
        let row = try #require(host.view(for: "row") as? FlippedView)

        #expect(row.clickInterest.isEmpty)
        row.mouseUp(with: click(at: NSPoint(x: 50, y: 20), in: row))
    }
}
