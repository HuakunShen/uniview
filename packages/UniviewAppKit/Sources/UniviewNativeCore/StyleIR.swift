import Foundation

/// A resolved length: absolute points, a percentage (0–100), or `auto`.
/// Mirrors the Style IR `StyleDimension` (`number | "N%" | "auto"`).
public enum StyleDimension: Equatable, Sendable {
    case points(Double)
    case percent(Double)
    case auto
}

extension StyleDimension: Codable {
    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let number = try? container.decode(Double.self) {
            self = .points(number)
            return
        }
        let string = try container.decode(String.self)
        if string == "auto" {
            self = .auto
        } else if string.hasSuffix("%"), let value = Double(string.dropLast()) {
            self = .percent(value)
        } else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Invalid dimension: \(string)"
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .points(let value):
            try container.encode(value)
        case .percent(let value):
            let text = value == value.rounded() ? String(Int(value)) : String(value)
            try container.encode(text + "%")
        case .auto:
            try container.encode("auto")
        }
    }
}

/// A drop shadow as geometry, not a name. `shadow-lg` is a *look*, and every
/// design system draws it differently — so the numbers travel and the host just
/// renders them. A host that hardcodes radius and offset can draw exactly one
/// shadow, forever; this one used to.
public struct BoxShadow: Equatable, Sendable, Codable {
    public var offsetX: Double
    public var offsetY: Double
    public var radius: Double
    public var color: String
}

/// A linear gradient: a direction, and its stops.
///
/// The direction travels because it has to. This host used to paint every
/// gradient top-leading → bottom-trailing — which was fine, because the only
/// gradient it ever drew was one it had hardcoded itself. A renderer that owns
/// the angle owns the design. It should only own the drawing.
public struct LinearGradient: Equatable, Sendable, Codable {
    public var direction: GradientDirection
    /// `from`, any `via`, then `to` — at least two.
    public var colors: [String]

    public init(direction: GradientDirection, colors: [String]) {
        self.direction = direction
        self.colors = colors
    }
}

/// Tailwind's eight gradient directions.
///
/// `unit` is the (start, end) pair in the layer's 0…1 space with **y pointing
/// down**: Uniview's views are flipped, and `CAGradientLayer` follows its layer's
/// geometry, so `to-b` runs y=0 → y=1 and not the other way round.
public enum GradientDirection: String, Codable, Sendable {
    case toTop = "to-t"
    case toTopRight = "to-tr"
    case toRight = "to-r"
    case toBottomRight = "to-br"
    case toBottom = "to-b"
    case toBottomLeft = "to-bl"
    case toLeft = "to-l"
    case toTopLeft = "to-tl"

    public var unit: (start: (x: Double, y: Double), end: (x: Double, y: Double)) {
        switch self {
        case .toTop: return ((0.5, 1), (0.5, 0))
        case .toTopRight: return ((0, 1), (1, 0))
        case .toRight: return ((0, 0.5), (1, 0.5))
        case .toBottomRight: return ((0, 0), (1, 1))
        case .toBottom: return ((0.5, 0), (0.5, 1))
        case .toBottomLeft: return ((1, 0), (0, 1))
        case .toLeft: return ((1, 0.5), (0, 0.5))
        case .toTopLeft: return ((1, 1), (0, 0))
        }
    }
}

public enum FontStyle: String, Codable, Sendable {
    case normal
    case italic
}

public enum TextDecoration: String, Codable, Sendable {
    case none
    case underline
    case lineThrough = "line-through"
}

/// `none` takes the box out of layout — not merely invisible, absent.
public enum Display: String, Codable, Sendable {
    case flex
    case none
}

public enum Overflow: String, Codable, Sendable {
    case visible
    case hidden
    case scroll
}

public enum FlexDirection: String, Codable, Sendable {
    case row
    case column
    case rowReverse = "row-reverse"
    case columnReverse = "column-reverse"
}

