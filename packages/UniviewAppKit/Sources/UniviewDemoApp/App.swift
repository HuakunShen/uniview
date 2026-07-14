import AppKit

/// Uniview Desktop — a thin native shell (transparent-titlebar, full-size
/// content, Liquid Glass sidebar) hosting Uniview-rendered content. Programmatic
/// AppKit only; no storyboard, no SwiftUI. Framework logic lives in the
/// packages, not here.
@main
enum DemoApp {
    @MainActor
    static func main() {
        let app = NSApplication.shared
        app.setActivationPolicy(.regular)

        let split = MainSplitViewController(sections: demoSections())

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 980, height: 640),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false)
        window.title = "Uniview Desktop"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.toolbarStyle = .unified
        // Clear/non-opaque so the behind-window frost blurs the desktop through
        // the UI (Music/Finder-style ambience).
        window.isOpaque = false
        window.backgroundColor = .clear
        window.minSize = NSSize(width: 840, height: 540)
        window.contentViewController = split
        window.setFrameAutosaveName("UniviewDesktopMain")
        window.center()
        window.makeKeyAndOrderFront(nil)

        app.activate(ignoringOtherApps: true)
        app.run()
    }
}
