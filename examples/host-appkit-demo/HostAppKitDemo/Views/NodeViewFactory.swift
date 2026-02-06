import AppKit

/// Protocol for NSViews that can be updated in-place from a NodeViewModel.
protocol UpdatableNodeView: NSView {
    func update(
        from oldModel: NodeViewModel,
        to newModel: NodeViewModel,
        handlerExecutor: @escaping NodeViewFactory.HandlerExecutor
    )
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

        case "ul", "ol":
            view = ListContainerView(model: model, handlerExecutor: handlerExecutor)

        case "li":
            view = ListItemView(model: model, handlerExecutor: handlerExecutor)

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
