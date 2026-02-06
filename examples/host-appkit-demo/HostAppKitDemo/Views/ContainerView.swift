import AppKit

/// NSStackView-based container for div, section, form, etc.
/// Vertical by default; switches to horizontal if className contains "flex" without "flex-col".
class ContainerView: NSStackView, UpdatableNodeView {

    convenience init(model: NodeViewModel, handlerExecutor: @escaping NodeViewFactory.HandlerExecutor) {
        self.init(views: [])
        self.orientation = .vertical
        self.alignment = .leading
        self.spacing = 8
        self.edgeInsets = NSEdgeInsets(top: 4, left: 8, bottom: 4, right: 8)

        applyLayoutHints(from: model.props)

        // Create child views
        for child in model.children {
            let childView = NodeViewFactory.createView(for: child, handlerExecutor: handlerExecutor)
            self.addArrangedSubview(childView)
        }
    }

    func update(
        from oldModel: NodeViewModel,
        to newModel: NodeViewModel,
        handlerExecutor: @escaping NodeViewFactory.HandlerExecutor
    ) {
        if oldModel.dirtyFields.contains(.props) {
            applyLayoutHints(from: newModel.props)
        }
        // Children are reconciled by TreeReconciler, not here
    }

    private func applyLayoutHints(from props: [String: JSONValue]) {
        if let className = props["className"]?.stringValue {
            if className.contains("flex") && !className.contains("flex-col") {
                self.orientation = .horizontal
            } else {
                self.orientation = .vertical
            }
        }
    }
}
