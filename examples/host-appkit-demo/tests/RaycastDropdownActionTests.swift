import AppKit
import Foundation

func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() {
        fputs("FAIL: \(message)\n", stderr)
        exit(1)
    }
}

private func findPopUpButton(in view: NSView) -> NSPopUpButton? {
    if let button = view as? NSPopUpButton {
        return button
    }

    for subview in view.subviews {
        if let button = findPopUpButton(in: subview) {
            return button
        }
    }

    return nil
}

@main
struct RaycastDropdownActionTests {
    static func main() {
        var events: [(String, [JSONValue])] = []
        let view = NodeViewFactory.createView(
            for: NodeViewModel(from: listNode(selectedType: "All Types")),
            handlerExecutor: { handlerId, args in
                events.append((handlerId, args))
            }
        )

        guard let popup = findPopUpButton(in: view) else {
            fputs("FAIL: expected search bar dropdown popup\n", stderr)
            exit(1)
        }

        expect(!popup.isHidden, "list dropdown popup is visible")
        expect(popup.numberOfItems == 3, "list dropdown renders all items")
        expect(popup.selectedItem?.representedObject as? String == "All Types", "list dropdown selects the controlled value")

        popup.selectItem(at: 1)
        _ = popup.sendAction(popup.action, to: popup.target)

        expect(events.count == 1, "dropdown selection executes one handler")
        expect(events[0].0 == "handler-type", "dropdown selection uses onChange handler")
        expect(events[0].1 == [.string("Text")], "dropdown selection passes selected item value")

        let oldModel = NodeViewModel(from: listNode(selectedType: "All Types"))
        let newModel = NodeViewModel(from: listNode(selectedType: "Image"))
        expect(oldModel.diff(against: newModel), "controlled dropdown value changes are detected")
        expect(oldModel.dirtyFields.contains(.children), "controlled dropdown value changes mark children dirty")

        print("RaycastDropdownActionTests passed")
    }

    private static func listNode(selectedType: String) -> UINode {
        UINode(
            id: "root",
            type: "List",
            children: [
                .node(UINode(
                    id: "type-filter",
                    type: "ListDropdown",
                    props: [
                        "value": .string(selectedType),
                        "_onChangeHandlerId": .string("handler-type"),
                    ],
                    children: [
                        .node(dropdownItem(id: "all", value: "All Types")),
                        .node(dropdownItem(id: "text", value: "Text")),
                        .node(dropdownItem(id: "image", value: "Image")),
                    ]
                )),
                .node(UINode(
                    id: "clip",
                    type: "ListItem",
                    props: [
                        "id": .string("clip"),
                        "title": .string("Clipboard entry"),
                    ]
                )),
            ]
        )
    }

    private static func dropdownItem(id: String, value: String) -> UINode {
        UINode(
            id: id,
            type: "ListDropdownItem",
            props: [
                "value": .string(value),
                "title": .string(value),
            ]
        )
    }
}
