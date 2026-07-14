import AppKit
import UniviewNativeCore

/// A view that re-paints itself whenever the *conditions* it is styled on change.
///
/// Two separate reasons this has to exist, and they turn out to be the same one.
///
/// `NSColor` is dynamic; `CGColor` is a **snapshot**. Writing
/// `layer.backgroundColor = color.cgColor` freezes the color at whatever
/// appearance happened to be current, and it never moves again — not when the
/// system flips to dark, and not when the view lands in a window carrying
/// `<Window appearance="light">`. A semantic token would arrive perfectly intact
/// and still paint the wrong thing.
///
/// And `dark:` / `hover:` / `active:` are conditions the *host* owns. The plugin
/// cannot know them: one window can be light while the system is dark, and
/// streaming every mouse-enter over RPC to re-render a React tree is absurd. So
/// both styles travel together in the IR and the view decides — here.
///
/// Which means the paint step is *stored*, not merely performed, and re-run
/// whenever the state changes, with this view's own appearance made current
/// (that is precisely what `.cgColor` reads to decide what it means).
@MainActor
public protocol StyleStateView: NSView {
    /// How this view paints its layer, given the conditions that currently hold.
    var repaint: ((CALayer, Set<String>) -> Void)? { get set }
    var isHovered: Bool { get set }
    var isPressed: Bool { get set }
}

extension StyleStateView {
    /// The conditions that hold right now — the keys `StyleIR.variants` is keyed by.
    public var styleState: Set<String> {
        var state: Set<String> = []
        let dark = effectiveAppearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
        state.insert(dark ? "dark" : "light")
        if isHovered { state.insert("hover") }
        if isPressed { state.insert("active") }
        if let responder = window?.firstResponder as? NSView, responder === self {
            state.insert("focus")
        }
        return state
    }

    /// Record how to paint, and paint now.
    public func setRepaint(_ paint: @escaping (CALayer, Set<String>) -> Void) {
        repaint = paint
        repaintNow()
    }

    public func repaintNow() {
        guard let layer, let repaint else { return }
        let state = styleState
        effectiveAppearance.performAsCurrentDrawingAppearance { repaint(layer, state) }
    }
}

/// A top-down `NSView` (origin at top-left) matching Yoga's coordinate space,
/// so computed frames map straight onto subview frames.
public class FlippedView: NSView, StyleStateView {
    public var repaint: ((CALayer, Set<String>) -> Void)?
    public override var isFlipped: Bool { true }

    public var isHovered = false {
        didSet { if isHovered != oldValue { repaintNow() } }
    }
    public var isPressed = false {
        didSet { if isPressed != oldValue { repaintNow() } }
    }

    /// A tracking area is not free, and most views never hover. Only the ones
    /// whose style actually mentions `hover:` / `active:` pay for one.
    public var tracksPointer = false {
        didSet {
            guard tracksPointer != oldValue else { return }
            if !tracksPointer { isHovered = false; isPressed = false }
            updateTrackingAreas()
        }
    }
    private var pointerArea: NSTrackingArea?

    public override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let pointerArea { removeTrackingArea(pointerArea) }
        pointerArea = nil
        guard tracksPointer else { return }
        let area = NSTrackingArea(
            rect: bounds,
            options: [.mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect],
            owner: self)
        addTrackingArea(area)
        pointerArea = area
    }

    public override func mouseEntered(with event: NSEvent) { isHovered = true }
    public override func mouseExited(with event: NSEvent) {
        isHovered = false
        isPressed = false
    }
    public override func mouseDown(with event: NSEvent) {
        if tracksPointer { isPressed = true } else { super.mouseDown(with: event) }
    }
    public override func mouseUp(with event: NSEvent) {
        if tracksPointer { isPressed = false } else { super.mouseUp(with: event) }
    }

    public override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance()
        repaintNow()
    }
}

