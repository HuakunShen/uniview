import AppKit

/// Protocol for NSViews that can be updated in-place from a NodeViewModel.
protocol UpdatableNodeView: NSView {
    func update(
        from oldModel: NodeViewModel,
        to newModel: NodeViewModel,
        handlerExecutor: @escaping NodeViewFactory.HandlerExecutor
    )
}

/// Protocol for plugin views that can name the control that should receive first focus.
protocol InitialFocusableNodeView: NSView {
    var initialFocusView: NSView? { get }
}

/// Protocol for plugin views that can handle command-style keyboard shortcuts.
protocol ShortcutHandlingNodeView: NSView {
    func handleShortcut(_ shortcut: String) -> Bool
}

/// Creates and updates NSViews based on NodeViewModel type.
enum NodeViewFactory {

    typealias HandlerExecutor = (String, [JSONValue]) -> Void

    /// Create a new NSView tree for a NodeViewModel tree (recursively creates children).
    static func createView(
        for model: NodeViewModel,
        handlerExecutor: @escaping HandlerExecutor
    ) -> NSView {
        let view: NSView

        switch model.type {
        case "div", "section", "header", "footer", "nav", "main",
             "aside", "article", "form":
            view = ContainerView(model: model, handlerExecutor: handlerExecutor)

        case "p", "span", "strong", "em", "code", "pre", "label":
            view = TextNodeView(model: model)

        case "h1", "h2", "h3", "h4", "h5", "h6":
            view = TextNodeView(model: model)

        case "img":
            view = RaycastImageNodeView(model: model)

        case "ul", "ol":
            view = ListContainerView(model: model, handlerExecutor: handlerExecutor)

        case "li":
            view = ListItemView(model: model, handlerExecutor: handlerExecutor)

        case "List":
            view = RaycastListNodeView(model: model, handlerExecutor: handlerExecutor)

        case "Grid":
            view = RaycastGridNodeView(model: model, handlerExecutor: handlerExecutor)

        case "Form":
            view = RaycastFormNodeView(model: model, handlerExecutor: handlerExecutor)

        case "Detail":
            view = DetailNodeView(model: model, handlerExecutor: handlerExecutor)

        case "EmptyView":
            view = EmptyViewNodeView(model: model)

        case "ActionPanel", "Action", "ListItem", "ListSection",
             "ListItemDetail", "ListItemDetailMetadata", "ListItemDetailMetadataLabel",
             "ListItemDetailMetadataSeparator", "GridItem", "GridSection",
             "ListDropdown", "ListDropdownItem", "GridDropdown", "GridDropdownItem",
             "DetailMetadata", "DetailMetadataLabel", "DetailMetadataSeparator",
             "FormTextField", "FormPasswordField", "FormTextArea", "FormCheckbox",
             "FormDropdown", "FormDropdownItem", "FormSeparator":
            view = ContainerView(model: model, handlerExecutor: handlerExecutor)

        case "button", "Button":
            view = ButtonNodeView(model: model, handlerExecutor: handlerExecutor)

        case "input", "Input":
            view = InputNodeView(model: model, handlerExecutor: handlerExecutor)

        case "Switch":
            view = SwitchNodeView(model: model, handlerExecutor: handlerExecutor)

        case "Toggle":
            view = ToggleNodeView(model: model, handlerExecutor: handlerExecutor)

        default:
            view = UnknownNodeView(type: model.type)
        }

        model.associatedView = view
        return view
    }

    /// Update an existing view with new model data.
    static func updateView(
        _ view: NSView,
        from oldModel: NodeViewModel,
        to newModel: NodeViewModel,
        handlerExecutor: @escaping HandlerExecutor
    ) {
        if let updatable = view as? UpdatableNodeView {
            updatable.update(from: oldModel, to: newModel, handlerExecutor: handlerExecutor)
        }
    }

    /// Find the most specific view that should receive focus when plugin content first appears.
    static func initialFocusTarget(in view: NSView) -> NSView? {
        if let focusable = view as? InitialFocusableNodeView,
           let target = focusable.initialFocusView {
            return target
        }

        for subview in view.subviews {
            if let target = initialFocusTarget(in: subview) {
                return target
            }
        }

        return nil
    }

    /// Give plugin views a chance to handle a command-style shortcut.
    static func handleShortcut(in view: NSView, shortcut: String) -> Bool {
        if let handler = view as? ShortcutHandlingNodeView,
           handler.handleShortcut(shortcut) {
            return true
        }

        for subview in view.subviews {
            if handleShortcut(in: subview, shortcut: shortcut) {
                return true
            }
        }

        return false
    }
}

// MARK: - Unknown Node View

/// Fallback view for unsupported node types.
class UnknownNodeView: NSTextField {
    convenience init(type: String) {
        self.init(labelWithString: "Unknown: \(type)")
        self.textColor = .systemRed
        self.font = NSFont.systemFont(ofSize: 11)
    }
}
