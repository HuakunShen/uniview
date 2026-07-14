import AppKit

/// A top-down `NSView` (origin at top-left) matching Yoga's coordinate space,
/// so computed frames map straight onto subview frames.
public final class FlippedView: NSView {
    public override var isFlipped: Bool { true }
}

/// Parses the color strings the Style IR carries (hex + `transparent`) into
/// `NSColor`. The Style IR resolves named tokens (e.g. `bg-primary`) to hex
/// on the TS side, so the host only sees concrete colors.
public enum CSSColor {
    public static func parse(_ string: String) -> NSColor? {
        let value = string.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if value == "transparent" { return .clear }
        guard value.hasPrefix("#") else { return nil }
        let hex = String(value.dropFirst())

        func channel(_ sub: Substring) -> CGFloat {
            CGFloat(Int(sub, radix: 16) ?? 0) / 255.0
        }

        switch hex.count {
        case 3:
            let chars = Array(hex)
            func expand(_ c: Character) -> CGFloat {
                CGFloat(Int(String([c, c]), radix: 16) ?? 0) / 255.0
            }
            return NSColor(
                srgbRed: expand(chars[0]), green: expand(chars[1]), blue: expand(chars[2]),
                alpha: 1)
        case 6:
            return NSColor(
                srgbRed: channel(hex.prefix(2)),
                green: channel(hex.dropFirst(2).prefix(2)),
                blue: channel(hex.dropFirst(4).prefix(2)),
                alpha: 1)
        case 8:
            return NSColor(
                srgbRed: channel(hex.prefix(2)),
                green: channel(hex.dropFirst(2).prefix(2)),
                blue: channel(hex.dropFirst(4).prefix(2)),
                alpha: channel(hex.dropFirst(6).prefix(2)))
        default:
            return nil
        }
    }
}
