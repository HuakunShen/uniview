import AppKit

/// NSTextField for user text input, with onChange handler.
class InputNodeView: NSView, UpdatableNodeView, NSTextFieldDelegate {

    private let label = NSTextField(labelWithString: "")
    private let textField = NSTextField()
    private var handlerId: String?
    private var handlerExecutor: NodeViewFactory.HandlerExecutor?
    private var isUpdatingFromPlugin = false

    convenience init(model: NodeViewModel, handlerExecutor: @escaping NodeViewFactory.HandlerExecutor) {
        self.init(frame: .zero)
        self.handlerExecutor = handlerExecutor

        // Label
        label.isEditable = false
        label.isBordered = false
        label.drawsBackground = false
        label.font = NSFont.systemFont(ofSize: 11)
        label.textColor = .secondaryLabelColor

        // Text field
        textField.delegate = self
        textField.isBordered = true
        textField.bezelStyle = .roundedBezel
        textField.font = NSFont.systemFont(ofSize: NSFont.systemFontSize)

        // Stack layout
        let stack = NSStackView(views: [label, textField])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 4

        addSubview(stack)
        stack.translatesAutoresizingMaskIntoConstraints = false
        textField.translatesAutoresizingMaskIntoConstraints = false
        self.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: topAnchor),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor),
            textField.widthAnchor.constraint(greaterThanOrEqualToConstant: 200),
        ])

        applyModel(model)
    }

    private func applyModel(_ model: NodeViewModel) {
        let labelText = model.props["label"]?.stringValue ?? ""
        label.stringValue = labelText
        label.isHidden = labelText.isEmpty

        textField.placeholderString = model.props["placeholder"]?.stringValue ?? ""

        let value = model.props["value"]?.stringValue ?? ""
        let defaultValue = model.props["defaultValue"]?.stringValue ?? ""
        let displayValue = value.isEmpty ? defaultValue : value

        isUpdatingFromPlugin = true
        textField.stringValue = displayValue
        isUpdatingFromPlugin = false

        textField.isEnabled = !(model.props["disabled"]?.boolValue ?? false)
        handlerId = model.handlerId(for: "onChange")
    }

    func update(
        from oldModel: NodeViewModel,
        to newModel: NodeViewModel,
        handlerExecutor: @escaping NodeViewFactory.HandlerExecutor
    ) {
        self.handlerExecutor = handlerExecutor
        if oldModel.dirtyFields.contains(.props) {
            applyModel(newModel)
        }
    }

    // MARK: - NSTextFieldDelegate

    func controlTextDidChange(_ obj: Notification) {
        guard !isUpdatingFromPlugin,
              let handlerId = handlerId,
              let executor = handlerExecutor else { return }
        executor(handlerId, [.string(textField.stringValue)])
    }
}