/// A flipped `NSVisualEffectView` for native vibrancy/materials on a Uniview
/// container (top-down coords like `FlippedView`).
public final class MaterialView: NSVisualEffectView, StyleStateView {
    public var repaint: ((CALayer, Set<String>) -> Void)?
    public var isHovered = false {
        didSet { if isHovered != oldValue { repaintNow() } }
    }
    public var isPressed = false {
        didSet { if isPressed != oldValue { repaintNow() } }
    }
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
        layer?.insertSublayer(gradient, at: 0)
    }

    public required init?(coder: NSCoder) { fatalError() }

    /// The direction comes from the IR. This used to be fixed at top-leading →
    /// bottom-trailing, which was only ever "correct" because the sole gradient
    /// the host drew was one it had hardcoded itself.
    public func setGradient(colors: [CGColor], direction: GradientDirection) {
        gradient.colors = colors.isEmpty ? nil : colors
        let (start, end) = direction.unit
        gradient.startPoint = CGPoint(x: start.x, y: start.y)
        gradient.endPoint = CGPoint(x: end.x, y: end.y)
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

// No brand colors live here, and none ever should. A renderer that knows what
// "the accent" looks like has a design system baked into it, can host exactly one
// product, and will have that product copy-pasted into every platform it is
// ported to. `accent` below resolves to the color the *user* chose in System
// Settings — which is both the agnostic answer and the native one.

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
        // The user's own accent color, from System Settings. A plugin that wants
        // *its* blue says so with a palette color or an arbitrary value; `accent`
        // means "whatever this machine calls accent".
        case "accent", "primary", "tint", "control-accent": return .controlAccentColor
        case "primary-foreground": return .white
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

/// Maps the Style IR text alignment to AppKit's.
func nsTextAlignment(_ align: TextAlign?) -> NSTextAlignment {
    switch align {
    case .center: return .center
    case .right: return .right
    case .left, .none: return .left
    }
}

/// The view an `overflow-scroll` box becomes.
///
/// A scroll view is not a styled box with a scrollbar bolted on: it has a *clip*
/// view and a *document* view, and the children belong to the document. So the
/// mounter is told to put them there (`Component.contentView(of:)`), and the
/// document is resized once layout knows how big the content actually got
/// (`Component.didApplyLayout`) — nothing earlier in the pipeline knows that.
public final class ScrollView: NSScrollView, StyleStateView {
    public var repaint: ((CALayer, Set<String>) -> Void)?
    public var isHovered = false {
        didSet { if isHovered != oldValue { repaintNow() } }
    }
    public var isPressed = false {
        didSet { if isPressed != oldValue { repaintNow() } }
    }

    /// Top-left origin, like every other box in the tree — otherwise the content
    /// would start at the bottom and scroll the wrong way.
    public let content = FlippedView()

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        // The box's own background is painted by the Style IR on our layer; a
        // scroll view that draws its own would sit on top of it.
        drawsBackground = false
        hasVerticalScroller = true
        hasHorizontalScroller = true
        autohidesScrollers = true
        scrollerStyle = .overlay
        contentView.drawsBackground = false
        documentView = content

        // Scrolling drags views under a stationary cursor, and AppKit does not
        // keep enter/exit balanced through that: the row that arrives gets a
        // `mouseEntered`, the row that left gets no `mouseExited`, and the hover
        // highlight is stuck on two rows at once. So don't trust the events —
        // recompute from where the pointer actually is.
        contentView.postsBoundsChangedNotifications = true
        NotificationCenter.default.addObserver(
            self, selector: #selector(contentScrolled),
            name: NSView.boundsDidChangeNotification, object: contentView)
    }

    deinit { NotificationCenter.default.removeObserver(self) }

    @objc private func contentScrolled() {
        MainActor.assumeIsolated { refreshHover() }
    }

    /// Re-derive `isHovered` for every pointer-tracking descendant from the actual
    /// cursor position. A row scrolled out of the clip view is not hovered even if
    /// the cursor is over where it used to be, hence the `visibleRect` test.
    private func refreshHover() {
        guard let window else { return }
        let pointer = window.mouseLocationOutsideOfEventStream

        func walk(_ view: NSView) {
            if let flipped = view as? FlippedView, flipped.tracksPointer {
                let local = flipped.convert(pointer, from: nil)
                flipped.isHovered =
                    flipped.bounds.contains(local) && flipped.visibleRect.contains(local)
            }
            view.subviews.forEach(walk)
        }
        walk(content)
    }

    public required init?(coder: NSCoder) { fatalError() }

    public override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance()
        repaintNow()
    }

    /// Size the document to the content. The document must never be *smaller*
    /// than the clip view, or a short list would sit in a box it doesn't fill and
    /// the background would stop halfway down.
    public func sizeDocument(to size: NSSize) {
        let visible = contentView.bounds.size
        content.frame = NSRect(
            x: 0, y: 0,
            width: max(size.width, visible.width),
            height: max(size.height, visible.height))
    }
}
