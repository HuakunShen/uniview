import AppKit

/// The standard macOS main menu, built in code.
///
/// ⌘C / ⌘V / ⌘Q are **not** built into AppKit. They are key equivalents of menu
/// items, and AppKit resolves a key equivalent by walking `NSApp.mainMenu` and
/// then sending the item's action down the responder chain. An app with no main
/// menu has no key equivalents at all — copy, paste, select-all, undo, close,
/// minimize and even quit are simply dead. A storyboard app never notices,
/// because it inherits `MainMenu.xib`; a programmatic one has to build this.
///
/// The actions are the standard first-responder selectors (`copy:`, `paste:`,
/// `undo:`, …), so they reach whatever native view is focused — an `NSTextField`
/// mounted by Uniview handles them for free, with no plugin involvement.
///
/// This is a starting point, not a fixed policy: the returned `NSMenu` is
/// ordinary and callers are expected to insert their own submenus.
///
/// ```swift
/// NSApp.mainMenu = UniviewMainMenu.standard(appName: "Uniview Desktop")
/// ```
@MainActor
public enum UniviewMainMenu {
    public static func standard(
        appName: String = ProcessInfo.processInfo.processName
    ) -> NSMenu {
        let menu = NSMenu()
        menu.addItem(submenu: applicationMenu(appName: appName))
        menu.addItem(submenu: editMenu())
        menu.addItem(submenu: windowMenu())
        return menu
    }

    /// The bold app menu: About / Hide / Quit.
    public static func applicationMenu(appName: String) -> NSMenu {
        let menu = NSMenu(title: appName)
        menu.addItem(
            "About \(appName)", #selector(NSApplication.orderFrontStandardAboutPanel(_:)))
        menu.addItem(.separator())
        menu.addItem("Hide \(appName)", #selector(NSApplication.hide(_:)), "h")
        menu.addItem(
            "Hide Others", #selector(NSApplication.hideOtherApplications(_:)), "h",
            [.command, .option])
        menu.addItem("Show All", #selector(NSApplication.unhideAllApplications(_:)))
        menu.addItem(.separator())
        menu.addItem("Quit \(appName)", #selector(NSApplication.terminate(_:)), "q")
        return menu
    }

    /// Undo/redo and the clipboard. These selectors are handled by any focused
    /// `NSText`-backed view, which is what Uniview's `TextInput` mounts.
    public static func editMenu() -> NSMenu {
        let menu = NSMenu(title: "Edit")
        menu.addItem("Undo", Selector(("undo:")), "z")
        menu.addItem("Redo", Selector(("redo:")), "z", [.command, .shift])
        menu.addItem(.separator())
        menu.addItem("Cut", #selector(NSText.cut(_:)), "x")
        menu.addItem("Copy", #selector(NSText.copy(_:)), "c")
        menu.addItem("Paste", #selector(NSText.paste(_:)), "v")
        menu.addItem("Delete", #selector(NSText.delete(_:)))
        menu.addItem("Select All", #selector(NSText.selectAll(_:)), "a")
        return menu
    }

    public static func windowMenu() -> NSMenu {
        let menu = NSMenu(title: "Window")
        menu.addItem("Minimize", #selector(NSWindow.performMiniaturize(_:)), "m")
        menu.addItem("Zoom", #selector(NSWindow.performZoom(_:)))
        menu.addItem(.separator())
        menu.addItem("Close", #selector(NSWindow.performClose(_:)), "w")
        menu.addItem(.separator())
        menu.addItem("Bring All to Front", #selector(NSApplication.arrangeInFront(_:)))
        return menu
    }
}

extension NSMenu {
    /// A menu item with a `nil` target, so the action is dispatched down the
    /// responder chain (which is how `copy:` reaches the focused field, and how
    /// items grey themselves out when nothing can handle them).
    @discardableResult
    fileprivate func addItem(
        _ title: String,
        _ action: Selector,
        _ key: String = "",
        _ modifiers: NSEvent.ModifierFlags = .command
    ) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
        if !key.isEmpty { item.keyEquivalentModifierMask = modifiers }
        addItem(item)
        return item
    }

    /// A top-level bar entry. AppKit requires the *item* to carry the title and
    /// the submenu to hang off it.
    fileprivate func addItem(submenu: NSMenu) {
        let item = NSMenuItem(title: submenu.title, action: nil, keyEquivalent: "")
        item.submenu = submenu
        addItem(item)
    }
}