public enum JustifyContent: String, Codable, Sendable {
    case flexStart = "flex-start"
    case center
    case flexEnd = "flex-end"
    case spaceBetween = "space-between"
    case spaceAround = "space-around"
    case spaceEvenly = "space-evenly"
}

public enum AlignItems: String, Codable, Sendable {
    case flexStart = "flex-start"
    case center
    case flexEnd = "flex-end"
    case stretch
    case baseline
}

public enum AlignSelf: String, Codable, Sendable {
    case auto
    case flexStart = "flex-start"
    case center
    case flexEnd = "flex-end"
    case stretch
    case baseline
}

public enum FlexWrap: String, Codable, Sendable {
    case nowrap
    case wrap
    case wrapReverse = "wrap-reverse"
}

public enum PositionType: String, Codable, Sendable {
    case relative
    case absolute
}

public enum TextAlign: String, Codable, Sendable {
    case left
    case center
    case right
}

public enum FontWeight: String, Codable, Sendable {
    case normal
    case medium
    case semibold
    case bold
}

/// The normalized style contract the host consumes — the Swift mirror of
/// `@uniview/style`'s `ResolvedStyle`. Produced plugin-side (Tailwind/style →
/// Style IR) and delivered in `props.style`; the host never parses Tailwind.
/// All fields optional; unset means inherit / engine default.
public struct StyleIR: Equatable, Sendable, Codable {
    // Layout — flex container
    public var flexDirection: FlexDirection?
    public var justifyContent: JustifyContent?
    public var alignItems: AlignItems?
    public var alignSelf: AlignSelf?
    public var flexGrow: Double?
    public var flexShrink: Double?
    public var flexBasis: StyleDimension?
    public var flexWrap: FlexWrap?
    public var gap: Double?
    // Layout — box edges
    public var paddingTop: Double?
    public var paddingRight: Double?
    public var paddingBottom: Double?
    public var paddingLeft: Double?
    /// Margins are dimensions, not plain points: `auto` margins are how a
    /// fixed-width box centers itself (Tailwind's `mx-auto`), and Yoga
    /// implements that natively.
    public var marginTop: StyleDimension?
    public var marginRight: StyleDimension?
    public var marginBottom: StyleDimension?
    public var marginLeft: StyleDimension?
    // Layout — sizing
    public var width: StyleDimension?
    public var height: StyleDimension?
    public var minWidth: StyleDimension?
    public var minHeight: StyleDimension?
    public var maxWidth: StyleDimension?
    public var maxHeight: StyleDimension?
    // Layout — positioning
    public var position: PositionType?
    public var top: Double?
    public var right: Double?
    public var bottom: Double?
    public var left: Double?
    /// Sibling paint order. Higher draws later (on top).
    public var zIndex: Double?
    public var display: Display?
    public var overflow: Overflow?
    /// width / height. Yoga sizes the missing axis from the other one.
    public var aspectRatio: Double?
    // Visual
    public var backgroundColor: String?
    /// A gradient fill. When set, it paints behind the content and takes
    /// precedence over `backgroundColor`.
    public var backgroundGradient: LinearGradient?
    public var borderColor: String?
    public var borderWidth: Double?
    public var borderRadius: Double?
    public var opacity: Double?
    public var shadow: BoxShadow?
    /// Overrides `shadow.color`, so `shadow-lg shadow-emerald-500/30` composes.
    public var shadowColor: String?
    // Typography
    public var color: String?
    public var fontSize: Double?
    public var fontWeight: FontWeight?
    public var fontFamily: String?
    public var fontStyle: FontStyle?
    public var textAlign: TextAlign?
    public var textDecoration: TextDecoration?
    /// Line height in points. Wins over `lineHeightMultiple` when both are set.
    public var lineHeight: Double?
    /// Line height as a multiple of the font size — what `leading-tight` means.
    /// The resolver can't turn it into points: the font size may come from a
    /// later class, or from a parent it never sees. We know the final size.
    public var lineHeightMultiple: Double?
    /// Truncate to this many lines (`truncate` = 1, `line-clamp-3` = 3).
    public var maxLines: Int?

