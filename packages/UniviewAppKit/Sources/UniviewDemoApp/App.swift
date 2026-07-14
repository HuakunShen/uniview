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
            contentRect: NSRect(x: 0, y: 0, width: 1040, height: 720),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false)
        window.title = "Uniview Desktop"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        // No toolbar is attached, so the `.unified` toolbar style just drew an
        // empty light titlebar band above the sidebar. Dropping it (plus hiding
        // the separator) lets the split view's glass sidebar run to the very top
        // with the traffic lights inline — the Music/Finder look.
        window.titlebarSeparatorStyle = .none
        // Clear/non-opaque so the behind-window frost blurs the desktop through
        // the UI (Music/Finder-style ambience).
        window.isOpaque = false
        window.backgroundColor = .clear
        window.minSize = NSSize(width: 880, height: 600)
        window.contentViewController = split
        window.setFrameAutosaveName("UniviewDesktopMain")
        window.center()
        window.makeKeyAndOrderFront(nil)

        app.activate(ignoringOtherApps: true)
        app.run()
    }
}
