import AppKit
import UniviewAppKit

/// A window that can nudge its traffic-light buttons down + right, so an inset /
/// floating sidebar can wrap them with padding (the reference-app technique).
/// AppKit re-lays the standard buttons every layout pass, so we reposition after
/// each one, computing an absolute origin from the button container (no drift).
final class DesktopWindow: NSWindow {
    /// The first traffic light's position from the window's top-left; `nil` keeps
    /// the OS default corner. Buttons are spaced `buttonSpacing` apart.
    var trafficLightOrigin: CGPoint? {
        didSet { repositionTrafficLights() }
    }
    private let buttonSpacing: CGFloat = 20

    override func layoutIfNeeded() {
        super.layoutIfNeeded()
        repositionTrafficLights()
    }

    override func makeKeyAndOrderFront(_ sender: Any?) {
        super.makeKeyAndOrderFront(sender)
        repositionTrafficLights()
        DispatchQueue.main.async { [weak self] in self?.repositionTrafficLights() }
    }

    private func repositionTrafficLights() {
        guard let origin = trafficLightOrigin else { return }
        let types: [NSWindow.ButtonType] = [.closeButton, .miniaturizeButton, .zoomButton]
        for (index, type) in types.enumerated() {
            guard let button = standardWindowButton(type), let container = button.superview
            else { continue }
            // The container's top edge coincides with the window top; place the
            // button `origin.y` points below it (container coords are bottom-up).
            let x = origin.x + CGFloat(index) * buttonSpacing
            let y = container.bounds.height - origin.y - button.frame.height
            button.setFrameOrigin(NSPoint(x: x, y: y))
        }
    }
}

/// Quit when the window closes — a single-window app with no window left is a
/// Dock icon with nothing behind it.
final class DemoAppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }
}

/// Uniview Desktop — a thin native shell (transparent-titlebar, full-size
/// content) hosting Uniview-rendered content. Programmatic AppKit only; no
/// storyboard, no SwiftUI. Framework logic lives in the packages, not here.
@main
enum DemoApp {
    /// `NSApplication.delegate` is a weak reference — a local would be released
    /// the moment `main()` returned into the run loop.
    @MainActor private static let delegate = DemoAppDelegate()

    @MainActor
    static func main() {
        let app = NSApplication.shared
        app.setActivationPolicy(.regular)

        // Without this, ⌘C/⌘V/⌘Q and friends are dead: they're menu key
        // equivalents, not built-in AppKit behavior, and a programmatic app has
        // no MainMenu.xib to inherit them from.
        app.mainMenu = UniviewMainMenu.standard(appName: "Uniview Desktop")

        app.delegate = Self.delegate

        // Sidebar style is a setting, not a standard. `.floating` is an inset
        // glass box that wraps the (repositioned) traffic lights; `.fullHeight`
        // runs edge-to-edge with the lights at the default corner.
        let sidebarStyle = SidebarStyle.floating
        let root = RootViewController(sections: demoSections(), sidebarStyle: sidebarStyle)

        let window = DesktopWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1040, height: 720),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false)
        window.title = "Uniview Desktop"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.titlebarSeparatorStyle = .none
        // Clear/non-opaque so the behind-window frost blurs the desktop through
        // the UI (Music/Finder-style ambience).
        window.isOpaque = false
        window.backgroundColor = .clear
        window.minSize = NSSize(width: 880, height: 600)
        window.contentViewController = root
        window.setFrameAutosaveName("UniviewDesktopMain")
        window.center()
        window.trafficLightOrigin = sidebarStyle.trafficLightOrigin
        window.makeKeyAndOrderFront(nil)

        app.activate(ignoringOtherApps: true)
        app.run()
    }
}
