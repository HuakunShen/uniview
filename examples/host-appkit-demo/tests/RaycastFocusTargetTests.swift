import AppKit
import Foundation

func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() {
        fputs("FAIL: \(message)\n", stderr)
        exit(1)
    }
}

@main
struct RaycastFocusTargetTests {
    static func main() {
        var executedHandlerIds: [String] = []
        let listView = NodeViewFactory.createView(
            for: NodeViewModel(from: listNode()),
            handlerExecutor: { handlerId, _ in
                executedHandlerIds.append(handlerId)
            }
        )

        let directTarget = NodeViewFactory.initialFocusTarget(in: listView)
        expect(directTarget is NSSearchField, "Raycast List exposes its search field as the initial focus target")

        let wrapper = NSView()
        wrapper.addSubview(listView)
        let nestedTarget = NodeViewFactory.initialFocusTarget(in: wrapper)
        expect(nestedTarget === directTarget, "focus target lookup descends into plugin view hierarchies")
        expect(NodeViewFactory.handleShortcut(in: wrapper, shortcut: "cmd+c"), "shortcut lookup descends into plugin view hierarchies")
        expect(executedHandlerIds == ["handler-copy-issue-login"], "shortcut handler executes the selected action")

        executedHandlerIds.removeAll()
        let gridView = NodeViewFactory.createView(
            for: NodeViewModel(from: gridNode()),
            handlerExecutor: { handlerId, _ in
                executedHandlerIds.append(handlerId)
            }
        )
        expect(NodeViewFactory.initialFocusTarget(in: gridView) is NSSearchField, "Raycast Grid exposes its search field as the initial focus target")
        expect(NodeViewFactory.handleShortcut(in: gridView, shortcut: "cmd+o"), "grid shortcut lookup executes selected item actions")
        expect(executedHandlerIds == ["handler-open-screenshot"], "grid shortcut handler executes the selected action")
        expect(windowRoutesCommandShortcut(), "ShortcutWindow routes command-key equivalents before default handling")

        print("RaycastFocusTargetTests passed")
    }

    private static func windowRoutesCommandShortcut() -> Bool {
        let window = ShortcutWindow(
            contentRect: NSRect(x: 0, y: 0, width: 100, height: 100),
            styleMask: [.titled],
            backing: .buffered,
            defer: false
        )
        var routedShortcuts: [String] = []
        window.shortcutHandler = { shortcut in
            routedShortcuts.append(shortcut)
            return true
        }

        guard let event = NSEvent.keyEvent(
            with: .keyDown,
            location: .zero,
            modifierFlags: .command,
            timestamp: 0,
            windowNumber: window.windowNumber,
            context: nil,
            characters: "c",
            charactersIgnoringModifiers: "c",
            isARepeat: false,
            keyCode: 8
        ) else {
            return false
        }

        return window.performKeyEquivalent(with: event)
            && routedShortcuts == ["cmd+c"]
    }

    private static func listNode() -> UINode {
        UINode(
            id: "root",
            type: "List",
            props: [
                "searchBarPlaceholder": .string("Search issues"),
                "selectedItemId": .string("issue-login"),
            ],
            children: [
                .node(UINode(
                    id: "issue-login",
                    type: "ListItem",
                    props: [
                        "id": .string("issue-login"),
                        "title": .string("Fix login redirect"),
                    ],
                    children: [
                        .node(UINode(
                            id: "detail",
                            type: "Detail",
                            props: ["markdown": .string("Details")]
                        )),
                        .node(UINode(
                            id: "actions",
                            type: "ActionPanel",
                            children: [
                                .node(UINode(
                                    id: "copy-action",
                                    type: "Action",
                                    props: [
                                        "title": .string("Copy ID"),
                                        "shortcut": .string("cmd+c"),
                                        "_onActionHandlerId": .string("handler-copy-issue-login"),
                                    ]
                                )),
                            ]
                        )),
                    ]
                )),
            ]
        )
    }

    private static func gridNode() -> UINode {
        UINode(
            id: "grid-root",
            type: "Grid",
            props: [
                "selectedItemId": .string("asset-photo"),
            ],
            children: [
                .node(UINode(
                    id: "asset-photo",
                    type: "GridItem",
                    props: [
                        "id": .string("asset-photo"),
                        "title": .string("Screenshot"),
                        "content": .string("photo"),
                    ],
                    children: [
                        .node(UINode(
                            id: "asset-photo-actions",
                            type: "ActionPanel",
                            children: [
                                .node(UINode(
                                    id: "asset-photo-open",
                                    type: "Action",
                                    props: [
                                        "title": .string("Open Preview"),
                                        "shortcut": .string("cmd+o"),
                                        "_onActionHandlerId": .string("handler-open-screenshot"),
                                    ]
                                )),
                            ]
                        )),
                    ]
                )),
            ]
        )
    }
}
