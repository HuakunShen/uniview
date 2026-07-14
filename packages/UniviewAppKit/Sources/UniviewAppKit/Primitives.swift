import AppKit
import UniviewNativeCore

// MARK: - View

/// A styled container. Visual style (background/border/radius/opacity) is
/// applied to the backing layer; children are positioned by the layout engine.
@MainActor
public struct ViewComponent: Component {
    public init() {}

    public func makeView(for node: ShadowNode) -> NSView {
        // A `material` prop turns the container into native vibrancy/glass.
        if let material = node.props["material"]?.stringValue, !material.isEmpty {
            let effect = MaterialView()
            effect.material = UniviewMaterial.material(material)
            effect.blendingMode = UniviewMaterial.blendingMode(material)
            effect.state = .active
            effect.wantsLayer = true
            return effect
        }
        let view = FlippedView()
        view.wantsLayer = true
        return view
    }

    public func update(_ view: NSView, node: ShadowNode, context: MountContext) {
        view.wantsLayer = true
        guard let layer = view.layer else { return }
        let style = node.style
        // Vibrancy views draw their own background; don't overpaint it.
        if !(view is NSVisualEffectView) {
            layer.backgroundColor = style.backgroundColor.flatMap(CSSColor.parse)?.cgColor
        }
        let radius = CGFloat(style.borderRadius ?? 0)
        layer.cornerRadius = radius
        layer.masksToBounds = radius > 0
        layer.borderWidth = CGFloat(style.borderWidth ?? 0)
        layer.borderColor = style.borderColor.flatMap(CSSColor.parse)?.cgColor
        view.alphaValue = CGFloat(style.opacity ?? 1)
    }
}

// MARK: - Text

/// A non-editable text label. String comes from flattened `#text` children;
/// typography (size/weight/color/alignment) from the Style IR.
@MainActor
public struct TextComponent: Component {
    public init() {}

    public var mountsChildren: Bool { false }

    public func makeView(for node: ShadowNode) -> NSView {
        let label = NSTextField(labelWithString: "")
        label.lineBreakMode = .byWordWrapping
        label.maximumNumberOfLines = 0
        return label
    }

    public func update(_ view: NSView, node: ShadowNode, context: MountContext) {
        guard let label = view as? NSTextField else { return }
        label.stringValue = node.renderedText

        let style = node.style
        let size = CGFloat(style.fontSize ?? Double(NSFont.systemFontSize))
        let weight: NSFont.Weight
        switch style.fontWeight {
        case .bold: weight = .bold
        case .semibold: weight = .semibold
        case .medium: weight = .medium
        case .normal, .none: weight = .regular
        }
        label.font = NSFont.systemFont(ofSize: size, weight: weight)
        if let color = style.color.flatMap(CSSColor.parse) { label.textColor = color }
        switch style.textAlign {
        case .center: label.alignment = .center
        case .right: label.alignment = .right
        case .left, .none: label.alignment = .left
        }
    }
}

// MARK: - Button

/// A native push button. Title from `props.title` or flattened text; fires the
/// `onClick` handler id through the injected executor.
@MainActor
public struct ButtonComponent: Component {
    public init() {}

    public var mountsChildren: Bool { false }

    public func makeView(for node: ShadowNode) -> NSView {
        let button = HandlerButton(frame: .zero)
        button.bezelStyle = .rounded
        return button
    }

    public func update(_ view: NSView, node: ShadowNode, context: MountContext) {
        guard let button = view as? HandlerButton else { return }
        let title = node.props["title"]?.stringValue ?? node.renderedText
        button.title = title.isEmpty ? "Button" : title
        button.isEnabled = !(node.props["disabled"]?.boolValue ?? false)
        // A `variant: "primary"` button becomes the default (accent-filled) button.
        button.keyEquivalent = node.props["variant"]?.stringValue == "primary" ? "\r" : ""
        button.bind(handlerId: node.handlerId(for: "onClick"), executor: context.executeHandler)
    }
}

@MainActor
final class HandlerButton: NSButton {
    private var handlerId: String?
    private var executor: HandlerExecutor?

    func bind(handlerId: String?, executor: @escaping HandlerExecutor) {
        self.handlerId = handlerId
        self.executor = executor
        target = self
        action = #selector(fire)
    }

    @objc private func fire() {
        guard let handlerId, let executor else { return }
        executor(handlerId, [])
    }
}

// MARK: - TextInput

/// A single-line text field. Fires `onChange` with the current string, with an
/// `isUpdatingFromHost` guard so host-driven value updates don't echo back
/// (the classic two-way-binding feedback loop).
@MainActor
public struct TextInputComponent: Component {
    public init() {}

    public var mountsChildren: Bool { false }

    public func makeView(for node: ShadowNode) -> NSView {
        let field = HandlerTextField(frame: .zero)
        field.configure()
        return field
    }

    public func update(_ view: NSView, node: ShadowNode, context: MountContext) {
        guard let field = view as? HandlerTextField else { return }
        field.placeholderString = node.props["placeholder"]?.stringValue ?? ""
        let value = node.props["value"]?.stringValue ?? ""
        let defaultValue = node.props["defaultValue"]?.stringValue ?? ""
        field.setValueFromHost(value.isEmpty ? defaultValue : value)
        field.isEnabled = !(node.props["disabled"]?.boolValue ?? false)
        field.bind(handlerId: node.handlerId(for: "onChange"), executor: context.executeHandler)
    }
}

@MainActor
final class HandlerTextField: NSTextField, NSTextFieldDelegate {
    private var handlerId: String?
    private var executor: HandlerExecutor?
    private var isUpdatingFromHost = false

    func configure() {
        delegate = self
        isBordered = true
        bezelStyle = .roundedBezel
        isEditable = true
        isSelectable = true
    }

    func bind(handlerId: String?, executor: @escaping HandlerExecutor) {
        self.handlerId = handlerId
        self.executor = executor
    }

    func setValueFromHost(_ value: String) {
        guard value != stringValue else { return }
        isUpdatingFromHost = true
        stringValue = value
        isUpdatingFromHost = false
    }

    func controlTextDidChange(_ obj: Notification) {
        guard !isUpdatingFromHost, let handlerId, let executor else { return }
        executor(handlerId, [.string(stringValue)])
    }
}

// MARK: - Unknown (fallback)

/// Visible placeholder for unregistered node types — never silently dropped.
@MainActor
public struct UnknownComponent: Component {
    public init() {}

    public var mountsChildren: Bool { false }

    public func makeView(for node: ShadowNode) -> NSView {
        NSTextField(labelWithString: "")
    }

    public func update(_ view: NSView, node: ShadowNode, context: MountContext) {
        guard let label = view as? NSTextField else { return }
        label.stringValue = "Unknown: \(node.type)"
        label.textColor = .systemRed
    }
}
