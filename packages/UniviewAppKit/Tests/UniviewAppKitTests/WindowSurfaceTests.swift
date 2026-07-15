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
                            "titleBarStyle": .string("hidden"),
                            "minWidth": .number(880),
                            "trafficLightPosition": .object(["x": .number(22), "y": .number(22)]),
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
                            "titleBarStyle": .string("hidden"),
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
                            "trafficLightPosition": .object(["x": .number(10), "y": .number(10)])
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

    /// `hiddenInset` insets the lights; switching back to `default` (or `hidden`)
    /// without an explicit position must put them back. It didn't — the default
    /// branch never cleared the inset, so a window toggled hiddenInset → default
    /// kept its lights nudged. The demo's own Window menu can do exactly this.
    @Test func leavingHiddenInsetReturnsTheTrafficLightsToTheDefaultCorner() throws {
        let window = makeWindow()
        let host = self.host(window)
        window.orderFront(nil)
        let close = try #require(window.standardWindowButton(.closeButton))
        let home = close.frame.origin

        host.apply(
            CommitBatch(
                revision: 0,
                mutations: [.setRoot(node: tree(["titleBarStyle": .string("hiddenInset")]))]))
        #expect(window.trafficLightOrigin != nil)
        #expect(close.frame.origin != home)

        host.apply(
            CommitBatch(
                revision: 1,
                mutations: [.setRoot(node: tree(["titleBarStyle": .string("default")]))]))
        #expect(window.trafficLightOrigin == nil)
        #expect(close.frame.origin == home)
    }

    @Test func absentTrafficLightsMeanTheOSDefaultCorner() {
        #expect(WindowSurface.point(nil) == nil)
        #expect(WindowSurface.point(.null) == nil)
        #expect(
            WindowSurface.point(.object(["x": .number(3), "y": .number(4)]))
                == CGPoint(x: 3, y: 4))
    }

    /// The host says WHERE the window's backdrop is (the backmost effect view);
    /// the plugin says what it's MADE OF. Stacking a second effect view under an
    /// existing one would change nothing on screen and look like a dead prop.
    @Test func vibrancyDrivesTheHostsExistingBackdropRatherThanBuryingANewOne() throws {
        let window = makeWindow()
        let content = FlippedView(frame: NSRect(x: 0, y: 0, width: 400, height: 300))
        let backdrop = MaterialView()
        backdrop.material = .windowBackground
        content.addSubview(backdrop)
        window.contentView = content

        let host = self.host(window)
        host.apply(
            CommitBatch(
                revision: 0,
                mutations: [.setRoot(node: tree(["vibrancy": .string("hud")]))]))

        #expect(backdrop.material == .hudWindow)
        // No second effect view was added.
        #expect(content.subviews.compactMap { $0 as? NSVisualEffectView }.count == 1)

        // Unmounting restores the host's own material.
        host.apply(
            CommitBatch(
                revision: 1, mutations: [.setRoot(node: UINode(id: "root", type: "View"))]))
        #expect(backdrop.material == .windowBackground)
    }

    @Test func vibrancyInstallsABackdropWhenTheHostHasNone() throws {
        let window = makeWindow()
        let content = FlippedView(frame: NSRect(x: 0, y: 0, width: 400, height: 300))
        window.contentView = content

        let host = self.host(window)
        host.apply(
            CommitBatch(
                revision: 0,
                mutations: [.setRoot(node: tree(["vibrancy": .string("sidebar")]))]))

        let effect = try #require(content.subviews.first as? NSVisualEffectView)
        #expect(effect.material == .sidebar)

        // Ours to add, ours to remove.
        host.apply(
            CommitBatch(
                revision: 1, mutations: [.setRoot(node: UINode(id: "root", type: "View"))]))
        #expect(content.subviews.compactMap { $0 as? NSVisualEffectView }.isEmpty)
    }

    /// The full non-deprecated NSVisualEffectView set, under Electron's / Tauri's
    /// names — an author who knows either already knows these.
    @Test func everyVibrancyNameMapsToItsMaterial() {
        let expected: [(String, NSVisualEffectView.Material)] = [
            ("titlebar", .titlebar), ("selection", .selection), ("menu", .menu),
            ("popover", .popover), ("sidebar", .sidebar), ("header", .headerView),
            ("sheet", .sheet), ("window", .windowBackground), ("hud", .hudWindow),
            ("fullscreen-ui", .fullScreenUI), ("tooltip", .toolTip),
            ("content", .contentBackground), ("under-window", .underWindowBackground),
            ("under-page", .underPageBackground),
        ]
        for (name, material) in expected {
            #expect(UniviewMaterial.material(name) == material, "\(name)")
        }
    }

    @Test func appearanceForcesLightOrDarkRegardlessOfTheSystem() {
        let window = makeWindow()
        let host = self.host(window)

        host.apply(
            CommitBatch(
                revision: 0,
                mutations: [.setRoot(node: tree(["appearance": .string("dark")]))]))
        #expect(window.appearance?.name == .darkAqua)

        host.apply(
            CommitBatch(
                revision: 1,
                mutations: [.setRoot(node: tree(["appearance": .string("system")]))]))
        #expect(window.appearance == nil)  // follow the system again
    }

    @Test func frameFalseStripsTheTitlebarEntirely() {
        let window = makeWindow()
        let host = self.host(window)

        host.apply(
            CommitBatch(
                revision: 0, mutations: [.setRoot(node: tree(["frame": .bool(false)]))]))
        #expect(!window.styleMask.contains(.titled))
    }

    @Test func alwaysOnTopAndExplicitLevels() {
        let window = makeWindow()
        let host = self.host(window)

        host.apply(
            CommitBatch(
                revision: 0,
                mutations: [.setRoot(node: tree(["alwaysOnTop": .bool(true)]))]))
        #expect(window.level == .floating)

        host.apply(
            CommitBatch(
                revision: 1,
                mutations: [.setRoot(node: tree(["level": .string("screen-saver")]))]))
        #expect(window.level == .screenSaver)
    }

    @Test func windowButtonsCanBeHiddenIndividually() {
        let window = makeWindow()
        let host = self.host(window)

        host.apply(
            CommitBatch(
                revision: 0,
                mutations: [
                    .setRoot(
                        node: tree([
                            "windowButtons": .object([
                                "close": .bool(true),
                                "minimize": .bool(false),
                                "maximize": .bool(false),
                            ])
                        ]))
                ]))

        #expect(window.standardWindowButton(.closeButton)?.isHidden == false)
        #expect(window.standardWindowButton(.miniaturizeButton)?.isHidden == true)
        #expect(window.standardWindowButton(.zoomButton)?.isHidden == true)
    }
}