    /// Conditional overlays, keyed by their condition chain (`"dark"`, `"hover"`,
    /// `"dark:hover"`). Every condition in a key must hold for that overlay to
    /// apply; more conditions win over fewer.
    ///
    /// These exist because the conditions are *ours*, not the plugin's. Which
    /// appearance this view ended up in, and where the pointer is, are things the
    /// host knows and the plugin cannot: a window can be forced light while the
    /// system is dark, and streaming every mouse-enter over RPC to re-render a
    /// React tree would be absurd. So both styles travel together and the view
    /// picks — no round trip, no re-render.
    public var variants: [String: StyleIR]?

    public init() {}

    /// The style to actually use, given which conditions currently hold.
    ///
    /// Overlays are applied least-specific first, so `dark:hover:` beats `dark:`
    /// beats the base — the same precedence a reader expects from Tailwind.
    public func resolved(for state: Set<String>) -> StyleIR {
        guard let variants, !variants.isEmpty else { return self }

        let matching = variants
            .filter { key, _ in key.split(separator: ":").allSatisfy { state.contains(String($0)) } }
            .sorted { $0.key.split(separator: ":").count < $1.key.split(separator: ":").count }

        var result = self
        for (_, overlay) in matching { result = result.overlaid(with: overlay) }
        return result
    }

    /// Every field the other style sets replaces ours; the rest is left alone.
    private func overlaid(with other: StyleIR) -> StyleIR {
        var out = self
        func take<T>(_ path: WritableKeyPath<StyleIR, T?>) {
            if let value = other[keyPath: path] { out[keyPath: path] = value }
        }
        take(\.flexDirection); take(\.justifyContent); take(\.alignItems)
        take(\.alignSelf); take(\.flexGrow); take(\.flexShrink); take(\.flexBasis)
        take(\.flexWrap); take(\.gap)
        take(\.paddingTop); take(\.paddingRight); take(\.paddingBottom); take(\.paddingLeft)
        take(\.marginTop); take(\.marginRight); take(\.marginBottom); take(\.marginLeft)
        take(\.width); take(\.height)
        take(\.minWidth); take(\.minHeight); take(\.maxWidth); take(\.maxHeight)
        take(\.position); take(\.top); take(\.right); take(\.bottom); take(\.left)
        take(\.zIndex); take(\.display); take(\.overflow); take(\.aspectRatio)
        take(\.backgroundColor); take(\.backgroundGradient)
        take(\.borderColor); take(\.borderWidth); take(\.borderRadius)
        take(\.opacity); take(\.shadow); take(\.shadowColor)
        take(\.color); take(\.fontSize); take(\.fontWeight); take(\.fontFamily)
        take(\.fontStyle); take(\.textAlign); take(\.textDecoration)
        take(\.lineHeight); take(\.lineHeightMultiple); take(\.maxLines)
        return out
    }

    /// The line height in points, given the size the text is actually drawn at.
    public func resolvedLineHeight(fontSize: Double) -> Double? {
        lineHeight ?? lineHeightMultiple.map { $0 * fontSize }
    }
}

// MARK: - Field-resilient decoding

/// A style field the host could not apply, so it can be logged instead of
/// vanishing. Carries the field name — the one thing needed to fix the plugin.
public struct StyleDecodeIssue: Equatable, Sendable, CustomStringConvertible {
    public enum Reason: Equatable, Sendable {
        /// The host has never heard of this field — most likely a plugin built
        /// against a newer `@uniview/style`.
        case unknownField
        /// The right name carrying the wrong shape (a stale or malformed value).
        case invalidValue(String)
    }

    public let field: String
    public let reason: Reason

    public init(field: String, reason: Reason) {
        self.field = field
        self.reason = reason
    }

