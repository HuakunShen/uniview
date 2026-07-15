import Foundation
import Testing

@testable import UniviewNativeCore

@Suite struct StyleIRDecodingTests {
    @Test func decodesResolvedStyleObject() throws {
        // Shaped exactly like what @uniview/style resolveStyle() emits.
        let json = """
        {
          "flexDirection": "row",
          "justifyContent": "space-between",
          "alignItems": "center",
          "gap": 16,
          "paddingTop": 16, "paddingRight": 16, "paddingBottom": 16, "paddingLeft": 16,
          "width": "100%",
          "height": 40,
          "maxWidth": "auto",
          "backgroundColor": "#0a84ff",
          "borderRadius": 8,
          "opacity": 0.5,
          "fontSize": 13,
          "fontWeight": "bold",
          "textAlign": "center"
        }
        """
        let style = try JSONDecoder().decode(StyleIR.self, from: Data(json.utf8))
        #expect(style.flexDirection == .row)
        #expect(style.justifyContent == .spaceBetween)
        #expect(style.alignItems == .center)
        #expect(style.gap == 16)
        #expect(style.paddingTop == 16)
        #expect(style.paddingLeft == 16)
        #expect(style.width == .percent(100))
        #expect(style.height == .points(40))
        #expect(style.maxWidth == .auto)
        #expect(style.backgroundColor == "#0a84ff")
        #expect(style.borderRadius == 8)
        #expect(style.opacity == 0.5)
        #expect(style.fontSize == 13)
        #expect(style.fontWeight == .bold)
        #expect(style.textAlign == .center)
    }

    @Test func emptyObjectDecodesToAllNil() throws {
        let style = try JSONDecoder().decode(StyleIR.self, from: Data("{}".utf8))
        #expect(style.flexDirection == nil)
        #expect(style.gap == nil)
        #expect(style.width == nil)
        #expect(style.backgroundColor == nil)
    }

    @Test func dimensionRoundTrips() throws {
        let dims: [StyleDimension] = [.points(40), .percent(50), .auto]
        for dim in dims {
            let data = try JSONEncoder().encode(dim)
            let decoded = try JSONDecoder().decode(StyleDimension.self, from: data)
            #expect(decoded == dim)
        }
    }

    @Test func percentEncodesWithoutTrailingZero() throws {
        let data = try JSONEncoder().encode(StyleDimension.percent(100))
        #expect(String(data: data, encoding: .utf8) == "\"100%\"")
    }
}

/// Decoding is field-by-field, so one bad field costs only itself. A plugin built
/// against a newer `@uniview/style` sends fields this host has never heard of; the
/// node must degrade to the styling we *do* understand, not lose all of it.
@Suite struct StyleIRResilientDecodingTests {
    @Test func unknownFieldIsSkippedAndKnownFieldsSurvive() {
        let (style, issues) = StyleIR.decoding(
            .object([
                "width": .number(120),
                "backgroundColor": .string("#0a84ff"),
                "backdropSaturation": .number(1.8),  // a field from a newer @uniview/style
            ]))

        #expect(style.width == .points(120))
        #expect(style.backgroundColor == "#0a84ff")
        #expect(issues == [StyleDecodeIssue(field: "backdropSaturation", reason: .unknownField)])
    }

    /// `variants` is a field like any other, and the field-by-field path has to
    /// know it. It didn't: every styled node reported it as an unknown field, and
    /// when some *other* field was unusable — the only time that path runs — the
    /// node's `dark:` and `hover:` styles were dropped along with it.
    @Test func aBadFieldDoesNotTakeTheVariantsDownWithIt() {
        let (style, issues) = StyleIR.decoding(
            .object([
                "backgroundColor": .string("#ffffff"),
                "width": .string("not a width"),
                "variants": .object(["dark": .object(["backgroundColor": .string("#18181b")])]),
            ]))

        #expect(style.backgroundColor == "#ffffff")
        #expect(style.resolved(for: ["dark"]).backgroundColor == "#18181b")
        #expect(issues.map(\.field) == ["width"])
    }

    @Test func wrongTypedFieldIsSkippedAndTheRestSurvives() {
        // The regression: `shadow` used to be a color string, and is now a
        // BoxShadow. The stale string must not take the whole style down with it.
        let (style, issues) = StyleIR.decoding(
            .object([
                "width": .number(200),
                "height": .number(64),
                "borderRadius": .number(12),
                "backgroundGradient": .object([
                    "direction": .string("to-r"),
                    "colors": .array([.string("#111"), .string("#333")]),
                ]),
                "shadow": .string("brand"),  // stale: was a color token, now a struct
            ]))

        #expect(style.width == .points(200))
        #expect(style.height == .points(64))
        #expect(style.borderRadius == 12)
        #expect(
            style.backgroundGradient
                == LinearGradient(direction: .toRight, colors: ["#111", "#333"]))
        #expect(style.shadow == nil)
        #expect(issues.count == 1)
        #expect(issues.first?.field == "shadow")
        #expect(issues.first?.reason != .unknownField)
    }

    @Test func wellFormedStyleReportsNoIssues() {
        let (style, issues) = StyleIR.decoding(
            .object(["flexDirection": .string("row"), "gap": .number(8)]))

        #expect(style.flexDirection == .row)
        #expect(style.gap == 8)
        #expect(issues.isEmpty)
    }

    @Test func nullFieldMeansUnsetNotBroken() {
        let (style, issues) = StyleIR.decoding(.object(["gap": .null, "width": .number(10)]))

        #expect(style.gap == nil)
        #expect(style.width == .points(10))
        #expect(issues.isEmpty)
    }

    @Test func nonObjectStyleYieldsEmptyStyleAndOneIssue() {
        let (style, issues) = StyleIR.decoding(.string("nonsense"))

        #expect(style == StyleIR())
        #expect(issues.count == 1)
    }

    /// The whole point of the exercise, at the level the host actually sees it.
    @Test func nodeKeepsItsStylingWhenOneFieldIsBad() {
        var reported: [(String, StyleDecodeIssue)] = []
        let node = UINode(
            id: "card", type: "View",
            props: [
                "_style": .object([
                    "width": .number(320),
                    "borderRadius": .number(16),
                    "shadow": .string("brand"),
                ])
            ])

        let shadow = ShadowNode.from(node, reportingTo: { reported.append(($0, $1)) })

        #expect(shadow.style.width == .points(320))
        #expect(shadow.style.borderRadius == 16)
        #expect(reported.count == 1)
        #expect(reported.first?.0 == "card")
        #expect(reported.first?.1.field == "shadow")
    }
}
