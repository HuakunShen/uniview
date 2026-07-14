import AppKit
import UniviewNativeCore

/// A window whose traffic lights can be nudged down and right, so an inset /
/// floating sidebar can wrap them with padding. AppKit re-lays the standard
/// buttons on every layout pass, so we reposition after each one, computing an
/// absolute origin from the button container rather than an offset (no drift).
open class UniviewWindow: NSWindow {
    /// The first light's position from the window's top-left; `nil` keeps the OS
    /// default corner. Lights are spaced `buttonSpacing` apart.
    public var trafficLightOrigin: CGPoint? {
        didSet { repositionTrafficLights() }
    }
    public var buttonSpacing: CGFloat = 20

    open override func layoutIfNeeded() {
        super.layoutIfNeeded()
        repositionTrafficLights()
    }

    open override func makeKeyAndOrderFront(_ sender: Any?) {
        super.makeKeyAndOrderFront(sender)
        repositionTrafficLights()
        // The layout hook alone doesn't fire in time on first show.
        DispatchQueue.main.async { [weak self] in self?.repositionTrafficLights() }
    }

    private static let lightTypes: [NSWindow.ButtonType] = [
        .closeButton, .miniaturizeButton, .zoomButton,
    ]
    /// Where AppKit puts the lights when left alone. Captured before we first
    /// move them, because nothing else can put them back: AppKit only re-lays
    /// them on its own layout pass, so a light we moved stays moved until we
    /// return it ourselves.
    private var defaultOrigins: [NSWindow.ButtonType: NSPoint] = [:]

    private func repositionTrafficLights() {
        captureDefaultOrigins()

        guard let origin = trafficLightOrigin else {
            for type in Self.lightTypes {
                if let button = standardWindowButton(type), let home = defaultOrigins[type] {
                    button.setFrameOrigin(home)
                }
            }
            return
        }

        for (index, type) in Self.lightTypes.enumerated() {
            guard let button = standardWindowButton(type), let container = button.superview
            else { continue }
            // The container's top edge is the window's top; place the button
            // `origin.y` points below it (container coords are bottom-up).
            let x = origin.x + CGFloat(index) * buttonSpacing
            let y = container.bounds.height - origin.y - button.frame.height
            button.setFrameOrigin(NSPoint(x: x, y: y))
        }
    }

    private func captureDefaultOrigins() {
        guard defaultOrigins.isEmpty else { return }
        for type in Self.lightTypes {
            guard let button = standardWindowButton(type), button.frame.width > 0 else { return }
            defaultOrigins[type] = button.frame.origin
        }
    }
}

/// The window's chrome, written in React.
///
/// ```tsx
/// <Window
///   title="Uniview"
///   titleBarStyle="hiddenInset"
///   vibrancy="under-window"
///   trafficLightPosition={{ x: 22, y: 22 }}
///   transparent
/// />
/// ```
///
/// A `<Window>` does not *create* a window — the app already has one before the
/// plugin ever connects. It configures it, the way React Native's `<StatusBar>`
/// configures a bar it doesn't own: a component that renders nothing, and whose
/// props are applied to something already on screen. So it is a surface, not a
/// view: no box, no frame, no place in the layout.
///
/// The property names follow Electron's `BrowserWindow` (and, where they differ,
/// Tauri's), because that is the vocabulary desktop authors already have. The
/// full `vibrancy` set is the non-deprecated `NSVisualEffectView.Material` list —
/// the same fourteen both of them expose.
///
/// Whatever the plugin doesn't set is left alone, and everything it *did* set is
/// restored when the `<Window>` goes away — a plugin that renames the window
/// shouldn't permanently rename the application.
@MainActor
public final class WindowSurface: NativeSurface {
    /// Resolved late: the surface is registered while the view controller is
    /// still being built, and a view has no window until it's on screen.
    private let resolve: () -> NSWindow?
    private var restore: [(NSWindow) -> Void] = []
    /// The window-wide vibrancy layer. If the host already puts an
    /// `NSVisualEffectView` at the back of its content view — its own window
    /// backdrop — the plugin drives *that* one instead of stacking a second,
    /// invisible layer underneath it. The host says where the backdrop is; the
    /// plugin says what it's made of.
    private var vibrancyView: NSVisualEffectView?
    private var ownsVibrancyView = false
    private var originalVibrancy:
        (NSVisualEffectView.Material, NSVisualEffectView.BlendingMode, NSVisualEffectView.State)?

