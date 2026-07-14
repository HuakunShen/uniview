import AppKit
import UniviewNativeCore

/// A view whose layer colors are re-resolved whenever its appearance changes.
///
/// This is what makes a native color token worth anything at all. `NSColor` is
/// dynamic — `.labelColor` *is* a different color in dark mode. `CGColor` is a
/// **snapshot**. The moment you write `layer.backgroundColor = color.cgColor` you
/// have frozen that color at whatever appearance happened to be current, and it
/// will not move again: not when the user flips the system to dark, and not when
/// the view lands inside a window carrying `<Window appearance="light">`. The
/// token would arrive perfectly intact and still paint the wrong color.
///
/// So the paint step is *stored*, not merely performed — and re-run with the
/// view's own appearance made current, because "current appearance" is precisely
/// what `.cgColor` reads to decide what it means.
@MainActor
public protocol AppearanceSensitive: NSView {
    /// How this view paints its layer. Re-run on every appearance change.
    var repaint: ((CALayer) -> Void)? { get set }
}

extension AppearanceSensitive {
    /// Record how to paint, and paint now.
    public func setRepaint(_ paint: @escaping (CALayer) -> Void) {
        repaint = paint
        repaintNow()
    }

    /// Re-run the stored paint step under this view's *effective* appearance —
    /// the window's, if it overrides the system's.
    public func repaintNow() {
        guard let layer, let repaint else { return }
        effectiveAppearance.performAsCurrentDrawingAppearance { repaint(layer) }
    }
}

/// A top-down `NSView` (origin at top-left) matching Yoga's coordinate space,
/// so computed frames map straight onto subview frames.
public class FlippedView: NSView, AppearanceSensitive {
    public var repaint: ((CALayer) -> Void)?
    public override var isFlipped: Bool { true }

    public override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance()
        repaintNow()
    }
}

/// A flipped `NSVisualEffectView` for native vibrancy/materials on a Uniview
/// container (top-down coords like `FlippedView`).
public final class MaterialView: NSVisualEffectView, AppearanceSensitive {
    public var repaint: ((CALayer) -> Void)?
    public override var isFlipped: Bool { true }

