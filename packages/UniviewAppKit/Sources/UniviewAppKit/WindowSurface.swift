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
/// <Window title="Uniview" titlebar="transparent" trafficLights={{ x: 22, y: 22 }} />
/// ```
///
/// A `<Window>` does not *create* a window — the app already has one before the
/// plugin ever connects. It configures it, the way React Native's `<StatusBar>`
/// configures a bar it doesn't own: a component that renders nothing, and whose
/// props are applied to something already on screen. So it is a surface, not a
/// view: no box, no frame, no place in the layout.
///
/// Whatever the plugin doesn't set is left alone, and everything it *did* set is
/// restored when the `<Window>` goes away — a plugin that changes the title
/// shouldn't permanently rename the application.
@MainActor
public final class WindowSurface: NativeSurface {
    /// Resolved late: the surface is registered while the view controller is
    /// still being built, and a view has no window until it's on screen.
    private let resolve: () -> NSWindow?
    private var restore: [(NSWindow) -> Void] = []

    public init(window resolve: @escaping () -> NSWindow?) {
        self.resolve = resolve
    }

    public func apply(_ node: ShadowNode, context: MountContext) {
        guard let window = resolve() else { return }
        let props = node.props

        // Snapshot once, on the first apply, so teardown restores what the *app*
        // configured — not whatever an earlier render of the plugin left behind.
        if restore.isEmpty { snapshot(window) }

        if let title = props["title"]?.stringValue {
            window.title = title
        }

        if let titlebar = props["titlebar"]?.stringValue {
            switch titlebar {
            case "transparent":
                // Content runs under the titlebar; the app draws its own ambience.
                window.styleMask.insert(.fullSizeContentView)
                window.titlebarAppearsTransparent = true
                window.titleVisibility = .hidden
                window.titlebarSeparatorStyle = .none
            case "hidden":
                window.styleMask.insert(.fullSizeContentView)
                window.titlebarAppearsTransparent = true
                window.titleVisibility = .hidden
                window.titlebarSeparatorStyle = .none
                window.standardWindowButton(.closeButton)?.isHidden = true
                window.standardWindowButton(.miniaturizeButton)?.isHidden = true
                window.standardWindowButton(.zoomButton)?.isHidden = true
            default:
                window.styleMask.remove(.fullSizeContentView)
                window.titlebarAppearsTransparent = false
                window.titleVisibility = .visible
            }
        }

        // A transparent background lets a behind-window material blur the desktop
        // through the whole app (the Music/Finder look). An opaque one doesn't.
        if let transparent = props["transparentBackground"]?.boolValue {
            window.isOpaque = !transparent
            window.backgroundColor = transparent ? .clear : .windowBackgroundColor
        }

        setStyleMask(.resizable, props["resizable"]?.boolValue, on: window)
        setStyleMask(.closable, props["closable"]?.boolValue, on: window)
        setStyleMask(.miniaturizable, props["minimizable"]?.boolValue, on: window)

        let minWidth = props["minWidth"]?.numberValue
        let minHeight = props["minHeight"]?.numberValue
        if minWidth != nil || minHeight != nil {
            window.minSize = NSSize(
                width: minWidth ?? Double(window.minSize.width),
                height: minHeight ?? Double(window.minSize.height))
        }

        if let window = window as? UniviewWindow {
            window.trafficLightOrigin = Self.point(props["trafficLights"])
        }
    }

    public func teardown() {
        guard let window = resolve() else { return }
        for undo in restore { undo(window) }
        restore.removeAll()
    }

    private func setStyleMask(
        _ flag: NSWindow.StyleMask, _ wanted: Bool?, on window: NSWindow
    ) {
        guard let wanted else { return }
        if wanted {
            window.styleMask.insert(flag)
        } else {
            window.styleMask.remove(flag)
        }
    }

    private func snapshot(_ window: NSWindow) {
        let title = window.title
        let styleMask = window.styleMask
        let transparentTitlebar = window.titlebarAppearsTransparent
        let titleVisibility = window.titleVisibility
        let separator = window.titlebarSeparatorStyle
        let opaque = window.isOpaque
        let background = window.backgroundColor
        let minSize = window.minSize
        let trafficLights = (window as? UniviewWindow)?.trafficLightOrigin
        let hiddenButtons = [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton]
            .map { window.standardWindowButton($0)?.isHidden ?? false }

        restore.append { window in
            window.title = title
            window.styleMask = styleMask
            window.titlebarAppearsTransparent = transparentTitlebar
            window.titleVisibility = titleVisibility
            window.titlebarSeparatorStyle = separator
            window.isOpaque = opaque
            window.backgroundColor = background
            window.minSize = minSize
            (window as? UniviewWindow)?.trafficLightOrigin = trafficLights
            for (index, type) in [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton]
                .enumerated()
            {
                window.standardWindowButton(type)?.isHidden = hiddenButtons[index]
            }
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
}
