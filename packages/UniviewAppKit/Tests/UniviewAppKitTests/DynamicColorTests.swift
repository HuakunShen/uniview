import AppKit
import Testing

@testable import UniviewAppKit
@testable import UniviewNativeCore
@testable import UniviewYoga

/// Semantic color tokens (`bg-card`, `text-foreground`, `border`) reach the host
/// as NAMES, not hex — so that the OS gets to say what they look like, per view,
/// per appearance. These tests are about the half of that promise that is easy to
/// get wrong: keeping them alive once they're here.
@MainActor
@Suite struct DynamicColorTests {

    private func host() -> UniviewHost {
        UniviewHost(
            registry: .standard(), layoutEngine: YogaLayoutEngine(),
            containerSize: Size(width: 200, height: 200), executeHandler: { _, _ in })
    }

    private func mount(_ host: UniviewHost, style: [String: JSONValue]) -> NSView {
        host.apply(
            CommitBatch(
                revision: 0,
                mutations: [
                    .setRoot(node: UINode(id: "box", type: "View", props: ["_style": .object(style)]))
                ]))
        return host.view(for: "box")!
    }

    private func rgb(_ color: CGColor?) -> [CGFloat] {
        NSColor(cgColor: color!)!.usingColorSpace(.sRGB)!.let { [$0.redComponent, $0.greenComponent, $0.blueComponent] }
    }

    /// The bug this whole design exists to avoid. `NSColor` is dynamic; `CGColor`
    /// is a snapshot. Assigning `layer.backgroundColor = .controlBackgroundColor.cgColor`
    /// freezes the color at the appearance current on that line — the token arrives
    /// intact and still paints the wrong thing forever after.
    @Test func aSemanticBackgroundFollowsTheAppearanceInsteadOfFreezing() {
        let host = self.host()
        let view = mount(host, style: ["backgroundColor": .string("card")])

        view.appearance = NSAppearance(named: .aqua)
        let light = view.layer!.backgroundColor

        view.appearance = NSAppearance(named: .darkAqua)
        let dark = view.layer!.backgroundColor

        #expect(light != nil && dark != nil)
        #expect(rgb(light) != rgb(dark), "a native token that doesn't move in dark mode is just a hex")
    }

    @Test func aSemanticBorderFollowsTheAppearanceToo() {
        let host = self.host()
        let view = mount(
            host,
            style: ["borderWidth": .number(1), "borderColor": .string("border")])

        view.appearance = NSAppearance(named: .aqua)
        let light = view.layer!.borderColor
        view.appearance = NSAppearance(named: .darkAqua)
        let dark = view.layer!.borderColor

        #expect(rgb(light) != rgb(dark))
    }

    /// A palette color is a literal. `bg-emerald-500` means *that* green in both
    /// appearances — same as it does in Tailwind.
    @Test func aPaletteColorIsTheSameColorInBothAppearances() {
        let host = self.host()
        let view = mount(host, style: ["backgroundColor": .string("#00bc7d")])

        view.appearance = NSAppearance(named: .aqua)
        let light = view.layer!.backgroundColor
        view.appearance = NSAppearance(named: .darkAqua)
        let dark = view.layer!.backgroundColor

        #expect(rgb(light) == rgb(dark))
        #expect(rgb(light) == rgb(NSColor(srgbRed: 0, green: 0xBC / 255.0, blue: 0x7D / 255.0, alpha: 1).cgColor))
    }

    /// `bg-card/50`. A name has no hex to fold Tailwind's alpha into, so it travels
    /// as `card/50` and is folded here — and must still be dynamic afterwards.
    @Test func alphaOnANativeTokenSurvivesAndStaysDynamic() throws {
        let half = try #require(CSSColor.parse("card/50"))
        #expect(abs(half.alphaComponent - 0.5) < 0.01)

        var light: NSColor?
        var dark: NSColor?
        NSAppearance(named: .aqua)?.performAsCurrentDrawingAppearance { light = NSColor(cgColor: half.cgColor) }
        NSAppearance(named: .darkAqua)?.performAsCurrentDrawingAppearance { dark = NSColor(cgColor: half.cgColor) }
        #expect(light?.usingColorSpace(.sRGB)?.redComponent != dark?.usingColorSpace(.sRGB)?.redComponent)
    }

    /// `muted` / `secondary` are shadcn *surfaces*. They used to map to a label
    /// color, which paints a background the color of text.
    @Test func mutedAndSecondaryAreBackgroundsNotText() {
        #expect(CSSColor.parse("muted") == NSColor.underPageBackgroundColor)
        #expect(CSSColor.parse("secondary") == NSColor.underPageBackgroundColor)
        #expect(CSSColor.parse("muted-foreground") == NSColor.secondaryLabelColor)
        #expect(CSSColor.parse("foreground") == NSColor.labelColor)
    }

    @Test func unknownNamesStillFailRatherThanPaintBlack() {
        #expect(CSSColor.parse("not-a-color") == nil)
        #expect(CSSColor.parse("emerald-500") == nil)  // palette names never reach here
    }
}

extension NSColor {
    fileprivate func `let`<T>(_ body: (NSColor) -> T) -> T { body(self) }
}
