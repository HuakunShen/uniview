import AppKit
import UniviewNativeCore

// MARK: - View

/// A styled container. Visual style (background/gradient/border/radius/shadow) is
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
        // A gradient fill needs a layer that tracks bounds/corner radius.
        if node.style.backgroundGradient != nil {
            let gradient = GradientView()
            gradient.wantsLayer = true
            return gradient
        }
        let view = FlippedView()
        view.wantsLayer = true
        return view
    }

    public func update(_ view: NSView, node: ShadowNode, context: MountContext) {
        view.wantsLayer = true
        guard let layer = view.layer else { return }
        let style = node.style
        let radius = CGFloat(style.borderRadius ?? 0)
        let wantsShadow = style.shadow != nil

        if let gradientView = view as? GradientView {
            let colors = (style.backgroundGradient ?? []).compactMap { CSSColor.parse($0)?.cgColor }
            gradientView.setGradientColors(colors)
        } else if !(view is NSVisualEffectView) {
            // Vibrancy views draw their own background; don't overpaint it.
            layer.backgroundColor = style.backgroundColor.flatMap(CSSColor.parse)?.cgColor
        }

        layer.cornerRadius = radius
        // Clipping to a rounded rect would eat a drop shadow, and `GradientView`
        // clips its own gradient sublayer — so only mask plain rounded fills.
        layer.masksToBounds = radius > 0 && !wantsShadow && !(view is GradientView)
        layer.borderWidth = CGFloat(style.borderWidth ?? 0)
        layer.borderColor = style.borderColor.flatMap(CSSColor.parse)?.cgColor

        if let shadow = style.shadow {
            let color = CSSColor.parse(shadow) ?? univiewBrandColor
            layer.shadowColor = color.cgColor
            layer.shadowOpacity = 0.26
            layer.shadowRadius = 16
            layer.shadowOffset = CGSize(width: 0, height: 8)
        } else {
            layer.shadowOpacity = 0
        }
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
        label.font = NSFont.systemFont(ofSize: size, weight: nsFontWeight(style.fontWeight))
        if let color = style.color.flatMap(CSSColor.parse) { label.textColor = color }
        switch style.textAlign {
        case .center: label.alignment = .center
        case .right: label.alignment = .right
        case .left, .none: label.alignment = .left
        }
    }
}

// MARK: - Icon

/// A native SF Symbol image (`NSImageView`). `symbol`/`name` picks the glyph;
/// `fontSize`/`fontWeight`/`color` from the Style IR size and tint it. Used for
/// header chips, field glyphs, and inline accents.
@MainActor
public struct IconComponent: Component {
    public init() {}

    public var mountsChildren: Bool { false }

    public func makeView(for node: ShadowNode) -> NSView {
        let imageView = NSImageView()
        imageView.imageScaling = .scaleProportionallyUpOrDown
        imageView.imageAlignment = .alignCenter
        return imageView
    }

    public func update(_ view: NSView, node: ShadowNode, context: MountContext) {
        guard let imageView = view as? NSImageView else { return }
        let symbol =
            node.props["symbol"]?.stringValue
            ?? node.props["name"]?.stringValue
            ?? node.renderedText
        let glyph = symbol.isEmpty ? "questionmark" : symbol
        let image = NSImage(systemSymbolName: glyph, accessibilityDescription: nil)
        image?.isTemplate = true
        imageView.image = image
        let size = CGFloat(node.style.fontSize ?? 15)
        imageView.symbolConfiguration = NSImage.SymbolConfiguration(
            pointSize: size, weight: nsFontWeight(node.style.fontWeight))
        imageView.contentTintColor = node.style.color.flatMap(CSSColor.parse) ?? .labelColor
    }
}

// MARK: - Button

/// A native push button. Non-primary is a plain rounded button; `variant:
/// "primary"` renders a brand-gradient button. Title from `props.title` or
/// flattened text, optional leading `icon`; fires `onClick` through the executor.
@MainActor
public struct ButtonComponent: Component {
    public init() {}

    public var mountsChildren: Bool { false }

    public func makeView(for node: ShadowNode) -> NSView {
        if node.props["variant"]?.stringValue == "primary" {
            return GradientButton(frame: .zero)
        }
        let button = HandlerButton(frame: .zero)
        button.bezelStyle = .rounded
        return button
    }

    public func update(_ view: NSView, node: ShadowNode, context: MountContext) {
        guard let button = view as? HandlerButton else { return }
        let raw = node.props["title"]?.stringValue ?? node.renderedText
        let title = raw.isEmpty ? "Button" : raw
        button.isEnabled = !(node.props["disabled"]?.boolValue ?? false)
        let iconName = node.props["icon"]?.stringValue

        if let gradient = button as? GradientButton {
            gradient.title = title
            gradient.attributedTitle = NSAttributedString(
                string: title,
                attributes: [
                    .foregroundColor: NSColor.white,
                    .font: NSFont.systemFont(ofSize: 13.5, weight: .semibold),
                ])
            gradient.contentTintColor = .white
            applyIcon(iconName, to: gradient, template: true)
            gradient.alphaValue = button.isEnabled ? 1 : 0.45
        } else {
            button.title = title
            button.keyEquivalent = ""
            applyIcon(iconName, to: button, template: false)
        }
        button.bind(handlerId: node.handlerId(for: "onClick"), executor: context.executeHandler)
    }

    private func applyIcon(_ name: String?, to button: NSButton, template: Bool) {
        guard let name, let image = NSImage(systemSymbolName: name, accessibilityDescription: nil)
        else {
            button.image = nil
            return
        }
        image.isTemplate = template
        button.image = image
        button.imagePosition = .imageLeading
        button.imageScaling = .scaleProportionallyDown
    }
}

