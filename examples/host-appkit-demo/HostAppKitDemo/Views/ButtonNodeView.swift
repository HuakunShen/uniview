import AppKit

/// NSButton that triggers an RPC handler on click.
class ButtonNodeView: NSButton, UpdatableNodeView {

    private var handlerId: String?
    private var handlerExecutor: NodeViewFactory.HandlerExecutor?

    convenience init(model: NodeViewModel, handlerExecutor: @escaping NodeViewFactory.HandlerExecutor) {
        self.init(frame: .zero)
        self.handlerExecutor = handlerExecutor
        self.bezelStyle = .rounded
        self.controlSize = .regular

        let titleFromProp = model.props["title"]?.stringValue
        let title = titleFromProp ?? (model.textContent.isEmpty ? "Button" : model.textContent)
        self.title = title

        self.handlerId = model.handlerId(for: "onClick")
        self.isEnabled = !(model.props["disabled"]?.boolValue ?? false)
        self.target = self
        self.action = #selector(handleClick)
    }

    @objc private func handleClick() {
        guard let handlerId = handlerId, let executor = handlerExecutor else { return }
        executor(handlerId, [])
    }

    func update(
        from oldModel: NodeViewModel,
        to newModel: NodeViewModel,
        handlerExecutor: @escaping NodeViewFactory.HandlerExecutor
    ) {
        self.handlerExecutor = handlerExecutor

        if oldModel.dirtyFields.contains(.props) || oldModel.dirtyFields.contains(.text) {
            let titleFromProp = newModel.props["title"]?.stringValue
            let title = titleFromProp ?? (newModel.textContent.isEmpty ? "Button" : newModel.textContent)
            self.title = title
            self.handlerId = newModel.handlerId(for: "onClick")
            self.isEnabled = !(newModel.props["disabled"]?.boolValue ?? false)
        }
    }
}
