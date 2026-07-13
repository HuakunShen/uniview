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
    public var marginTop: Double?
    public var marginRight: Double?
    public var marginBottom: Double?
    public var marginLeft: Double?
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
    // Visual
    public var backgroundColor: String?
    public var borderColor: String?
    public var borderWidth: Double?
    public var borderRadius: Double?
    public var opacity: Double?
    // Typography
    public var color: String?
    public var fontSize: Double?
    public var fontWeight: FontWeight?
    public var fontFamily: String?
    public var textAlign: TextAlign?
    public var lineHeight: Double?

    public init() {}
}