@MainActor
class HandlerButton: NSButton {
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

/// The brand-gradient primary button: a custom-drawn `HandlerButton` with a
/// diagonal brand fill, white title, rounded corners and a soft brand shadow —
/// still a real `NSControl` firing the same handler path.
@MainActor
final class GradientButton: HandlerButton {
    private let gradient = CAGradientLayer()

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        isBordered = false
        bezelStyle = .regularSquare
        setButtonType(.momentaryChange)

        gradient.colors = univiewBrandGradient
        gradient.startPoint = CGPoint(x: 0, y: 0)
        gradient.endPoint = CGPoint(x: 1, y: 1)
        gradient.cornerRadius = 10
        gradient.masksToBounds = true
        layer?.insertSublayer(gradient, at: 0)

        layer?.masksToBounds = false
        layer?.shadowColor = univiewBrandColor.cgColor
        layer?.shadowOpacity = 0.32
        layer?.shadowRadius = 8
        layer?.shadowOffset = CGSize(width: 0, height: -3)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func layout() {
        super.layout()
        gradient.frame = bounds
    }
}

// MARK: - TextInput

/// A single-line text field. Fires `onChange` with the current string, with an
/// `isUpdatingFromHost` guard so host-driven value updates don't echo back
/// (the classic two-way-binding feedback loop). Rendered inside a rounded,
/// inset `StyledFieldView` with an optional leading glyph.
@MainActor
public struct TextInputComponent: Component {
    public init() {}

    public var mountsChildren: Bool { false }

    public func makeView(for node: ShadowNode) -> NSView {
        StyledFieldView(iconName: node.props["icon"]?.stringValue)
    }

    public func update(_ view: NSView, node: ShadowNode, context: MountContext) {
        guard let container = view as? StyledFieldView else { return }
        let field = container.field
        field.placeholderString = node.props["placeholder"]?.stringValue ?? ""
        let value = node.props["value"]?.stringValue ?? ""
        let defaultValue = node.props["defaultValue"]?.stringValue ?? ""
        field.setValueFromHost(value.isEmpty ? defaultValue : value)
        field.isEnabled = !(node.props["disabled"]?.boolValue ?? false)
        field.bind(handlerId: node.handlerId(for: "onChange"), executor: context.executeHandler)
    }
}

/// A rounded, inset field: a subtle translucent fill + hairline that turns brand
/// on focus, an optional leading SF Symbol, and a borderless text field. Mirrors
/// the reference app's `CCField`. The composite lays out its own internals, so
/// the layout engine treats it as a single leaf box.
@MainActor
public final class StyledFieldView: NSView {
    let field = HandlerTextField(frame: .zero)
    private let iconView = NSImageView()
    private let hasIcon: Bool
    private var focused = false

    public override var isFlipped: Bool { true }

    public init(iconName: String?) {
        hasIcon = !(iconName ?? "").isEmpty
        super.init(frame: .zero)
        wantsLayer = true
        layer?.cornerRadius = 10
        layer?.borderWidth = 1

        field.configurePlain()
        field.translatesAutoresizingMaskIntoConstraints = false
        addSubview(field)

        if hasIcon, let iconName,
            let image = NSImage(systemSymbolName: iconName, accessibilityDescription: nil)
        {
            image.isTemplate = true
            iconView.image = image
            iconView.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 13, weight: .regular)
            iconView.translatesAutoresizingMaskIntoConstraints = false
            addSubview(iconView)
            NSLayoutConstraint.activate([
                iconView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 11),
                iconView.centerYAnchor.constraint(equalTo: centerYAnchor),
                iconView.widthAnchor.constraint(equalToConstant: 18),
                field.leadingAnchor.constraint(equalTo: iconView.trailingAnchor, constant: 8),
            ])
        } else {
            field.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12).isActive = true
        }
        NSLayoutConstraint.activate([
            field.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
            field.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])

        field.onFocusChange = { [weak self] in self?.setFocused($0) }
        updateColors()
    }

    public required init?(coder: NSCoder) { fatalError() }

    private func setFocused(_ value: Bool) {
        focused = value
        updateColors()
    }

    private func updateColors() {
        effectiveAppearance.performAsCurrentDrawingAppearance { [self] in
            layer?.backgroundColor = NSColor.labelColor.withAlphaComponent(0.06).cgColor
            layer?.borderColor =
                (focused ? univiewBrandColor.withAlphaComponent(0.85) : NSColor.separatorColor)
                .cgColor
            iconView.contentTintColor = focused ? univiewBrandColor : .secondaryLabelColor
        }
    }

    public override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance()
        updateColors()
    }
}

@MainActor
final class HandlerTextField: NSTextField, NSTextFieldDelegate {
    private var handlerId: String?
    private var executor: HandlerExecutor?
    private var isUpdatingFromHost = false
    var onFocusChange: ((Bool) -> Void)?

    /// A borderless, transparent field for embedding inside `StyledFieldView`
    /// (which draws the rounded inset chrome around it).
    func configurePlain() {
        delegate = self
        isBordered = false
        isBezeled = false
        drawsBackground = false
        focusRingType = .none
        isEditable = true
        isSelectable = true
        font = .systemFont(ofSize: 13)
        lineBreakMode = .byTruncatingTail
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

    func controlTextDidBeginEditing(_ obj: Notification) { onFocusChange?(true) }
    func controlTextDidEndEditing(_ obj: Notification) { onFocusChange?(false) }
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
