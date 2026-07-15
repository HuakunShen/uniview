import AppKit
import Testing

@testable import UniviewAppKit

/// ⌘C/⌘V/⌘Q are menu key equivalents, not built-in AppKit behavior — with no
/// main menu they are simply dead, silently. These assert the shortcuts exist,
/// so their absence fails a test instead of a user.
@MainActor
@Suite struct MainMenuTests {
    private func item(_ menu: NSMenu, _ title: String) -> NSMenuItem? {
        menu.items.first { $0.title == title }
    }

    @Test func quitIsCommandQ() throws {
        let app = UniviewMainMenu.applicationMenu(appName: "Uniview")
        let quit = try #require(item(app, "Quit Uniview"))
        #expect(quit.keyEquivalent == "q")
        #expect(quit.keyEquivalentModifierMask == .command)
        #expect(quit.action == #selector(NSApplication.terminate(_:)))
    }

    @Test func clipboardShortcutsExistAndDispatchToTheResponderChain() throws {
        let edit = UniviewMainMenu.editMenu()
        let expected: [(String, String, Selector)] = [
            ("Cut", "x", #selector(NSText.cut(_:))),
            ("Copy", "c", #selector(NSText.copy(_:))),
            ("Paste", "v", #selector(NSText.paste(_:))),
            ("Select All", "a", #selector(NSText.selectAll(_:))),
        ]

        for (title, key, action) in expected {
            let entry = try #require(item(edit, title), "missing \(title)")
            #expect(entry.keyEquivalent == key)
            #expect(entry.action == action)
            // A nil target is what sends the action down the responder chain to
            // the focused field. A concrete target would strand it.
            #expect(entry.target == nil)
        }
    }

    @Test func standardMenuCarriesAppEditAndWindowSubmenus() {
        let menu = UniviewMainMenu.standard(appName: "Uniview")
        #expect(menu.items.compactMap(\.submenu?.title) == ["Uniview", "Edit", "Window"])
    }

    @Test func closeAndMinimizeAreWiredToTheWindow() throws {
        let window = UniviewMainMenu.windowMenu()
        let close = try #require(item(window, "Close"))
        #expect(close.keyEquivalent == "w")
        #expect(close.action == #selector(NSWindow.performClose(_:)))

        let minimize = try #require(item(window, "Minimize"))
        #expect(minimize.keyEquivalent == "m")
    }
}
