import AppKit

final class ShortcutWindow: NSWindow {
    var shortcutHandler: ((String) -> Bool)?

    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        if let shortcut = CommandSearchField.normalizedShortcut(for: event),
           shortcutHandler?(shortcut) == true {
            return true
        }

        return super.performKeyEquivalent(with: event)
    }
}

class MainWindowController: NSWindowController {
    convenience init() {
        let viewController = MainViewController()
        let window = ShortcutWindow(
            contentRect: NSRect(x: 0, y: 0, width: 980, height: 600),
            styleMask: [.titled, .closable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Uniview"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isMovableByWindowBackground = true
        window.level = .floating
        window.sharingType = .readOnly
        window.contentViewController = viewController
        window.minSize = NSSize(width: 820, height: 460)

        // Clear any cached frame from previous autosave names, then set fresh size
        UserDefaults.standard.removeObject(forKey: "NSWindow Frame MainWindow")
        UserDefaults.standard.removeObject(forKey: "NSWindow Frame MainWindow2")
        window.setFrame(NSRect(x: 0, y: 0, width: 980, height: 600), display: false)
        window.center()
        self.init(window: window)
    }
}
