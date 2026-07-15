import AppKit
import Testing

@testable import UniviewAppKit
@testable import UniviewNativeCore

/// The plugin is told about the machine so it can *decide* things — which chart
/// palette, which illustration. It is not how `bg-card` becomes the right color;
/// that happens natively, per view (see `DynamicColorTests`).
@MainActor
@Suite struct HostEnvironmentTests {

    /// Read from the VIEW, not from `NSApp`. A window carrying
    /// `<Window appearance="light">` is light even on a dark system, and a plugin
    /// that was told "dark" would pick a dark palette for a light window.
    @Test func theColorSchemeFollowsTheViewNotTheSystem() {
        let view = AppearanceReportingView()

        view.appearance = NSAppearance(named: .darkAqua)
        #expect(HostEnvironment.current(for: view).colorScheme == "dark")

        view.appearance = NSAppearance(named: .aqua)
        #expect(HostEnvironment.current(for: view).colorScheme == "light")
    }

    @Test func theAccentColorIsResolvedToAHexThePluginCanUse() {
        let view = AppearanceReportingView()
        view.appearance = NSAppearance(named: .aqua)
        let accent = HostEnvironment.current(for: view).accentColor
        #expect(accent.hasPrefix("#"))
        #expect(accent.count == 7)
    }

    @Test func itSerializesTheWholeEnvironmentForTheWire() throws {
        let view = AppearanceReportingView()
        view.appearance = NSAppearance(named: .darkAqua)

        let json = HostEnvironment.current(for: view).json
        let object = try #require(json.objectValue)
        #expect(object["colorScheme"]?.stringValue == "dark")
        #expect(object["accentColor"]?.stringValue != nil)
        #expect(object["reduceMotion"]?.boolValue != nil)
        #expect(object["highContrast"]?.boolValue != nil)
        #expect(object["active"]?.boolValue != nil)
    }

    @Test func changingTheViewsAppearanceNotifiesTheObserverExactlyOnce() {
        let view = AppearanceReportingView()
        view.appearance = NSAppearance(named: .aqua)

        var pushes: [String] = []
        let observer = HostEnvironmentObserver(view: view) { pushes.append($0.colorScheme) }
        view.onAppearanceChange = { observer.appearanceChanged() }

        _ = observer.snapshot()  // seeds `last`, as connect() does
        view.appearance = NSAppearance(named: .darkAqua)
        #expect(pushes == ["dark"])
    }

    /// A host that re-pushes an identical environment makes every `useColorScheme()`
    /// subscriber in the plugin's React tree re-render for nothing.
    @Test func anUnchangedEnvironmentIsNotPushed() {
        let view = AppearanceReportingView()
        view.appearance = NSAppearance(named: .aqua)

        var pushes = 0
        let observer = HostEnvironmentObserver(view: view) { _ in pushes += 1 }

        #expect(observer.publish().colorScheme == "light")  // first: a real change
        #expect(pushes == 1)
        _ = observer.publish()
        _ = observer.publish()
        #expect(pushes == 1)
    }
}
