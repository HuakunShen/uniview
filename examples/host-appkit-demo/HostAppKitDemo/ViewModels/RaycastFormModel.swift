import Foundation

struct RaycastFormDropdownItem: Equatable {
    let value: String
    let title: String
}

enum RaycastFormField: Equatable {
    case textField(id: String, title: String, value: String, placeholder: String, isPassword: Bool)
    case textArea(id: String, title: String, value: String, placeholder: String)
    case checkbox(id: String, label: String, value: Bool)
    case dropdown(id: String, title: String, value: String, items: [RaycastFormDropdownItem])
    case separator
}

struct RaycastFormModel {
    let root: NodeViewModel
    let fields: [RaycastFormField]
    let actions: [RaycastListAction]

    init(root: NodeViewModel) {
        self.root = root
        self.fields = RaycastFormModel.extractFields(from: root.children)
        self.actions = RaycastFormModel.extractActions(from: root.children.first { $0.type == "ActionPanel" })
    }

    private static func extractFields(from children: [NodeViewModel]) -> [RaycastFormField] {
        children.compactMap { child in
            switch child.type {
            case "FormTextField", "FormPasswordField":
                return .textField(
                    id: fieldId(child),
                    title: child.props["title"]?.stringValue ?? child.textContent,
                    value: textValue(child),
                    placeholder: child.props["placeholder"]?.stringValue ?? "",
                    isPassword: child.type == "FormPasswordField"
                )
            case "FormTextArea":
                return .textArea(
                    id: fieldId(child),
                    title: child.props["title"]?.stringValue ?? child.textContent,
                    value: textValue(child),
                    placeholder: child.props["placeholder"]?.stringValue ?? ""
                )
            case "FormCheckbox":
                return .checkbox(
                    id: fieldId(child),
                    label: child.props["label"]?.stringValue ?? child.textContent,
                    value: child.props["value"]?.boolValue ?? child.props["defaultValue"]?.boolValue ?? false
                )
            case "FormDropdown":
                return .dropdown(
                    id: fieldId(child),
                    title: child.props["title"]?.stringValue ?? child.textContent,
                    value: child.props["value"]?.stringValue ?? child.props["defaultValue"]?.stringValue ?? "",
                    items: dropdownItems(from: child.children)
                )
            case "FormSeparator":
                return .separator
            default:
                return nil
            }
        }
    }

    private static func extractActions(from actionPanel: NodeViewModel?) -> [RaycastListAction] {
        actionPanel?.children.compactMap { action in
            guard action.type == "Action" else {
                return nil
            }
            return RaycastListAction(
                title: action.props["title"]?.stringValue ?? action.textContent,
                handlerId: action.handlerId(for: "onAction"),
                isDisabled: action.props["disabled"]?.boolValue ?? false,
                style: action.props["style"]?.stringValue ?? "regular",
                shortcut: action.props["shortcut"]?.stringValue
            )
        } ?? []
    }

    private static func dropdownItems(from children: [NodeViewModel]) -> [RaycastFormDropdownItem] {
        children.compactMap { child in
            guard child.type == "FormDropdownItem" else {
                return nil
            }
            return RaycastFormDropdownItem(
                value: child.props["value"]?.stringValue ?? child.id,
                title: child.props["title"]?.stringValue ?? child.textContent
            )
        }
    }

    private static func fieldId(_ model: NodeViewModel) -> String {
        model.props["id"]?.stringValue ?? model.id
    }

    private static func textValue(_ model: NodeViewModel) -> String {
        model.props["value"]?.stringValue ?? model.props["defaultValue"]?.stringValue ?? ""
    }
}
