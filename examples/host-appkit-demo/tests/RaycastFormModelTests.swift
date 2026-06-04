import Foundation

func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() {
        fputs("FAIL: \(message)\n", stderr)
        exit(1)
    }
}

@main
struct RaycastFormModelTests {
    static func main() {
        let root = UINode(
            id: "root",
            type: "Form",
            children: [
                .node(UINode(
                    id: "name",
                    type: "FormTextField",
                    props: [
                        "id": .string("name"),
                        "title": .string("Name"),
                        "value": .string("Clipboard"),
                    ]
                )),
                .node(UINode(
                    id: "notes",
                    type: "FormTextArea",
                    props: [
                        "id": .string("notes"),
                        "title": .string("Notes"),
                        "placeholder": .string("Write a note"),
                    ]
                )),
                .node(UINode(
                    id: "remember",
                    type: "FormCheckbox",
                    props: [
                        "id": .string("remember"),
                        "label": .string("Remember selection"),
                        "value": .bool(true),
                    ]
                )),
                .node(UINode(
                    id: "type",
                    type: "FormDropdown",
                    props: [
                        "id": .string("type"),
                        "title": .string("Type"),
                        "value": .string("image"),
                    ],
                    children: [
                        .node(UINode(
                            id: "type-text",
                            type: "FormDropdownItem",
                            props: [
                                "value": .string("text"),
                                "title": .string("Text"),
                            ]
                        )),
                        .node(UINode(
                            id: "type-image",
                            type: "FormDropdownItem",
                            props: [
                                "value": .string("image"),
                                "title": .string("Image"),
                            ]
                        )),
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
                    ]
                )),
            ]
        )

        let model = RaycastFormModel(root: NodeViewModel(from: root))
        expect(model.fields.count == 4, "form fields are parsed")
        expect(model.fields[0] == .textField(id: "name", title: "Name", value: "Clipboard", placeholder: "", isPassword: false), "text field props are parsed")
        expect(model.fields[1] == .textArea(id: "notes", title: "Notes", value: "", placeholder: "Write a note"), "text area props are parsed")
        expect(model.fields[2] == .checkbox(id: "remember", label: "Remember selection", value: true), "checkbox props are parsed")
        expect(model.fields[3] == .dropdown(id: "type", title: "Type", value: "image", items: [
            RaycastFormDropdownItem(value: "text", title: "Text"),
            RaycastFormDropdownItem(value: "image", title: "Image"),
        ]), "dropdown items are parsed")
        expect(model.actions.first?.title == "Save Preferences", "form actions are parsed")
        expect(model.actions.first?.handlerId == "handler-save", "form action handler is preserved")

        print("RaycastFormModelTests passed")
    }
}
