import AppKit
import Testing

@testable import UniviewAppKit
@testable import UniviewNativeCore
@testable import UniviewYoga

/// A `<Menu>` is native but is not a view. These pin the two things that would
/// otherwise break silently: it must never become an `NSView`, and it must never
/// occupy a box in the layout.
@MainActor
@Suite struct NativeSurfaceTests {

    private func menuTree() -> UINode {
        UINode(
            id: "root", type: "View",
            props: ["_style": .object(["flexDirection": .string("column")])],
            children: [
                UINode(
                    id: "menu", type: "Menu",
                    children: [
                        UINode(
                            id: "file", type: "MenuItem",
                            props: ["title": .string("File")],
                            children: [
                                UINode(
                                    id: "new", type: "MenuItem",
                                    props: [
                                        "title": .string("New"),
                                        "shortcut": .string("cmd+shift+n"),
                                        "_onSelectHandlerId": .string("h1"),
                                    ]),
                                UINode(id: "sep", type: "MenuSeparator"),
                                UINode(
                                    id: "copy", type: "MenuItem",
                                    props: [
                                        "title": .string("Copy"), "shortcut": .string("cmd+c"),
                                        "role": .string("copy"),
                                    ]),
                            ])
                    ]),
                UINode(
                    id: "body", type: "View",
                    props: ["_style": .object(["height": .number(40)])]),
            ])
    }

    private func host(_ fired: @escaping @MainActor (String) -> Void = { _ in }) -> UniviewHost {
        let registry = ComponentRegistry.standard()
        registry.registerSurface("Menu", MenuSurface())
        return UniviewHost(
            registry: registry,
            layoutEngine: YogaLayoutEngine(),
            containerSize: Size(width: 300, height: 200),
            executeHandler: { id, _ in fired(id) })
    }

    @Test func aMenuNodeMountsNoViewAndOccupiesNoBox() {
        let host = self.host()
        host.apply(CommitBatch(revision: 0, mutations: [.setRoot(node: menuTree())]))

        // Not a view.
        #expect(host.view(for: "menu") == nil)
        #expect(host.view(for: "body") != nil)

        // Not a box: `body` is the first child of the column, so it sits at y=0.
        // If the menu were laid out, it would push `body` down.
        let body = try? #require(host.tree.node(id: "body"))
        #expect(body?.layout.y == 0)
        #expect(body?.layout.height == 40)
    }

    @Test func theMenuBecomesTheApplicationMenuBar() throws {
        let host = self.host()
        host.apply(CommitBatch(revision: 0, mutations: [.setRoot(node: menuTree())]))

        let bar = try #require(NSApp.mainMenu)
        let file = try #require(bar.items.first?.submenu)
        #expect(file.title == "File")

        let new = try #require(file.items.first)
        #expect(new.title == "New")
        #expect(new.keyEquivalent == "n")
        #expect(new.keyEquivalentModifierMask == [.command, .shift])

        #expect(file.items[1].isSeparatorItem)

        // A `role` dispatches down the responder chain — the plugin can't
        // implement Copy, only the focused view can.
        let copy = file.items[2]
        #expect(copy.action == #selector(NSText.copy(_:)))
        #expect(copy.target == nil)
    }

    @Test func selectingAnItemCallsBackIntoThePlugin() throws {
        var fired: [String] = []
        let host = self.host { fired.append($0) }
        host.apply(CommitBatch(revision: 0, mutations: [.setRoot(node: menuTree())]))

        let file = try #require(NSApp.mainMenu?.items.first?.submenu)
        let new = try #require(file.items.first)
        let target = try #require(new.target as? MenuActionTarget)
        target.fire()

        // onSelect needs no new protocol: it is an ordinary handler prop.
        #expect(fired == ["h1"])
    }

    @Test func dropping_theMenuNodeRestoresTheFallbackMenu() throws {
        let registry = ComponentRegistry.standard()
        let fallback = NSMenu(title: "fallback")
        registry.registerSurface("Menu", MenuSurface(restore: { fallback }))
        let host = UniviewHost(
            registry: registry, layoutEngine: YogaLayoutEngine(),
            containerSize: Size(width: 300, height: 200), executeHandler: { _, _ in })

        host.apply(CommitBatch(revision: 0, mutations: [.setRoot(node: menuTree())]))
        #expect(NSApp.mainMenu?.title != "fallback")

        // The plugin stops rendering its <Menu>: the app must not be left with no
        // menu bar at all (that would mean no ⌘Q).
        host.apply(
            CommitBatch(
                revision: 1,
                mutations: [.setRoot(node: UINode(id: "root", type: "View"))]))
        #expect(NSApp.mainMenu?.title == "fallback")
    }

    @Test func shortcutParsing() throws {
        #expect(MenuShortcut("cmd+n")?.equivalent == "n")
        #expect(MenuShortcut("cmd+n")?.modifiers == .command)
        #expect(MenuShortcut("cmd+shift+z")?.modifiers == [.command, .shift])
        #expect(MenuShortcut("cmd+opt+i")?.modifiers == [.command, .option])
        #expect(MenuShortcut("escape")?.equivalent == "\u{1b}")
        #expect(MenuShortcut("cmd")  == nil)  // modifiers alone are not a shortcut
    }
}
