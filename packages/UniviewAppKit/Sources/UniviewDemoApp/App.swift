import AppKit
import UniviewAppKit
import UniviewNativeCore
import UniviewYoga

/// Owns the Uniview host and keeps its layout in sync with the window size.
@MainActor
final class DemoController: NSObject, NSWindowDelegate {
    let host: UniviewHost
    let container: FlippedView

    override init() {
        container = FlippedView(frame: NSRect(x: 0, y: 0, width: 860, height: 540))
        container.autoresizingMask = [.width, .height]
        host = UniviewHost(
            layoutEngine: YogaLayoutEngine(),
            containerSize: Size(width: 860, height: 540),
            executeHandler: { id, args in
                print("[uniview] handler \(id) args=\(args)")
            })
        super.init()
        host.apply(CommitBatch(revision: 0, mutations: [.setRoot(node: demoTree())]))
        if let root = host.rootView { container.addSubview(root) }
    }

    func windowDidResize(_ notification: Notification) {
        host.setContainerSize(
            Size(width: Double(container.bounds.width), height: Double(container.bounds.height)))
    }
}

@main
enum DemoApp {
    @MainActor
    static func main() {
        let app = NSApplication.shared
        app.setActivationPolicy(.regular)

        let controller = DemoController()

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 860, height: 540),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false)
        window.title = "Uniview Desktop"
        window.contentView = controller.container
        window.delegate = controller
        window.center()
        window.makeKeyAndOrderFront(nil)

        app.activate(ignoringOtherApps: true)
        app.run()
    }
}
