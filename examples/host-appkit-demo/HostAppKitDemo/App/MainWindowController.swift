import AppKit

class MainWindowController: NSWindowController {
    convenience init() {
        let viewController = MainViewController()
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 900, height: 700),
            styleMask: [.titled, .closable, .resizable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Uniview AppKit Host"
        window.contentViewController = viewController
        window.minSize = NSSize(width: 400, height: 300)

        // Clear any cached frame from previous autosave names, then set fresh size
        UserDefaults.standard.removeObject(forKey: "NSWindow Frame MainWindow")
        UserDefaults.standard.removeObject(forKey: "NSWindow Frame MainWindow2")
        window.setFrame(NSRect(x: 0, y: 0, width: 900, height: 700), display: false)
        window.center()
        self.init(window: window)
    }
}
