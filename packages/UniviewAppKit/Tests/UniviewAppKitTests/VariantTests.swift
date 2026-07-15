import AppKit
import Testing

@testable import UniviewAppKit
@testable import UniviewNativeCore
@testable import UniviewYoga

/// `dark:` / `hover:` / `active:` are conditions the HOST owns. The plugin can't
/// know them — a window can be light while the system is dark, and streaming
/// every mouse-enter over RPC to re-render a React tree is absurd — so both
/// styles travel in the IR and the view picks.
@MainActor
@Suite struct VariantTests {

    private func style(_ json: [String: JSONValue]) -> StyleIR {
        try! JSONValue.object(json).decode(StyleIR.self)
    }

    @Test func anOverlayAppliesOnlyWhenItsConditionHolds() {
        let ir = style([
            "backgroundColor": .string("#ffffff"),
            "variants": .object([
                "dark": .object(["backgroundColor": .string("#18181b")])
            ]),
        ])

        #expect(ir.resolved(for: ["light"]).backgroundColor == "#ffffff")
        #expect(ir.resolved(for: ["dark"]).backgroundColor == "#18181b")
    }

    @Test func fieldsTheOverlayDoesNotSetAreLeftAlone() {
        let ir = style([
            "backgroundColor": .string("#ffffff"),
            "borderWidth": .number(1),
            "variants": .object(["hover": .object(["backgroundColor": .string("#eeeeee")])]),
        ])
        let hovered = ir.resolved(for: ["light", "hover"])
        #expect(hovered.backgroundColor == "#eeeeee")
        #expect(hovered.borderWidth == 1)
    }

    /// Every condition in a chain has to hold, and a longer chain outranks a
    /// shorter one — the precedence a reader expects from Tailwind.
    @Test func aChainNeedsAllOfItAndBeatsTheShorterOne() {
        let ir = style([
            "backgroundColor": .string("a"),
            "variants": .object([
                "dark": .object(["backgroundColor": .string("b")]),
                "dark:hover": .object(["backgroundColor": .string("c")]),
            ]),
        ])

        #expect(ir.resolved(for: ["light"]).backgroundColor == "a")
        #expect(ir.resolved(for: ["dark"]).backgroundColor == "b")
        #expect(ir.resolved(for: ["light", "hover"]).backgroundColor == "a")
        #expect(ir.resolved(for: ["dark", "hover"]).backgroundColor == "c")
    }

    @Test func aStyleWithNoVariantsIsReturnedUntouched() {
        let ir = style(["backgroundColor": .string("#fff")])
        #expect(ir.resolved(for: ["dark", "hover"]) == ir)
    }

    /// The state is read off the VIEW, so it follows a window that forces its own
    /// appearance — which is the thing pushing the color scheme to the plugin
    /// could never do.
    @Test func aViewReportsTheStateItIsActuallyIn() {
        let view = FlippedView()
        view.appearance = NSAppearance(named: .darkAqua)
        #expect(view.styleState == ["dark"])

        view.appearance = NSAppearance(named: .aqua)
        #expect(view.styleState == ["light"])

        view.tracksPointer = true
        view.isHovered = true
        #expect(view.styleState == ["light", "hover"])
    }

    /// A tracking area isn't free and most views never hover, so only the ones
    /// whose style mentions `hover:` pay for one.
    @Test func onlyViewsThatAskForHoverPayForTracking() throws {
        let host = UniviewHost(
            registry: .standard(), layoutEngine: YogaLayoutEngine(),
            containerSize: Size(width: 100, height: 100), executeHandler: { _, _ in })

        host.apply(
            CommitBatch(
                revision: 0,
                mutations: [
                    .setRoot(
                        node: UINode(
                            id: "r", type: "View",
                            props: ["_style": .object(["flexDirection": .string("row")])],
                            children: [
                                UINode(
                                    id: "plain", type: "View",
                                    props: ["_style": .object(["backgroundColor": .string("card")])]),
                                UINode(
                                    id: "hoverable", type: "View",
                                    props: [
                                        "_style": .object([
                                            "backgroundColor": .string("card"),
                                            "variants": .object([
                                                "hover": .object([
                                                    "backgroundColor": .string("muted")
                                                ])
                                            ]),
                                        ])
                                    ]),
                            ]))
                ]))

        let plain = try #require(host.view(for: "plain") as? FlippedView)
        let hoverable = try #require(host.view(for: "hoverable") as? FlippedView)
        #expect(!plain.tracksPointer)
        #expect(hoverable.tracksPointer)
    }

    /// The payoff: the same node paints differently on hover, with no re-render,
    /// no RPC, and no involvement from the plugin at all.
    @Test func hoveringRepaintsTheViewWithoutAskingThePlugin() throws {
        let host = UniviewHost(
            registry: .standard(), layoutEngine: YogaLayoutEngine(),
            containerSize: Size(width: 100, height: 100),
            executeHandler: { _, _ in Issue.record("the plugin must not hear about a hover") })

        host.apply(
            CommitBatch(
                revision: 0,
                mutations: [
                    .setRoot(
                        node: UINode(
                            id: "box", type: "View",
                            props: [
                                "_style": .object([
                                    "backgroundColor": .string("#ff0000"),
                                    "variants": .object([
                                        "hover": .object(["backgroundColor": .string("#00ff00")])
                                    ]),
                                ])
                            ]))
                ]))

        let box = try #require(host.view(for: "box") as? FlippedView)
        let red = NSColor(cgColor: box.layer!.backgroundColor!)!.usingColorSpace(.sRGB)!
        #expect(red.redComponent > 0.9 && red.greenComponent < 0.1)

        box.isHovered = true
        let green = NSColor(cgColor: box.layer!.backgroundColor!)!.usingColorSpace(.sRGB)!
        #expect(green.greenComponent > 0.9 && green.redComponent < 0.1)

        box.isHovered = false
        let back = NSColor(cgColor: box.layer!.backgroundColor!)!.usingColorSpace(.sRGB)!
        #expect(back.redComponent > 0.9)
    }
}