    public init(window resolve: @escaping () -> NSWindow?) {
        self.resolve = resolve
    }

    public func apply(_ node: ShadowNode, context: MountContext) {
        guard let window = resolve() else { return }
        let props = node.props

        // Snapshot once, on the first apply, so teardown restores what the *app*
        // configured — not whatever an earlier render of the plugin left behind.
        if restore.isEmpty { snapshot(window) }

        applyIdentity(props, to: window)
        applyChrome(props, to: window)
        applyAppearance(props, to: window)
        applyBehavior(props, to: window)
        applyGeometry(props, to: window)
        applyVibrancy(props, to: window)
    }

    public func teardown() {
        releaseVibrancy()
        guard let window = resolve() else { return }
        for undo in restore { undo(window) }
        restore.removeAll()
    }

    // MARK: - Identity

    private func applyIdentity(_ props: [String: JSONValue], to window: NSWindow) {
        if let title = props["title"]?.stringValue { window.title = title }
        if let edited = props["documentEdited"]?.boolValue { window.isDocumentEdited = edited }
    }

    // MARK: - Chrome

    private func applyChrome(_ props: [String: JSONValue], to window: NSWindow) {
        // `frame: false` — no titlebar, no lights, no rounded corners from AppKit.
        // Tauri spells this `decorations: false`.
        if let framed = props["frame"]?.boolValue ?? props["decorations"]?.boolValue {
            setStyleMask(.titled, framed, on: window)
        }

        if let style = props["titleBarStyle"]?.stringValue {
            switch style {
            case "hidden", "hiddenInset", "hidden-inset":
                // Content runs the full height of the window; the titlebar is a
                // transparent overlay and the lights float on top of the UI.
                window.styleMask.insert(.fullSizeContentView)
                window.titlebarAppearsTransparent = true
                window.titleVisibility = .hidden
                window.titlebarSeparatorStyle = .none
                // Electron's `hiddenInset` inset the lights; ours does too, unless
                // the plugin states its own position.
                if style != "hidden", let window = window as? UniviewWindow,
                    props["trafficLightPosition"] == nil
                {
                    window.trafficLightOrigin = CGPoint(x: 20, y: 20)
                }
            default:
                window.styleMask.remove(.fullSizeContentView)
                window.titlebarAppearsTransparent = false
                window.titleVisibility = .visible
                window.titlebarSeparatorStyle = .automatic
            }
        }

        if let visible = props["titleVisible"]?.boolValue {
            window.titleVisibility = visible ? .visible : .hidden
        }

        // Show/hide the traffic lights as a set (Electron's
        // `setWindowButtonVisibility`) or one at a time.
        let all = props["windowButtonsVisible"]?.boolValue
        let buttons = props["windowButtons"]?.objectValue
        setButton(.closeButton, buttons?["close"]?.boolValue ?? all, on: window)
        setButton(.miniaturizeButton, buttons?["minimize"]?.boolValue ?? all, on: window)
        setButton(.zoomButton, buttons?["maximize"]?.boolValue ?? all, on: window)

        if let window = window as? UniviewWindow, let position = props["trafficLightPosition"] {
            window.trafficLightOrigin = Self.point(position)
        }
    }

    // MARK: - Appearance

