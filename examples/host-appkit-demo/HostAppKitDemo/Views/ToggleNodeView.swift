import AppKit

/// NSButton with on/off state for the Toggle component.
/// Maps pressed/onClick props to button state and action.
class ToggleNodeView: NSButton, UpdatableNodeView {

    private var handlerId: String?
    private var handlerExecutor: NodeViewFactory.HandlerExecutor?

    convenience init(model: NodeViewModel, handlerExecutor: @escaping NodeViewFactory.HandlerExecutor) {
        self.init(frame: .zero)
        self.handlerExecutor = handlerExecutor
        self.setButtonType(.pushOnPushOff)
        self.bezelStyle = .rounded

        applyModel(model)

        self.target = self
        self.action = #selector(handleClick)
    }

    private func applyModel(_ model: NodeViewModel) {
        let title = model.textContent.isEmpty ? "Toggle" : model.textContent
        self.title = title

        let pressed = model.props["pressed"]?.boolValue ?? model.props["defaultPressed"]?.boolValue ?? false
        self.state = pressed ? .on : .off
        self.isEnabled = !(model.props["disabled"]?.boolValue ?? false)
        handlerId = model.handlerId(for: "onClick")
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
            applyModel(newModel)
        }
    }
}
