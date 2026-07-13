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