    public var description: String {
        switch reason {
        case .unknownField:
            return "style: unknown field '\(field)' — ignored"
        case .invalidValue(let detail):
            return "style: field '\(field)' has an unusable value — ignored (\(detail))"
        }
    }
}

/// Reports a style field a node had to drop: the node's id, and what was wrong.
public typealias StyleIssueReporter = (String, StyleDecodeIssue) -> Void

extension StyleIR {
    /// Decode the Style IR **field by field**, so a single bad or unknown field
    /// costs only itself instead of the whole style.
    ///
    /// All-or-nothing decoding is the wrong trade here: the tree is a wire format
    /// shared with plugins that version independently of the host. A plugin built
    /// against a newer `@uniview/style` will send fields this host has never heard
    /// of, and the node should still get the width, color and padding it asked for.
    public static func decoding(_ value: JSONValue) -> (style: StyleIR, issues: [StyleDecodeIssue]) {
        guard case .object(let fields) = value else {
            let issue = StyleDecodeIssue(
                field: "style",
                reason: .invalidValue("expected an object, got \(value.preview)"))
            return (StyleIR(), [issue])
        }

        let unknown = fields.keys.filter { Field(rawValue: $0) == nil }.sorted()

        // Fast path: if every known field decodes, so does the whole object — one
        // pass, as before. Unknown keys the decoder ignores; we only name them.
        if let style = try? value.decode(StyleIR.self) {
            return (style, unknown.map { StyleDecodeIssue(field: $0, reason: .unknownField) })
        }

        // Something in there is unusable. Decode key by key to find out what, and
        // keep everything that isn't it.
        var style = StyleIR()
        var issues: [StyleDecodeIssue] = []
        for (name, raw) in fields.sorted(by: { $0.key < $1.key }) {
            // An explicit null is "unset" — exactly as if the key were absent.
            if raw.isNull { continue }
            guard let field = Field(rawValue: name) else {
                issues.append(StyleDecodeIssue(field: name, reason: .unknownField))
                continue
            }
            do {
                try apply(field, raw, to: &style)
            } catch {
                issues.append(
                    StyleDecodeIssue(field: name, reason: .invalidValue("got \(raw.preview)")))
            }
        }
        return (style, issues)
    }

    /// Every field this host knows, named exactly as it travels on the wire. A key
    /// that isn't in here is a field this host has never heard of — something to
    /// report, not a reason to throw the whole style away. The switch below is
    /// exhaustive, so a new IR field cannot be added without being wired up.
    private enum Field: String {
        case flexDirection, justifyContent, alignItems, alignSelf
        case flexGrow, flexShrink, flexBasis, flexWrap, gap
        case paddingTop, paddingRight, paddingBottom, paddingLeft
        case marginTop, marginRight, marginBottom, marginLeft
        case width, height, minWidth, minHeight, maxWidth, maxHeight
        case position, top, right, bottom, left, zIndex, display, overflow, aspectRatio
        case backgroundColor, backgroundGradient, borderColor, borderWidth, borderRadius
        case opacity, shadow, shadowColor
        case color, fontSize, fontWeight, fontFamily, fontStyle, textAlign, textDecoration
        case lineHeight, lineHeightMultiple, maxLines
        // The conditional overlays (`dark:`, `hover:`). Missing here, they were
        // named as an unknown field on every styled node — and, in the field-by-
        // field path, dropped outright: a bad `width` somewhere in the object took
        // the whole `dark:` style down with it.
        case variants
    }

