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
        let style = node.style
        let radius = CGFloat(style.borderRadius ?? 0)
        let wantsShadow = style.shadow != nil
        let isGradient = view is GradientView
        let isMaterial = view is NSVisualEffectView

        // Every `.cgColor` below is resolved against whatever appearance is current
        // when this closure runs — so it is stored, not just run, and re-run on
        // every appearance change. See `AppearanceSensitive`.
        let paint: (CALayer) -> Void = { [weak view] layer in
            if let gradientView = view as? GradientView {
                let colors = (style.backgroundGradient ?? [])
                    .compactMap { CSSColor.parse($0)?.cgColor }
                gradientView.setGradientColors(colors)
            } else if !isMaterial {
                // Vibrancy views draw their own background; don't overpaint it.
                layer.backgroundColor = style.backgroundColor.flatMap(CSSColor.parse)?.cgColor
            }

            layer.cornerRadius = radius
            // Clipping to a rounded rect would eat a drop shadow, and `GradientView`
            // clips its own gradient sublayer — so only mask plain rounded fills.
            // `overflow-hidden` asks for the clip explicitly and outranks that.
            let clips = style.overflow == .hidden
            layer.masksToBounds = clips || (radius > 0 && !wantsShadow && !isGradient)
            layer.borderWidth = CGFloat(style.borderWidth ?? 0)
            layer.borderColor = style.borderColor.flatMap(CSSColor.parse)?.cgColor

            // The shadow is geometry now: the theme owns the scale, so a plugin can
            // ask for any elevation instead of the single hardcoded one this used
            // to draw. Alpha rides in the color, the way it does on the web.
            if let shadow = style.shadow {
                let color = CSSColor.parse(style.shadowColor ?? shadow.color)
                layer.shadowColor = color?.cgColor
                layer.shadowOpacity = Float(color?.alphaComponent ?? 0)
                layer.shadowRadius = CGFloat(shadow.radius)
                layer.shadowOffset = CGSize(width: shadow.offsetX, height: shadow.offsetY)
            } else {
                layer.shadowOpacity = 0
            }
            if let z = style.zIndex { layer.zPosition = CGFloat(z) }
        }

        if let sensitive = view as? any AppearanceSensitive {
            sensitive.setRepaint(paint)
        } else if let layer = view.layer {
            view.effectiveAppearance.performAsCurrentDrawingAppearance { paint(layer) }
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
        Self.style(label, with: node.style, text: node.renderedText)
    }

    /// Everything that decides how the text is laid out — the font, the line
    /// height, the line limit. Shared with `intrinsicSize` on purpose: a measurer
    /// that ignores `maxLines` or `leading` sizes the box for text the label is
    /// not going to draw, and the two disagree by exactly the amount that gets
    /// clipped.
    static func style(
        _ label: NSTextField, with style: StyleIR, text: String, measuring: Bool = false
    ) {
        let size = CGFloat(style.fontSize ?? Double(NSFont.systemFontSize))
        var font = NSFont.systemFont(ofSize: size, weight: nsFontWeight(style.fontWeight))
        if style.fontStyle == .italic {
            font =
                NSFontManager.shared.convert(font, toHaveTrait: .italicFontMask)
        }

        // A clamp ends in an ellipsis, at one line or at three — text that simply
        // stops mid-word reads as a rendering bug, not as "there is more".
        //
        // But the *measurer* must not truncate. `.byTruncatingTail` (and
        // `truncatesLastVisibleLine`) make `fittingSize` report a single line's
        // height, so a `line-clamp-2` box would be laid out one line tall and then
        // draw one line — the clamp would silently become `truncate`. So we measure
        // it wrapped to its line limit, and draw it truncated to the same limit.
        // The two clamps need different AppKit settings, and they do not compose:
        // `.byTruncatingTail` collapses a multi-line label back to ONE line, so a
        // `line-clamp-2` set that way lays out two lines tall and draws one. A
        // multi-line clamp keeps word wrapping and asks the *cell* to ellipsize the
        // last visible line instead.
        let limit = style.maxLines ?? 0
        label.maximumNumberOfLines = limit
        label.lineBreakMode = (limit == 1 && !measuring) ? .byTruncatingTail : .byWordWrapping
        label.cell?.truncatesLastVisibleLine = limit > 1 && !measuring

        let paragraph = NSMutableParagraphStyle()
        paragraph.lineBreakMode = label.lineBreakMode
        paragraph.alignment = nsTextAlignment(style.textAlign)
        if let height = style.resolvedLineHeight(fontSize: Double(size)) {
            paragraph.minimumLineHeight = CGFloat(height)
            paragraph.maximumLineHeight = CGFloat(height)
        }

        var attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .paragraphStyle: paragraph,
        ]
        switch style.textDecoration {
        case .underline: attributes[.underlineStyle] = NSUnderlineStyle.single.rawValue
        case .lineThrough: attributes[.strikethroughStyle] = NSUnderlineStyle.single.rawValue
        case .none, .some(.none): break
        }
        if let color = style.color.flatMap(CSSColor.parse) {
            attributes[.foregroundColor] = color
        }

        label.attributedStringValue = NSAttributedString(string: text, attributes: attributes)
        label.alignment = paragraph.alignment
        // The attributed string is what gets drawn, but the cell's own `font` and
        // `textColor` are what everything else reads back — keep them in step so
        // the label never describes itself as something it isn't.
        label.font = font
        if let color = attributes[.foregroundColor] as? NSColor { label.textColor = color }
    }

    /// Measured with a real `NSTextField`, not with the raw string: the cell adds
    /// its own insets, and measuring the glyphs alone comes up a few points
    /// short — just enough for the last word to wrap onto a line the box has no
    /// room for, and get clipped.
    public func intrinsicSize(_ node: ShadowNode, maxWidth: Double) -> Size? {
        let text = node.renderedText
        guard !text.isEmpty else { return nil }

        let ruler = Self.ruler
        Self.style(ruler, with: node.style, text: text, measuring: true)
        ruler.preferredMaxLayoutWidth =
            maxWidth.isFinite ? CGFloat(maxWidth) : CGFloat.greatestFiniteMagnitude
        let fitting = ruler.fittingSize
        return Size(width: ceil(fitting.width), height: ceil(fitting.height))
    }

    /// One off-screen label, reused for every measurement (layout is main-actor).
    private static let ruler: NSTextField = {
        let label = NSTextField(labelWithString: "")
        label.lineBreakMode = .byWordWrapping
        label.maximumNumberOfLines = 0
        return label
    }()
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

    public func intrinsicSize(_ node: ShadowNode, maxWidth: Double) -> Size? {
        let side = (node.style.fontSize ?? 15) + 6
        return Size(width: side, height: side)
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
            // Icon pinned to the leading edge, title centered in the full button
            // width (independent of the icon) — the reference button layout.
            gradient.title = title
            gradient.attributedTitle = NSAttributedString(
                string: title,
                attributes: [
                    .foregroundColor: NSColor.white,
                    .font: NSFont.systemFont(ofSize: 13.5, weight: .semibold),
                ])
            gradient.setLeadingIcon(symbolImage(iconName, template: true))
            gradient.alphaValue = button.isEnabled ? 1 : 0.45
        } else {
            button.title = title
            button.keyEquivalent = ""
            if let image = symbolImage(iconName, template: false) {
                button.image = image
                button.imagePosition = .imageLeading
                button.imageScaling = .scaleProportionallyDown
            } else {
                button.image = nil
            }
        }
        button.bind(handlerId: node.handlerId(for: "onClick"), executor: context.executeHandler)
    }

    /// Title plus the button's own chrome. Never wrapped: a button grows to fit
    /// its label, it doesn't reflow it.
    public func intrinsicSize(_ node: ShadowNode, maxWidth: Double) -> Size? {
        let title = node.props["title"]?.stringValue ?? node.renderedText
        let label = measureText(
            title.isEmpty ? "Button" : title,
            font: NSFont.systemFont(ofSize: 13.5, weight: .semibold),
            maxWidth: .infinity)
        let icon: Double = node.props["icon"] == nil ? 0 : Self.iconWidth
        return Size(width: label.width + icon + Self.horizontalPadding, height: Self.height)
    }

    private static let height: Double = 32
    private static let horizontalPadding: Double = 28
    private static let iconWidth: Double = 22

    private func symbolImage(_ name: String?, template: Bool) -> NSImage? {
        guard let name, let image = NSImage(systemSymbolName: name, accessibilityDescription: nil)
        else { return nil }
        image.isTemplate = template
        return image
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
    private let leadingIcon = NSImageView()

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        isBordered = false
        bezelStyle = .regularSquare
        alignment = .center  // title centered in the full button width
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

        // A separate leading glyph, pinned to the left edge so the title stays
        // centered in the full width regardless of the icon.
        leadingIcon.translatesAutoresizingMaskIntoConstraints = false
        leadingIcon.imageScaling = .scaleProportionallyDown
        leadingIcon.contentTintColor = .white
        leadingIcon.isHidden = true
        addSubview(leadingIcon)
        NSLayoutConstraint.activate([
            leadingIcon.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            leadingIcon.centerYAnchor.constraint(equalTo: centerYAnchor),
            leadingIcon.widthAnchor.constraint(equalToConstant: 17),
            leadingIcon.heightAnchor.constraint(equalToConstant: 17),
        ])
    }

    required init?(coder: NSCoder) { fatalError() }

    func setLeadingIcon(_ image: NSImage?) {
        leadingIcon.image = image
        leadingIcon.isHidden = image == nil
    }

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

    /// A field has a fixed height and no natural width — in a stretch-aligned
    /// column it fills the row, and this width is only the fallback when nothing
    /// stretches it.
    public func intrinsicSize(_ node: ShadowNode, maxWidth: Double) -> Size? {
        Size(width: 200, height: 34)
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
