import AppKit
import UniviewNativeCore

/// Not everything native is a view.
///
/// A menu bar, a window's chrome, a dock tile, a notification — each has props,
/// children and handlers like any other node, and each should be authored in the
/// plugin's React tree. None of them is an `NSView`: they never mount into the
/// view hierarchy and they occupy no space in the layout.
///
/// A `NativeSurface` owns such a subtree. The mounter hands it the node and does
/// not descend into it, and the layout engine skips it entirely, so a `<Menu>`
/// sitting inside a `<div>` contributes no box to the flexbox.
///
/// This is the second half of the registry. `Component` renders nodes *into the
/// window*; `NativeSurface` renders nodes *into the rest of the application*.
@MainActor
public protocol NativeSurface: AnyObject {
    /// Apply the subtree. Called on every commit the node survives, so this must
    /// be idempotent and cheap when nothing changed.
    func apply(_ node: ShadowNode, context: MountContext)

    /// The node left the tree — undo whatever `apply` did.
    func teardown()
}

// MARK: - Menu

/// Builds the application's menu bar from a `<Menu>` subtree, so menus and their
/// keyboard shortcuts are written in React, not Swift:
///
/// ```tsx
/// <Menu>
///   <MenuItem title="File">
///     <MenuItem title="New" shortcut="cmd+n" onSelect={() => ...} />
///     <MenuSeparator />
///     <MenuItem title="Close" shortcut="cmd+w" role="close" />
///   </MenuItem>
/// </Menu>
/// ```
///
/// `onSelect` needs no new protocol — it is an ordinary handler prop, so it
/// already crosses the wire as a handler id and comes back through
/// `executeHandler`, exactly like an `onClick` on a button.
///
/// `role` exists because a plugin *cannot* implement Copy. Copy is not an action
/// someone performs; it is a message sent down the responder chain to whatever
/// view is focused. A role maps the item onto that standard selector, so the
/// focused `NSTextField` handles it natively with the plugin never involved.
@MainActor
public final class MenuSurface: NativeSurface {
    /// The menu to restore when the plugin's `<Menu>` goes away. Without it the
    /// app would be left with no menu bar at all — and therefore no ⌘Q.
    private let restore: () -> NSMenu?
    /// `NSMenuItem.target` is a weak reference; these keep the click targets alive.
    private var targets: [MenuActionTarget] = []

    public init(restore: @escaping () -> NSMenu? = { nil }) {
        self.restore = restore
    }

    public func apply(_ node: ShadowNode, context: MountContext) {
        targets.removeAll()
        let bar = NSMenu()
        for child in node.children where !child.isTextNode {
            let item = NSMenuItem(title: Self.title(of: child), action: nil, keyEquivalent: "")
            item.submenu = buildSubmenu(child, context: context)
            bar.addItem(item)
        }
        NSApp.mainMenu = bar
    }

    public func teardown() {
        targets.removeAll()
        NSApp.mainMenu = restore()
    }

    private func buildSubmenu(_ node: ShadowNode, context: MountContext) -> NSMenu {
        let menu = NSMenu(title: Self.title(of: node))
        for child in node.children where !child.isTextNode {
            menu.addItem(buildItem(child, context: context))
        }
        return menu
    }

    private func buildItem(_ node: ShadowNode, context: MountContext) -> NSMenuItem {
        if node.type == "MenuSeparator" { return .separator() }

        let item = NSMenuItem(title: Self.title(of: node), action: nil, keyEquivalent: "")

        if let shortcut = node.props["shortcut"]?.stringValue,
            let key = MenuShortcut(shortcut)
        {
            item.keyEquivalent = key.equivalent
            item.keyEquivalentModifierMask = key.modifiers
        }

        // A role dispatches down the responder chain (nil target) so the focused
        // view handles it; otherwise the item calls back into the plugin.
        if let role = node.props["role"]?.stringValue, let action = Self.roles[role] {
            item.action = action
            item.target = nil
        } else if let handlerId = node.handlerId(for: "onSelect") {
            let target = MenuActionTarget(handlerId: handlerId, executor: context.executeHandler)
            targets.append(target)
            item.target = target
            item.action = #selector(MenuActionTarget.fire)
        }

        if let enabled = node.props["enabled"]?.boolValue {
            item.isEnabled = enabled
            // An item with no action is disabled by AppKit's automatic enabling;
            // opting out lets an explicit `enabled` actually stick.
            if !enabled { item.action = nil }
        }
        if node.props["checked"]?.boolValue == true { item.state = .on }

        let children = node.children.filter { !$0.isTextNode }
        if !children.isEmpty {
            item.submenu = buildSubmenu(node, context: context)
        }
        return item
    }

    private static func title(of node: ShadowNode) -> String {
        node.props["title"]?.stringValue ?? node.renderedText
    }

    /// The standard first-responder selectors a plugin can't implement itself.
    private static let roles: [String: Selector] = [
        "about": #selector(NSApplication.orderFrontStandardAboutPanel(_:)),
        "hide": #selector(NSApplication.hide(_:)),
        "hideOthers": #selector(NSApplication.hideOtherApplications(_:)),
        "showAll": #selector(NSApplication.unhideAllApplications(_:)),
        "quit": #selector(NSApplication.terminate(_:)),
        "undo": Selector(("undo:")),
        "redo": Selector(("redo:")),
        "cut": #selector(NSText.cut(_:)),
        "copy": #selector(NSText.copy(_:)),
        "paste": #selector(NSText.paste(_:)),
        "delete": #selector(NSText.delete(_:)),
        "selectAll": #selector(NSText.selectAll(_:)),
        "close": #selector(NSWindow.performClose(_:)),
        "minimize": #selector(NSWindow.performMiniaturize(_:)),
        "zoom": #selector(NSWindow.performZoom(_:)),
        "front": #selector(NSApplication.arrangeInFront(_:)),
    ]
}

/// Relays a menu click into the plugin. A separate object because
/// `NSMenuItem.target` is weak and `MenuSurface` is not an `NSObject`.
@MainActor
final class MenuActionTarget: NSObject {
    private let handlerId: String
    private let executor: HandlerExecutor

    init(handlerId: String, executor: @escaping HandlerExecutor) {
        self.handlerId = handlerId
        self.executor = executor
    }

    @objc func fire() {
        executor(handlerId, [])
    }
}

/// Parses `"cmd+shift+n"` into AppKit's key equivalent + modifier mask.
struct MenuShortcut {
    let equivalent: String
    let modifiers: NSEvent.ModifierFlags

    init?(_ shortcut: String) {
        var modifiers: NSEvent.ModifierFlags = []
        var key: String?

        for part in shortcut.lowercased().split(separator: "+").map(String.init) {
            switch part {
            case "cmd", "command", "meta", "super": modifiers.insert(.command)
            case "shift": modifiers.insert(.shift)
            case "alt", "opt", "option": modifiers.insert(.option)
            case "ctrl", "control": modifiers.insert(.control)
            default: key = Self.named[part] ?? part
            }
        }

        guard let key, !key.isEmpty else { return nil }
        self.equivalent = key
        self.modifiers = modifiers
    }

    /// Keys with no printable character of their own.
    private static let named: [String: String] = [
        "enter": "\r", "return": "\r",
        "tab": "\t",
        "space": " ",
        "escape": "\u{1b}", "esc": "\u{1b}",
        "backspace": "\u{8}", "delete": "\u{8}",
        "left": "\u{f702}", "right": "\u{f703}", "up": "\u{f700}", "down": "\u{f701}",
    ]
}