    private func applyAppearance(_ props: [String: JSONValue], to window: NSWindow) {
        // A transparent window lets a behind-window material blur the desktop
        // through the whole app (the Music/Finder look). An opaque one can't.
        if let transparent = props["transparent"]?.boolValue
            ?? props["transparentBackground"]?.boolValue
        {
            window.isOpaque = !transparent
            window.backgroundColor = transparent ? .clear : .windowBackgroundColor
        }
        if let color = props["backgroundColor"]?.stringValue.flatMap(CSSColor.parse) {
            window.backgroundColor = color
            window.isOpaque = color.alphaComponent >= 1
        }

        if let shadow = props["hasShadow"]?.boolValue { window.hasShadow = shadow }
        if let opacity = props["opacity"]?.numberValue { window.alphaValue = CGFloat(opacity) }

        // Force light or dark regardless of the system setting — the one thing a
        // CSS `prefers-color-scheme` can never do to a native window.
        if let appearance = props["appearance"]?.stringValue {
            switch appearance {
            case "light": window.appearance = NSAppearance(named: .aqua)
            case "dark": window.appearance = NSAppearance(named: .darkAqua)
            default: window.appearance = nil  // follow the system
            }
        }
    }

    /// A full-window `NSVisualEffectView` behind the content — the same thing
    /// Electron's `setVibrancy` and Tauri's `set_effects` install. Passing no
    /// `vibrancy` puts it back the way the host had it.
    private func applyVibrancy(_ props: [String: JSONValue], to window: NSWindow) {
        guard let contentView = window.contentView else { return }

        guard let material = props["vibrancy"]?.stringValue, !material.isEmpty else {
            releaseVibrancy()
            return
        }

        if vibrancyView == nil {
            if let backdrop = contentView.subviews.first as? NSVisualEffectView {
                // The host already has a window backdrop — drive it, don't bury a
                // second effect view beneath something opaque and wonder why
                // nothing changed on screen.
                vibrancyView = backdrop
                ownsVibrancyView = false
                originalVibrancy = (backdrop.material, backdrop.blendingMode, backdrop.state)
            } else {
                let effect = MaterialView()
                effect.autoresizingMask = [.width, .height]
                effect.frame = contentView.bounds
                contentView.addSubview(effect, positioned: .below, relativeTo: nil)
                vibrancyView = effect
                ownsVibrancyView = true
            }
        }

        guard let effect = vibrancyView else { return }
        effect.material = UniviewMaterial.material(material)
        effect.blendingMode = UniviewMaterial.blendingMode(material)
        effect.state = UniviewMaterial.state(props["visualEffectState"]?.stringValue)
    }

    private func releaseVibrancy() {
        guard let effect = vibrancyView else { return }
        if ownsVibrancyView {
            effect.removeFromSuperview()
        } else if let (material, blending, state) = originalVibrancy {
            effect.material = material
            effect.blendingMode = blending
            effect.state = state
        }
        vibrancyView = nil
        ownsVibrancyView = false
        originalVibrancy = nil
    }

    // MARK: - Behavior

    private func applyBehavior(_ props: [String: JSONValue], to window: NSWindow) {
        setStyleMask(.resizable, props["resizable"]?.boolValue, on: window)
        setStyleMask(.closable, props["closable"]?.boolValue, on: window)
        setStyleMask(.miniaturizable, props["minimizable"]?.boolValue, on: window)

        if let movable = props["movable"]?.boolValue { window.isMovable = movable }
        if let byBackground = props["movableByWindowBackground"]?.boolValue {
            window.isMovableByWindowBackground = byBackground
        }

        // `level` is the precise control; `alwaysOnTop` is the familiar shorthand.
        if let onTop = props["alwaysOnTop"]?.boolValue {
            window.level = onTop ? .floating : .normal
        }
        if let level = props["level"]?.stringValue {
            window.level = Self.level(level)
        }

        if let fullscreenable = props["fullscreenable"]?.boolValue {
            setCollection(.fullScreenPrimary, fullscreenable, on: window)
            setCollection(.fullScreenNone, !fullscreenable, on: window)
        }
        if let everywhere = props["visibleOnAllWorkspaces"]?.boolValue {
            setCollection(.canJoinAllSpaces, everywhere, on: window)
        }
        if let hidden = props["hiddenInMissionControl"]?.boolValue {
            setCollection(.transient, hidden, on: window)
        }
    }

    // MARK: - Geometry

