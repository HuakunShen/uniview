import Foundation

func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() {
        fputs("FAIL: \(message)\n", stderr)
        exit(1)
    }
}

@main
struct RaycastGridModelTests {
    static func main() {
        let root = UINode(
            id: "root",
            type: "Grid",
            props: [
                "columns": .number(3),
                "selectedItemId": .string("clip-image"),
            ],
            children: [
                .node(UINode(
                    id: "kind-filter",
                    type: "GridDropdown",
                    props: [
                        "defaultValue": .string("icons"),
                        "_onChangeHandlerId": .string("handler-kind"),
                    ],
                    children: [
                        .node(UINode(
                            id: "icons",
                            type: "GridDropdownItem",
                            props: [
                                "value": .string("icons"),
                                "title": .string("Icons"),
                            ]
                        )),
                        .node(UINode(
                            id: "screenshots",
                            type: "GridDropdownItem",
                            props: [
                                "value": .string("screenshots"),
                                "title": .string("Screenshots"),
                            ]
                        )),
                    ]
                )),
                .node(UINode(
                    id: "section",
                    type: "GridSection",
                    props: ["title": .string("Images")],
                    children: [
                        .node(UINode(
                            id: "clip-image",
                            type: "GridItem",
                            props: [
                                "id": .string("clip-image"),
                                "title": .string("Screenshot"),
                                "subtitle": .string("710x452"),
                                "content": .string("photo"),
                                "keywords": .array([.string("clipboard"), .string("image")]),
                            ],
                            children: [
                                .node(UINode(
                                    id: "clip-image-actions",
                                    type: "ActionPanel",
                                    children: [
                                        .node(UINode(
                                            id: "clip-image-copy",
                                            type: "Action",
                                            props: [
                                                "title": .string("Copy Asset Name"),
                                                "shortcut": .string("cmd+c"),
                                                "style": .string("primary"),
                                                "_onActionHandlerId": .string("handler-copy-clip-image"),
                                            ]
                                        )),
                                    ]
                                )),
                            ]
                        )),
                        .node(UINode(
                            id: "clip-color",
                            type: "GridItem",
                            props: [
                                "id": .string("clip-color"),
                                "title": .string("Brand color"),
                                "content": .string("paintpalette"),
                            ]
                        )),
                    ]
                )),
            ]
        )

        let model = RaycastGridModel(root: NodeViewModel(from: root), query: "screen")
        expect(model.columns == 3, "columns are parsed from Grid props")
        expect(model.items.count == 2, "nested section grid items are parsed")
        expect(model.visibleItems.map(\.id) == ["clip-image"], "query matches title and keywords")
        expect(model.selectedItem?.id == "clip-image", "selected item is resolved from visible items")
        expect(model.items[0].sectionTitle == "Images", "section title is preserved")
        expect(model.items[0].content == "photo", "grid item content is parsed")
        expect(model.items[0].actions.count == 1, "grid item action panels are parsed")
        expect(model.items[0].primaryAction?.title == "Copy Asset Name", "grid primary action is resolved")
        expect(model.items[0].primaryAction?.handlerId == "handler-copy-clip-image", "grid action handler ID is preserved")
        expect(model.items[0].action(matchingShortcut: "CMD+C")?.title == "Copy Asset Name", "grid shortcut lookup is case-insensitive")
        expect(model.dropdown?.value == "icons", "grid dropdown default value is parsed")
        expect(model.dropdown?.handlerId == "handler-kind", "grid dropdown change handler is parsed")
        expect(model.dropdown?.items.map(\.value) == ["icons", "screenshots"], "grid dropdown items are parsed")

        print("RaycastGridModelTests passed")
    }
}
