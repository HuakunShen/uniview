import AppKit
import UniviewNativeCore

/// A top-down `NSView` (origin at top-left) matching Yoga's coordinate space,
/// so computed frames map straight onto subview frames.
public class FlippedView: NSView {
    public override var isFlipped: Bool { true }
}

/// A flipped `NSVisualEffectView` for native vibrancy/materials on a Uniview
/// container (top-down coords like `FlippedView`).
public final class MaterialView: NSVisualEffectView {
    public override var isFlipped: Bool { true }
}

/// A flipped container that paints a diagonal (top-leading → bottom-trailing)
/// gradient behind its content — the backing for the Style IR's
/// `backgroundGradient` (hero chips, brand surfaces). The gradient sublayer
/// tracks the view's bounds and corner radius.
public final class GradientView: FlippedView {
    private let gradient = CAGradientLayer()

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        gradient.startPoint = CGPoint(x: 0, y: 0)
        gradient.endPoint = CGPoint(x: 1, y: 1)
        layer?.insertSublayer(gradient, at: 0)
    }

    public required init?(coder: NSCoder) { fatalError() }

    public func setGradientColors(_ colors: [CGColor]) {
        gradient.colors = colors.isEmpty ? nil : colors
    }

    public override func layout() {
        super.layout()
        gradient.frame = bounds
        gradient.cornerRadius = layer?.cornerRadius ?? 0
    }
}

/// Maps Style-IR material tokens (carried on the `material` prop) to AppKit
/// `NSVisualEffectView.Material`s, so a `View` can request native vibrancy —
/// e.g. `sidebar` (Liquid Glass on macOS 26), `hud`, `popover`.
public enum UniviewMaterial {
    public static func material(_ token: String) -> NSVisualEffectView.Material {
        switch token.lowercased() {
        case "sidebar": return .sidebar
        case "hud": return .hudWindow
        case "popover": return .popover
        case "menu": return .menu
        case "titlebar": return .titlebar
        case "selection": return .selection
        case "header": return .headerView
        case "content", "regular": return .contentBackground
        case "under-window", "underwindow": return .underWindowBackground
        case "under-page", "underpage": return .underPageBackground
        case "sheet": return .sheet
        case "window", "thick": return .windowBackground
        default: return .contentBackground
        }
    }

    /// Sidebar / under-window materials blend with the desktop behind the
    /// window; everything else blends within the window (cards on content).
    public static func blendingMode(_ token: String) -> NSVisualEffectView.BlendingMode {
        let lowered = token.lowercased()
        return (lowered == "sidebar" || lowered.contains("under")) ? .behindWindow : .withinWindow
    }
}

/// The Uniview brand accent (matched to the reference app's bright blue).
public let univiewBrandColor = NSColor(srgbRed: 0.18, green: 0.57, blue: 0.78, alpha: 1)
public let univiewBrandViolet = NSColor(srgbRed: 0.31, green: 0.42, blue: 0.95, alpha: 1)
public let univiewBrandCyan = NSColor(srgbRed: 0.18, green: 0.70, blue: 0.92, alpha: 1)

/// The signature diagonal brand gradient (top-leading → bottom-trailing) used on
/// hero chips and the primary button — mirrors the reference app's `brandGradient`.
public var univiewBrandGradient: [CGColor] {
    [univiewBrandColor.cgColor, univiewBrandViolet.cgColor]
}

/// Maps the Style IR font weight to an AppKit `NSFont.Weight`.
func nsFontWeight(_ weight: FontWeight?) -> NSFont.Weight {
    switch weight {
    case .bold: return .bold
    case .semibold: return .semibold
    case .medium: return .medium
    case .normal, .none: return .regular
    }
}

/// Parses the color strings the Style IR carries into `NSColor`. Accepts hex
/// (`#rgb`/`#rrggbb`/`#rrggbbaa`), `transparent`, and **native semantic tokens**
/// that adapt to light/dark and vibrancy — so plugins can request truly native
/// colors instead of baking a fixed hex.
public enum CSSColor {
    public static func parse(_ string: String) -> NSColor? {
        let value = string.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        switch value {
        case "clear", "transparent": return .clear
        case "white": return .white
        case "black": return .black
        case "red", "danger", "destructive": return .systemRed
        case "green", "success": return .systemGreen
        case "orange", "warning": return .systemOrange
        case "yellow": return .systemYellow
        case "purple": return .systemPurple
        case "pink": return .systemPink
        case "gray", "grey": return .systemGray
        case "label", "foreground", "text": return .labelColor
        case "secondarylabel", "secondary", "muted-foreground", "muted": return .secondaryLabelColor
        case "tertiarylabel", "tertiary": return .tertiaryLabelColor
        case "quaternarylabel": return .quaternaryLabelColor
        case "placeholder": return .placeholderTextColor
        case "windowbackground", "background": return .windowBackgroundColor
        case "controlbackground", "surface", "card": return .controlBackgroundColor
        case "underpagebackground", "surface-elevated": return .underPageBackgroundColor
        case "separator", "border", "hairline": return .separatorColor
        case "grid": return .gridColor
        case "brand", "accent", "primary", "tint": return univiewBrandColor
        case "brand-violet": return univiewBrandViolet
        case "brand-cyan": return univiewBrandCyan
        case "control-accent": return .controlAccentColor
        case "selected-text-background": return .selectedTextBackgroundColor
        default: break
        }

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