    private static func apply(_ field: Field, _ raw: JSONValue, to style: inout StyleIR) throws {
        switch field {
        case .flexDirection: style.flexDirection = try decodeField(raw)
        case .justifyContent: style.justifyContent = try decodeField(raw)
        case .alignItems: style.alignItems = try decodeField(raw)
        case .alignSelf: style.alignSelf = try decodeField(raw)
        case .flexGrow: style.flexGrow = try decodeField(raw)
        case .flexShrink: style.flexShrink = try decodeField(raw)
        case .flexBasis: style.flexBasis = try decodeField(raw)
        case .flexWrap: style.flexWrap = try decodeField(raw)
        case .gap: style.gap = try decodeField(raw)
        case .paddingTop: style.paddingTop = try decodeField(raw)
        case .paddingRight: style.paddingRight = try decodeField(raw)
        case .paddingBottom: style.paddingBottom = try decodeField(raw)
        case .paddingLeft: style.paddingLeft = try decodeField(raw)
        case .marginTop: style.marginTop = try decodeField(raw)
        case .marginRight: style.marginRight = try decodeField(raw)
        case .marginBottom: style.marginBottom = try decodeField(raw)
        case .marginLeft: style.marginLeft = try decodeField(raw)
        case .width: style.width = try decodeField(raw)
        case .height: style.height = try decodeField(raw)
        case .minWidth: style.minWidth = try decodeField(raw)
        case .minHeight: style.minHeight = try decodeField(raw)
        case .maxWidth: style.maxWidth = try decodeField(raw)
        case .maxHeight: style.maxHeight = try decodeField(raw)
        case .position: style.position = try decodeField(raw)
        case .top: style.top = try decodeField(raw)
        case .right: style.right = try decodeField(raw)
        case .bottom: style.bottom = try decodeField(raw)
        case .left: style.left = try decodeField(raw)
        case .zIndex: style.zIndex = try decodeField(raw)
        case .display: style.display = try decodeField(raw)
        case .overflow: style.overflow = try decodeField(raw)
        case .aspectRatio: style.aspectRatio = try decodeField(raw)
        case .backgroundColor: style.backgroundColor = try decodeField(raw)
        case .backgroundGradient: style.backgroundGradient = try decodeField(raw)
        case .borderColor: style.borderColor = try decodeField(raw)
        case .borderWidth: style.borderWidth = try decodeField(raw)
        case .borderRadius: style.borderRadius = try decodeField(raw)
        case .opacity: style.opacity = try decodeField(raw)
        case .shadow: style.shadow = try decodeField(raw)
        case .shadowColor: style.shadowColor = try decodeField(raw)
        case .color: style.color = try decodeField(raw)
        case .fontSize: style.fontSize = try decodeField(raw)
        case .fontWeight: style.fontWeight = try decodeField(raw)
        case .fontFamily: style.fontFamily = try decodeField(raw)
        case .fontStyle: style.fontStyle = try decodeField(raw)
        case .textAlign: style.textAlign = try decodeField(raw)
        case .textDecoration: style.textDecoration = try decodeField(raw)
        case .lineHeight: style.lineHeight = try decodeField(raw)
        case .lineHeightMultiple: style.lineHeightMultiple = try decodeField(raw)
        case .maxLines: style.maxLines = try decodeField(raw)
        case .variants: style.variants = try decodeField(raw)
        }
    }

    /// Decode a single field's value. Wrapped in an array because a bare JSON
    /// fragment (`40`, `"row"`) is not a valid top-level document everywhere.
    private static func decodeField<T: Decodable>(_ raw: JSONValue) throws -> T {
        let data = try JSONEncoder().encode([raw])
        guard let value = try JSONDecoder().decode([T].self, from: data).first else {
            throw DecodingError.valueNotFound(
                T.self,
                DecodingError.Context(codingPath: [], debugDescription: "no value"))
        }
        return value
    }
}

extension JSONValue {
    /// A short rendering of a value for diagnostics — enough to recognize what the
    /// plugin sent, without dumping a whole subtree into the log.
    fileprivate var preview: String {
        switch self {
        case .null: return "null"
        case .bool(let value): return "\(value)"
        case .number(let value): return "\(value)"
        case .string(let value): return "\"\(value)\""
        case .array: return "an array"
        case .object: return "an object"
        }
    }
}
