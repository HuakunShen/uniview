import AppKit
import Foundation

func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() {
        fputs("FAIL: \(message)\n", stderr)
        exit(1)
    }
}

private func findButton(titled title: String, in view: NSView) -> NSButton? {
    if let button = view as? NSButton, button.title == title {
        return button
    }

    for subview in view.subviews {
        if let button = findButton(titled: title, in: subview) {
            return button
        }
    }

    return nil
}

@main
struct RaycastDetailActionTests {
    static func main() {
        var executedHandlerIds: [String] = []
        let detail = UINode(
            id: "detail",
            type: "Detail",
            props: [
                "markdown": .string("![Preview](photo)\n\n# Detail\n\nReady")
            ],
            children: [
                .node(
                    UINode(
                        id: "metadata",
                        type: "DetailMetadata",
                        children: [
                            .node(
                                UINode(
                                    id: "source",
                                    type: "DetailMetadataLabel",
                                    props: [
                                        "title": .string("Source"),
                                        "text": .string("Chrome")
                                    ]
                                )
                            )
                        ]
                    )
                ),
                .node(
                    UINode(
                        id: "actions",
                        type: "ActionPanel",
                        children: [
                            .node(
                                UINode(
                                    id: "copy",
                                    type: "Action",
                                    props: [
                                        "title": .string("Copy Detail"),
                                        "shortcut": .string("cmd+c"),
                                        "style": .string("primary"),
                                        "_onActionHandlerId": .string("handler-copy")
                                    ]
                                )
                            ),
                            .node(
                                UINode(
                                    id: "disabled",
                                    type: "Action",
                                    props: [
                                        "title": .string("Disabled"),
                                        "shortcut": .string("cmd+d"),
                                        "disabled": .bool(true),
                                        "_onActionHandlerId": .string("handler-disabled")
                                    ]
                                )
                            )
                        ]
                    )
                )
            ]
        )

        let model = NodeViewModel(from: detail)
        let view = NodeViewFactory.createView(for: model) { handlerId, _ in
            executedHandlerIds.append(handlerId)
        }

        expect(NodeViewFactory.handleShortcut(in: view, shortcut: "CMD+C"), "detail handles action shortcuts case-insensitively")
        expect(executedHandlerIds == ["handler-copy"], "detail shortcut executes the matching action")
        expect(!NodeViewFactory.handleShortcut(in: view, shortcut: "cmd+d"), "detail skips disabled shortcut actions")
        expect(NodeViewFactory.handleShortcut(in: view, shortcut: "cmd+k"), "detail exposes an action panel shortcut when actions exist")

        guard let button = findButton(titled: "Copy Detail", in: view) else {
            fputs("FAIL: detail renders a bottom action button\n", stderr)
            exit(1)
        }
        expect(button.accessibilityPerformPress(), "detail action button can execute its handler")
        expect(executedHandlerIds == ["handler-copy", "handler-copy"], "detail action button executes the matching handler")

        print("RaycastDetailActionTests passed")
    }
}
