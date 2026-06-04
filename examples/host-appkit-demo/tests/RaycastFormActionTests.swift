import AppKit
import Foundation

func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() {
        fputs("FAIL: \(message)\n", stderr)
        exit(1)
    }
}

@main
struct RaycastFormActionTests {
    static func main() {
        var executedHandlerIds: [String] = []
        let view = NodeViewFactory.createView(
            for: NodeViewModel(from: formNode()),
            handlerExecutor: { handlerId, _ in
                executedHandlerIds.append(handlerId)
            }
        )

        expect(
            findView(in: view, ofType: NSSecureTextField.self) != nil,
            "password form fields render as secure text fields"
        )

        guard let button = findButton(in: view, title: "Save Preferences") else {
            fputs("FAIL: expected Save Preferences button\n", stderr)
            exit(1)
        }

        button.performClick(nil)
        expect(executedHandlerIds == ["handler-save"], "form action button executes its handler")

        expect(button.accessibilityPerformPress(), "form action button supports accessibility press")
        expect(
            executedHandlerIds == ["handler-save", "handler-save"],
            "form action button accessibility press executes its handler"
        )

        expect(
            NodeViewFactory.handleShortcut(in: view, shortcut: "cmd+s"),
            "form action shortcut is handled by the Form view"
        )
        expect(
            executedHandlerIds == ["handler-save", "handler-save", "handler-save"],
            "form action shortcut executes its handler"
        )
        expect(
            NodeViewFactory.handleShortcut(in: view, shortcut: "cmd+k"),
            "form action panel shortcut is handled by the Form view"
        )
        let executedBeforeInvalidShortcut = executedHandlerIds
        expect(
            !NodeViewFactory.handleShortcut(in: view, shortcut: "meta+s"),
            "form ignores invalid shortcut strings"
        )
        expect(
            executedHandlerIds == executedBeforeInvalidShortcut,
            "invalid form shortcuts do not execute actions without shortcuts"
        )

        let oldModel = NodeViewModel(from: formNode(description: "Not saved yet"))
        let newModel = NodeViewModel(from: formNode(description: "Saved Clipboard History"))
        expect(oldModel.diff(against: newModel), "form root detects nested field prop changes")
        expect(
            oldModel.dirtyFields.contains(.children),
            "nested field prop changes mark children dirty for custom native views"
        )

        print("RaycastFormActionTests passed")
    }

    private static func findButton(in view: NSView, title: String) -> NSButton? {
        if let button = view as? NSButton, button.title == title {
            return button
        }

        for subview in view.subviews {
            if let button = findButton(in: subview, title: title) {
                return button
            }
        }

        return nil
    }

    private static func findView<T: NSView>(in view: NSView, ofType type: T.Type) -> T? {
        if let match = view as? T {
            return match
        }

        for subview in view.subviews {
            if let match = findView(in: subview, ofType: type) {
                return match
            }
        }

        return nil
    }

    private static func formNode(description: String = "Not saved yet") -> UINode {
        UINode(
            id: "root",
            type: "Form",
            children: [
                .node(UINode(
                    id: "name",
                    type: "FormTextField",
                    props: [
                        "id": .string("name"),
                        "title": .string("Name"),
                    ]
                )),
                .node(UINode(
                    id: "description",
                    type: "FormTextArea",
                    props: [
                        "id": .string("description"),
                        "title": .string("Description"),
                        "value": .string(description),
                    ]
                )),
                .node(UINode(
                    id: "token",
                    type: "FormPasswordField",
                    props: [
                        "id": .string("token"),
                        "title": .string("API Token"),
                        "value": .string("secret-token"),
                    ]
                )),
                .node(UINode(
                    id: "actions",
                    type: "ActionPanel",
                    children: [
                        .node(UINode(
                            id: "save",
                            type: "Action",
                            props: [
                                "title": .string("Save Preferences"),
                                "shortcut": .string("cmd+s"),
                                "_onActionHandlerId": .string("handler-save"),
                            ]
                        )),
                        .node(UINode(
                            id: "no-shortcut",
                            type: "Action",
                            props: [
                                "title": .string("No Shortcut"),
                                "_onActionHandlerId": .string("handler-no-shortcut"),
                            ]
                        )),
                    ]
                )),
            ]
        )
    }
}
