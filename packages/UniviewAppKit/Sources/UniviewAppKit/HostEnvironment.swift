import AppKit
import UniviewNativeCore

/// What the plugin is allowed to know about the machine it's being displayed on:
/// dark mode, the user's accent color, their accessibility settings.
///
/// This is *state*, not events, and it is not the plugin's props — the host owns
/// it. React Native draws the same line with its `Appearance` module; a plugin
/// reads it through `useColorScheme()`.
///
/// Note what this is NOT for. `bg-card` and `text-foreground` do not consult it:
/// they reach the host as names and are resolved into dynamic `NSColor`s, per
/// view, at draw time. This is for decisions only the plugin can make — which
/// chart palette, which illustration, whether to animate at all.
public struct HostEnvironment: Equatable, Sendable {
    public var colorScheme: String  // "light" | "dark"
    public var accentColor: String
    public var reduceMotion: Bool
    public var highContrast: Bool
    public var active: Bool

    public var json: JSONValue {
        .object([
            "colorScheme": .string(colorScheme),
            "accentColor": .string(accentColor),
            "reduceMotion": .bool(reduceMotion),
            "highContrast": .bool(highContrast),
            "active": .bool(active),
        ])
    }

    /// Read the environment **as a specific view sees it**.
    ///
    /// Deliberately not `NSApp.effectiveAppearance`. A window can carry
    /// `<Window appearance="light">` while the system is dark, and the plugin has
    /// to agree with the pixels it actually produced — otherwise it picks a dark
    /// chart palette for a light window and blames the framework.
    @MainActor
    public static func current(for view: NSView) -> HostEnvironment {
        let isDark =
            view.effectiveAppearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
        let workspace = NSWorkspace.shared
        return HostEnvironment(
            colorScheme: isDark ? "dark" : "light",
            accentColor: hex(NSColor.controlAccentColor, in: view.effectiveAppearance),
            reduceMotion: workspace.accessibilityDisplayShouldReduceMotion,
            highContrast: workspace.accessibilityDisplayShouldIncreaseContrast,
            active: NSApp?.isActive ?? true)
    }

    /// `controlAccentColor` is dynamic; the plugin can only be handed a literal,
    /// so it has to be resolved against the appearance the view is actually in.
    @MainActor
    private static func hex(_ color: NSColor, in appearance: NSAppearance) -> String {
        var resolved = color
        appearance.performAsCurrentDrawingAppearance {
            resolved = color.usingColorSpace(.sRGB) ?? color
        }
        let byte = { (value: CGFloat) in Int((value * 255).rounded()) }
        return String(
            format: "#%02x%02x%02x",
            byte(resolved.redComponent), byte(resolved.greenComponent),
            byte(resolved.blueComponent))
    }
}

/// Calls back whenever anything in the `HostEnvironment` changes, so a host can
/// push the new value to its plugin. Only fires on a *real* change: hosts that
/// re-push an identical environment make every subscriber in the plugin's React
/// tree re-render for nothing.
@MainActor
public final class HostEnvironmentObserver {
    private let view: NSView
    private let onChange: (HostEnvironment) -> Void
    private var last: HostEnvironment?
    private let tokens = TokenBag()

    public init(view: NSView, onChange: @escaping (HostEnvironment) -> Void) {
        self.view = view
        self.onChange = onChange

        // Accessibility settings and app activation come over notifications;
        // appearance comes from the view (see `appearanceChanged`).
        tokens.workspace.append(
            NSWorkspace.shared.notificationCenter.addObserver(
                forName: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification,
                object: nil, queue: .main
            ) { [weak self] _ in
                MainActor.assumeIsolated { _ = self?.publish() }
            })
        for name in [
            NSApplication.didBecomeActiveNotification, NSApplication.didResignActiveNotification,
        ] {
            tokens.app.append(
                NotificationCenter.default.addObserver(
                    forName: name, object: nil, queue: .main
                ) { [weak self] _ in
                    MainActor.assumeIsolated { _ = self?.publish() }
                })
        }
    }

    /// Observer tokens have to be unregistered from a `deinit`, and a `deinit` on
    /// a `@MainActor` class is nonisolated — it cannot touch the class's own
    /// state. So the tokens live in something that can clean up after itself.
    private final class TokenBag: @unchecked Sendable {
        var workspace: [any NSObjectProtocol] = []
        var app: [any NSObjectProtocol] = []

        deinit {
            for token in workspace {
                NSWorkspace.shared.notificationCenter.removeObserver(token)
            }
            for token in app { NotificationCenter.default.removeObserver(token) }
        }
    }

    /// The view this observer watches must call this from
    /// `viewDidChangeEffectiveAppearance()` — AppKit has no notification for it.
    public func appearanceChanged() { _ = publish() }

    /// Push the current environment, whether or not it changed. Use once at
    /// connect time; after that, changes drive themselves.
    @discardableResult
    public func publish() -> HostEnvironment {
        let now = HostEnvironment.current(for: view)
        guard now != last else { return now }
        last = now
        onChange(now)
        return now
    }

    /// The current value without notifying — for seeding `initialize`.
    public func snapshot() -> HostEnvironment {
        let now = HostEnvironment.current(for: view)
        last = now
        return now
    }
}

/// A container that reports when its appearance changes.
///
/// AppKit has no notification for an appearance change — only the
/// `viewDidChangeEffectiveAppearance()` override — so *some* view has to own it.
/// A host mounts its plugin inside one of these and hands the callback to a
/// `HostEnvironmentObserver`.
public final class AppearanceReportingView: FlippedView {
    public var onAppearanceChange: (() -> Void)?

    public override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance()
        onAppearanceChange?()
    }
}
