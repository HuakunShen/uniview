import AppKit
import Testing

@testable import UniviewAppKit
@testable import UniviewNativeCore
@testable import UniviewYoga

/// `<Window>` configures a window the app already owns — it never creates one.
/// The property that matters most is that it puts everything back: a plugin that
/// renames the window must not permanently rename the application.
@MainActor
@Suite struct WindowSurfaceTests {

    private func makeWindow() -> UniviewWindow {
        let window = UniviewWindow(
            contentRect: NSRect(x: 0, y: 0, width: 400, height: 300),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: true)
        window.title = "App Title"
        window.minSize = NSSize(width: 200, height: 150)
        return window
    }

    private func host(_ window: NSWindow) -> UniviewHost {
        let registry = ComponentRegistry.standard()
        registry.registerSurface("Window", WindowSurface(window: { window }))
        return UniviewHost(
            registry: registry, layoutEngine: YogaLayoutEngine(),
            containerSize: Size(width: 400, height: 300), executeHandler: { _, _ in })
    }

    private func tree(_ windowProps: [String: JSONValue]) -> UINode {
        UINode(
            id: "root", type: "View",
            props: ["_style": .object(["flexDirection": .string("column")])],
            children: [
                UINode(id: "win", type: "Window", props: windowProps),
                UINode(
                    id: "body", type: "View",
                    props: ["_style": .object(["height": .number(40)])]),
            ])
    }

    @Test func configuresTheWindowAndOccupiesNoBox() throws {
        let window = makeWindow()
        let host = self.host(window)

        host.apply(
            CommitBatch(
                revision: 0,
                mutations: [
                    .setRoot(
                        node: tree([
                            "title": .string("Renamed by React"),
                            "titlebar": .string("transparent"),
                            "minWidth": .number(880),
                            "trafficLights": .object(["x": .number(22), "y": .number(22)]),
                        ]))
                ]))

        #expect(window.title == "Renamed by React")
        #expect(window.titlebarAppearsTransparent)
        #expect(window.styleMask.contains(.fullSizeContentView))
        #expect(window.minSize.width == 880)
        #expect(window.trafficLightOrigin == CGPoint(x: 22, y: 22))

        // A surface has no view and no geometry: `body` is still the first box.
        #expect(host.view(for: "win") == nil)
        let body = try #require(host.tree.node(id: "body"))
        #expect(body.layout.y == 0)
    }

    @Test func unmountingRestoresWhatTheAppConfigured() {
        let window = makeWindow()
        let host = self.host(window)

        host.apply(
            CommitBatch(
                revision: 0,
                mutations: [
                    .setRoot(
                        node: tree([
                            "title": .string("Renamed by React"),
                            "titlebar": .string("transparent"),
                            "minWidth": .number(880),
                            "resizable": .bool(false),
                        ]))
                ]))
        #expect(window.title == "Renamed by React")

        // The plugin stops rendering its <Window>.
        host.apply(
            CommitBatch(
                revision: 1,
                mutations: [.setRoot(node: UINode(id: "root", type: "View"))]))

        #expect(window.title == "App Title")
        #expect(!window.titlebarAppearsTransparent)
        #expect(window.minSize.width == 200)
        #expect(window.styleMask.contains(.resizable))
    }

    @Test func propsTheePluginDoesNotSetAreLeftAlone() {
        let window = makeWindow()
        window.title = "App Title"
        let host = self.host(window)

        // Only the traffic lights are set — the title must survive untouched.
        host.apply(
            CommitBatch(
                revision: 0,
                mutations: [
                    .setRoot(
                        node: tree([
                            "trafficLights": .object(["x": .number(10), "y": .number(10)])
                        ]))
                ]))

        #expect(window.title == "App Title")
        #expect(window.trafficLightOrigin == CGPoint(x: 10, y: 10))
    }

    /// Clearing the prop has to actually put the lights BACK. AppKit only re-lays
    /// them on its own layout pass, so a light we moved stays moved forever
    /// unless we return it — which is exactly what shipped broken: React's state
    /// flipped, and the buttons didn't budge.
    @Test func clearingTheTrafficLightPropReturnsThemToWhereAppKitPutThem() throws {
        let window = makeWindow()
        window.orderFront(nil)
        let close = try #require(window.standardWindowButton(.closeButton))
        let home = close.frame.origin

        window.trafficLightOrigin = CGPoint(x: 40, y: 40)
        #expect(close.frame.origin != home)

        window.trafficLightOrigin = nil
        #expect(close.frame.origin == home)
    }

    @Test func absentTrafficLightsMeanTheOSDefaultCorner() {
        #expect(WindowSurface.point(nil) == nil)
        #expect(WindowSurface.point(.null) == nil)
        #expect(
            WindowSurface.point(.object(["x": .number(3), "y": .number(4)]))
                == CGPoint(x: 3, y: 4))
    }
}
