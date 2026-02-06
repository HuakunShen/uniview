import AppKit

// MARK: - List Container (ul/ol)

/// NSStackView for ul/ol lists with left indentation.
class ListContainerView: NSStackView, UpdatableNodeView {

    convenience init(model: NodeViewModel, handlerExecutor: @escaping NodeViewFactory.HandlerExecutor) {
        self.init(views: [])
        self.orientation = .vertical
        self.alignment = .leading
        self.spacing = 4
        self.edgeInsets = NSEdgeInsets(top: 0, left: 16, bottom: 0, right: 0)

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
        // Children are reconciled by TreeReconciler
    }
}

// MARK: - List Item (li)

/// Horizontal stack with bullet + content for li items.
class ListItemView: NSStackView, UpdatableNodeView {

    private let bulletLabel = NSTextField(labelWithString: "\u{2022}")
    private let contentLabel = NSTextField(labelWithString: "")

    convenience init(model: NodeViewModel, handlerExecutor: @escaping NodeViewFactory.HandlerExecutor) {
        self.init(views: [])
        self.orientation = .horizontal
        self.alignment = .top
        self.spacing = 8

        bulletLabel.isEditable = false
        bulletLabel.isBordered = false
        bulletLabel.drawsBackground = false

        contentLabel.isEditable = false
        contentLabel.isSelectable = true
        contentLabel.isBordered = false
        contentLabel.drawsBackground = false
        contentLabel.lineBreakMode = .byWordWrapping
        contentLabel.maximumNumberOfLines = 0
        contentLabel.stringValue = model.textContent
        contentLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        self.addArrangedSubview(bulletLabel)
        self.addArrangedSubview(contentLabel)
    }

    func update(
        from oldModel: NodeViewModel,
        to newModel: NodeViewModel,
        handlerExecutor: @escaping NodeViewFactory.HandlerExecutor
    ) {
        if oldModel.dirtyFields.contains(.text) {
            contentLabel.stringValue = newModel.textContent
        }
    }
}
