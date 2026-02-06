import AppKit

/// NSSwitch-style toggle for the Switch component.
/// Maps checked/onChange props to NSSwitch state and action.
class SwitchNodeView: NSView, UpdatableNodeView {

    private let toggle = NSSwitch()
    private var handlerId: String?
    private var handlerExecutor: NodeViewFactory.HandlerExecutor?

    convenience init(model: NodeViewModel, handlerExecutor: @escaping NodeViewFactory.HandlerExecutor) {
        self.init(frame: .zero)
        self.handlerExecutor = handlerExecutor

        toggle.target = self
        toggle.action = #selector(handleToggle)
        toggle.translatesAutoresizingMaskIntoConstraints = false

        addSubview(toggle)
        self.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            toggle.topAnchor.constraint(equalTo: topAnchor),
            toggle.leadingAnchor.constraint(equalTo: leadingAnchor),
            toggle.bottomAnchor.constraint(equalTo: bottomAnchor),
            toggle.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor),
        ])

        applyModel(model)
    }

    private func applyModel(_ model: NodeViewModel) {
        let checked = model.props["checked"]?.boolValue ?? model.props["defaultChecked"]?.boolValue ?? false
        toggle.state = checked ? .on : .off
        toggle.isEnabled = !(model.props["disabled"]?.boolValue ?? false)
        handlerId = model.handlerId(for: "onChange")
    }

    @objc private func handleToggle() {
        guard let handlerId = handlerId, let executor = handlerExecutor else { return }
        let isOn = toggle.state == .on
        executor(handlerId, [.bool(isOn)])
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
}