    public override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance()
        repaintNow()
    }
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
    /// The full non-deprecated `NSVisualEffectView.Material` set, under the names
    /// Electron's `vibrancy` and Tauri's `Effect` already use — so a plugin
    /// author who knows either one already knows these.
    public static func material(_ token: String) -> NSVisualEffectView.Material {
        switch token.lowercased() {
        case "titlebar": return .titlebar
        case "selection": return .selection
        case "menu": return .menu
        case "popover": return .popover
        case "sidebar": return .sidebar
        case "header", "header-view": return .headerView
        case "sheet": return .sheet
        case "window", "window-background", "thick": return .windowBackground
        case "hud", "hud-window": return .hudWindow
        case "fullscreen-ui", "full-screen-ui": return .fullScreenUI
        case "tooltip": return .toolTip
        case "content", "content-background", "regular": return .contentBackground
        case "under-window", "under-window-background": return .underWindowBackground
        case "under-page", "under-page-background": return .underPageBackground
        default: return .contentBackground
        }
    }

    /// Whether the material keeps its blur when the window loses focus. Tauri
    /// calls this `EffectState`; Electron calls it `visualEffectState`.
    public static func state(_ token: String?) -> NSVisualEffectView.State {
        switch token?.lowercased() {
        case "active": return .active
        case "inactive": return .inactive
        default: return .followsWindowActiveState
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

/// The font a Style IR describes.
func nsFont(for style: StyleIR, defaultSize: Double = Double(NSFont.systemFontSize)) -> NSFont {
    NSFont.systemFont(
        ofSize: CGFloat(style.fontSize ?? defaultSize),
        weight: nsFontWeight(style.fontWeight))
}

/// Measures a run of text, wrapping it at `maxWidth` (which may be `.infinity`
/// when the layout engine hasn't constrained the node yet). This is what makes a
/// text node have a size at all: nothing in the Style IR implies one.
func measureText(_ text: String, font: NSFont, maxWidth: Double) -> Size {
    guard !text.isEmpty else { return .zero }
    let bound = maxWidth.isFinite ? CGFloat(maxWidth) : CGFloat.greatestFiniteMagnitude
    let rect = NSAttributedString(string: text, attributes: [.font: font]).boundingRect(
        with: NSSize(width: bound, height: .greatestFiniteMagnitude),
        options: [.usesLineFragmentOrigin, .usesFontLeading])
    return Size(width: ceil(rect.width), height: ceil(rect.height))
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

        // `card/50` — a native token carrying Tailwind's alpha suffix. The resolver
        // folds alpha into an 8-digit hex when it has one, but a *name* has no hex
        // to fold into, so it arrives intact and is folded here instead.
        if let slash = value.firstIndex(of: "/"),
            let percent = Double(value[value.index(after: slash)...])
        {
            let base = String(value[..<slash])
            let alpha = CGFloat(max(0, min(100, percent)) / 100)
            guard let color = named(base) else { return nil }
            return fade(color, to: alpha)
        }

        if let color = named(value) { return color }
        return hex(value)
    }

    /// Apply alpha *without* flattening a dynamic color.
    ///
    /// `NSColor.withAlphaComponent` on `.controlBackgroundColor` does not give you
    /// a translucent `controlBackgroundColor` — it resolves the color right there
    /// and hands back a plain static one. `bg-card/50` would then be stuck at
    /// whatever `card` meant at parse time, which is the exact bug the name was
    /// carried all this way to avoid.
    ///
    /// So the alpha is applied *inside* a dynamic provider, which re-runs per
    /// appearance, and `base` is resolved under the appearance being asked about.
    private static func fade(_ base: NSColor, to alpha: CGFloat) -> NSColor {
        let box = ColorBox(base)
        return NSColor(name: nil) { appearance in
            var concrete = box.color
            appearance.performAsCurrentDrawingAppearance {
                concrete = box.color.usingColorSpace(.sRGB) ?? box.color
            }
            return concrete.withAlphaComponent(alpha)
        }
    }

    /// `NSColor` isn't `Sendable`, and the dynamic provider is. The color is only
    /// ever read, and only from the appearance-resolution call.
    private final class ColorBox: @unchecked Sendable {
        let color: NSColor
        init(_ color: NSColor) { self.color = color }
    }

    /// The native semantic vocabulary. Every one of these is a *dynamic* color:
    /// it resolves differently per appearance, at draw time, which is the entire
    /// point of letting the name survive the trip from the plugin.
    private static func named(_ value: String) -> NSColor? {
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
        case "secondarylabel", "muted-foreground": return .secondaryLabelColor
        case "tertiarylabel", "tertiary": return .tertiaryLabelColor
        case "quaternarylabel": return .quaternaryLabelColor
        case "placeholder": return .placeholderTextColor
        case "windowbackground", "background": return .windowBackgroundColor
        case "controlbackground", "surface", "card": return .controlBackgroundColor
        // `muted` and `secondary` are shadcn *surfaces*, not text — the foreground
        // that goes on top of them is `muted-foreground`. Mapping them to a label
        // color (as this table used to) paints a background the color of text.
        case "underpagebackground", "surface-elevated", "muted", "secondary":
            return .underPageBackgroundColor
        case "separator", "border", "hairline": return .separatorColor
        case "grid": return .gridColor
        case "brand", "accent", "primary", "tint": return univiewBrandColor
        case "primary-foreground": return .white
        case "brand-violet": return univiewBrandViolet
        case "brand-cyan": return univiewBrandCyan
        case "control-accent": return .controlAccentColor
        case "selected-text-background": return .selectedTextBackgroundColor
        default: return nil
        }
    }

    /// `#rgb` / `#rrggbb` / `#rrggbbaa`. A literal — the same color in every
    /// appearance, which is exactly what `bg-emerald-500` should mean.
    private static func hex(_ value: String) -> NSColor? {
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