    private func applyGeometry(_ props: [String: JSONValue], to window: NSWindow) {
        let minWidth = props["minWidth"]?.numberValue
        let minHeight = props["minHeight"]?.numberValue
        if minWidth != nil || minHeight != nil {
            window.minSize = NSSize(
                width: minWidth ?? Double(window.minSize.width),
                height: minHeight ?? Double(window.minSize.height))
        }

        let maxWidth = props["maxWidth"]?.numberValue
        let maxHeight = props["maxHeight"]?.numberValue
        if maxWidth != nil || maxHeight != nil {
            window.maxSize = NSSize(
                width: maxWidth ?? Double(window.maxSize.width),
                height: maxHeight ?? Double(window.maxSize.height))
        }
    }

    // MARK: - Helpers

    private func setStyleMask(
        _ flag: NSWindow.StyleMask, _ wanted: Bool?, on window: NSWindow
    ) {
        guard let wanted else { return }
        if wanted { window.styleMask.insert(flag) } else { window.styleMask.remove(flag) }
    }

    private func setCollection(
        _ flag: NSWindow.CollectionBehavior, _ wanted: Bool, on window: NSWindow
    ) {
        if wanted {
            window.collectionBehavior.insert(flag)
        } else {
            window.collectionBehavior.remove(flag)
        }
    }

    private func setButton(_ type: NSWindow.ButtonType, _ visible: Bool?, on window: NSWindow) {
        guard let visible else { return }
        window.standardWindowButton(type)?.isHidden = !visible
    }

    static func level(_ token: String) -> NSWindow.Level {
        switch token {
        case "floating": return .floating
        case "modal-panel", "modalPanel": return .modalPanel
        case "main-menu", "mainMenu": return .mainMenu
        case "status": return .statusBar
        case "pop-up-menu", "popUpMenu": return .popUpMenu
        case "screen-saver", "screenSaver": return .screenSaver
        default: return .normal
        }
    }

    /// `{ x, y }` → a point. Absent (or not an object) means "OS default corner".
    static func point(_ value: JSONValue?) -> CGPoint? {
        guard let object = value?.objectValue,
            let x = object["x"]?.numberValue,
            let y = object["y"]?.numberValue
        else { return nil }
        return CGPoint(x: x, y: y)
    }

    private func snapshot(_ window: NSWindow) {
        let title = window.title
        let edited = window.isDocumentEdited
        let styleMask = window.styleMask
        let transparentTitlebar = window.titlebarAppearsTransparent
        let titleVisibility = window.titleVisibility
        let separator = window.titlebarSeparatorStyle
        let opaque = window.isOpaque
        let background = window.backgroundColor
        let hasShadow = window.hasShadow
        let alpha = window.alphaValue
        let appearance = window.appearance
        let level = window.level
        let movable = window.isMovable
        let movableByBackground = window.isMovableByWindowBackground
        let collection = window.collectionBehavior
        let minSize = window.minSize
        let maxSize = window.maxSize
        let trafficLights = (window as? UniviewWindow)?.trafficLightOrigin
        let types: [NSWindow.ButtonType] = [.closeButton, .miniaturizeButton, .zoomButton]
        let hiddenButtons = types.map { window.standardWindowButton($0)?.isHidden ?? false }

        restore.append { window in
            window.title = title
            window.isDocumentEdited = edited
            window.styleMask = styleMask
            window.titlebarAppearsTransparent = transparentTitlebar
            window.titleVisibility = titleVisibility
            window.titlebarSeparatorStyle = separator
            window.isOpaque = opaque
            window.backgroundColor = background
            window.hasShadow = hasShadow
            window.alphaValue = alpha
            window.appearance = appearance
            window.level = level
            window.isMovable = movable
            window.isMovableByWindowBackground = movableByBackground
            window.collectionBehavior = collection
            window.minSize = minSize
            window.maxSize = maxSize
            (window as? UniviewWindow)?.trafficLightOrigin = trafficLights
            for (index, type) in types.enumerated() {
                window.standardWindowButton(type)?.isHidden = hiddenButtons[index]
            }
        }
    }
}
