import AppKit
import UniviewNativeCore

// MARK: - View

/// A styled container. Visual style (background/gradient/border/radius/shadow) is
/// applied to the backing layer; children are positioned by the layout engine.
@MainActor
public struct ViewComponent: Component {
    public init() {}

    /// One `View` node backs four different kinds of AppKit view. The mounter
    /// recreates the view when this changes — reuse keyed on the node *type*
    /// alone meant a `<div>` that grew a `material` or `overflow-scroll` kept its
    /// old plain view forever, and the prop looked dead.
    public func viewKind(for node: ShadowNode) -> String {
        if let material = node.props["material"]?.stringValue, !material.isEmpty {
            return "View.material"
        }
        if node.style.overflow == .scroll { return "View.scroll" }
        if node.style.backgroundGradient != nil { return "View.gradient" }
        return "View"
    }

    /// A scroll view's children belong to its document, not to itself.
    public func contentView(of view: NSView) -> NSView {
        (view as? ScrollView)?.content ?? view
    }

    /// The content's size is only known once its children have frames.
    public func didApplyLayout(_ view: NSView, node: ShadowNode) {
        guard let scroll = view as? ScrollView else { return }
        var width = 0.0
        var height = 0.0
        for child in node.children where !child.isTextNode {
            width = max(width, child.layout.x + child.layout.width)
            height = max(height, child.layout.y + child.layout.height)
        }
        // Yoga's child positions already include the leading padding; the trailing
        // edge is ours to add, or the last row would sit flush against the bottom.
        width += node.style.paddingRight ?? 0
        height += node.style.paddingBottom ?? 0
        scroll.sizeDocument(to: NSSize(width: width, height: height))
    }

    public func makeView(for node: ShadowNode) -> NSView {
        // `overflow-scroll` is a real NSScrollView, not a clipped box.
        if node.style.overflow == .scroll {
            return ScrollView()
        }
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
        let base = node.style
        let isGradient = view is GradientView
        let isMaterial = view is NSVisualEffectView

        // A tracking area costs something and most views never hover, so only the
        // ones whose style actually mentions `hover:` / `active:` get one.
        if let flipped = view as? FlippedView {
            flipped.tracksPointer = (base.variants ?? [:]).keys.contains {
                $0.contains("hover") || $0.contains("active")
            }
        }

        // The keys this node asked for — and *only* those — are taken from the
        // responder chain. See `Keyboard.swift`.
        if let responder = view as? any KeyResponder {
            responder.keyInterest = KeyInterest(node: node, executor: context.executeHandler)
            responder.autoFocuses = node.props["autoFocus"]?.boolValue ?? false
        }

        // Both the style-for-this-state and every `.cgColor` in it are resolved
        // inside this closure, because both depend on state the view owns and we
        // do not: the appearance it ended up in, and where the pointer is. It is
        // stored, not merely run, and re-run whenever that changes.
        // See `StyleStateView`.
        let paint: (CALayer, Set<String>) -> Void = { [weak view] layer, state in
            let style = base.resolved(for: state)
            let radius = CGFloat(style.borderRadius ?? 0)
            let wantsShadow = style.shadow != nil

            if let gradientView = view as? GradientView, let fill = style.backgroundGradient {
                gradientView.setGradient(
                    colors: fill.colors.compactMap { CSSColor.parse($0)?.cgColor },
                    direction: fill.direction)
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

        if let stateful = view as? any StyleStateView {
            stateful.setRepaint(paint)
        } else if let layer = view.layer {
            view.effectiveAppearance.performAsCurrentDrawingAppearance { paint(layer, []) }
        }
        view.alphaValue = CGFloat(base.opacity ?? 1)
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

/// A push button. Title from `props.title` or flattened text, optional leading
/// `icon`; fires `onClick` through the executor.
///
/// It has **no variants**. It used to: `variant: "primary"` painted a blue→violet
/// diagonal and a matching colored shadow — Uniview's brand, compiled into the
/// renderer, unreachable from the tree, and waiting to be copy-pasted into every
/// new platform. A renderer that knows what "primary" looks like is a renderer
/// with a design system inside it, and it can host exactly one product.
///
/// So: style the button and it is drawn from the Style IR; style nothing and you
/// get the real native bezel button, which is what a macOS button *should* look
/// like by default. Whose blue it is, is the plugin's business.
@MainActor
public struct ButtonComponent: Component {
    public init() {}

    public var mountsChildren: Bool { false }

    public func makeView(for node: ShadowNode) -> NSView {
        StyledButton(frame: .zero)
    }

    public func update(_ view: NSView, node: ShadowNode, context: MountContext) {
        guard let button = view as? StyledButton else { return }
        let style = node.style
        let raw = node.props["title"]?.stringValue ?? node.renderedText
        let title = raw.isEmpty ? "Button" : raw

        button.isEnabled = !(node.props["disabled"]?.boolValue ?? false)
        button.apply(style: style, title: title, icon: node.props["icon"]?.stringValue)
        button.bind(handlerId: node.handlerId(for: "onClick"), executor: context.executeHandler)
    }

    /// Title plus the button's own chrome. Never wrapped: a button grows to fit
    /// its label, it doesn't reflow it.
    public func intrinsicSize(_ node: ShadowNode, maxWidth: Double) -> Size? {
        let title = node.props["title"]?.stringValue ?? node.renderedText
        let label = measureText(
            title.isEmpty ? "Button" : title,
            font: nsFont(for: node.style, defaultSize: Self.fontSize),
            maxWidth: .infinity)
        let icon: Double = node.props["icon"] == nil ? 0 : Self.iconWidth
        let padding =
            (node.style.paddingLeft ?? Self.horizontalPadding / 2)
            + (node.style.paddingRight ?? Self.horizontalPadding / 2)
        return Size(
            width: label.width + icon + padding,
            height: node.style.height.flatMap(points) ?? Self.height)
    }

    private static let fontSize: Double = 13.5
    private static let height: Double = 32
    private static let horizontalPadding: Double = 28
    private static let iconWidth: Double = 22

    private func points(_ dimension: StyleDimension) -> Double? {
        if case .points(let value) = dimension { return value }
        return nil
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

/// A button that looks like whatever the Style IR says, and like a *native
/// button* when the IR says nothing.
///
/// The two modes are not two designs; they are "the plugin painted this" and
/// "the plugin didn't". Only the first needs a layer, and the second must stay a
/// genuine `NSButton` bezel — the whole point of rendering natively is that an
/// unstyled button is indistinguishable from every other button on the machine.
@MainActor
final class StyledButton: HandlerButton, StyleStateView {
    var repaint: ((CALayer, Set<String>) -> Void)?

    // A button is where `hover:` earns its keep, so it always tracks the pointer.
    var isHovered = false {
        didSet { if isHovered != oldValue { repaintNow() } }
    }
    var isPressed = false {
        didSet { if isPressed != oldValue { repaintNow() } }
    }
    private var pointerArea: NSTrackingArea?

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let pointerArea { removeTrackingArea(pointerArea) }
        let area = NSTrackingArea(
            rect: bounds,
            options: [.mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect],
            owner: self)
        addTrackingArea(area)
        pointerArea = area
    }

    override func mouseEntered(with event: NSEvent) { isHovered = true }
    override func mouseExited(with event: NSEvent) {
        isHovered = false
        isPressed = false
    }
    override func mouseDown(with event: NSEvent) {
        isPressed = true
        super.mouseDown(with: event)  // the click still has to reach the handler
        isPressed = false
    }

    private let gradient = CAGradientLayer()
    private let leadingIcon = NSImageView()

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        setButtonType(.momentaryChange)

        gradient.masksToBounds = true
        layer?.insertSublayer(gradient, at: 0)

        // A separate leading glyph, pinned to the left edge, so the title stays
        // centered in the full width regardless of whether there is an icon.
        leadingIcon.translatesAutoresizingMaskIntoConstraints = false
        leadingIcon.imageScaling = .scaleProportionallyDown
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

    override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance()
        repaintNow()
    }

    func apply(style: StyleIR, title: String, icon: String?) {
        // "Did the plugin paint this?" is the only question. A fill is the signal:
        // borders and radii alone would leave a bezel button with a rectangle
        // drawn over it.
        let painted = style.backgroundColor != nil || style.backgroundGradient != nil
        isBordered = !painted
        bezelStyle = painted ? .regularSquare : .rounded
        alignment = painted ? .center : .center
        alphaValue = isEnabled ? 1 : 0.45

        let image = icon.flatMap {
            NSImage(systemSymbolName: $0, accessibilityDescription: nil)
        }

        if painted {
            image?.isTemplate = true
            leadingIcon.image = image
            leadingIcon.isHidden = image == nil
            leadingIcon.contentTintColor = style.color.flatMap(CSSColor.parse) ?? .labelColor
            self.image = nil

            let font = nsFont(for: style, defaultSize: 13.5)
            attributedTitle = NSAttributedString(
                string: title,
                attributes: [
                    .foregroundColor: style.color.flatMap(CSSColor.parse) ?? NSColor.labelColor,
                    .font: font,
                ])
        } else {
            leadingIcon.image = nil
            leadingIcon.isHidden = true
            self.title = title
            keyEquivalent = ""
            self.image = image
            if image != nil {
                imagePosition = .imageLeading
                imageScaling = .scaleProportionallyDown
            }
        }

        setRepaint { [weak self] layer, state in
            guard let self else { return }
            // The title and the glyph are re-tinted here too, not just the layer:
            // `hover:text-foreground` is at least as common as `hover:bg-muted`,
            // and a button whose background responds to the pointer while its
            // label doesn't looks broken in a way that's hard to name.
            let style = style.resolved(for: state)
            if painted {
                self.leadingIcon.contentTintColor =
                    style.color.flatMap(CSSColor.parse) ?? .labelColor
                self.attributedTitle = NSAttributedString(
                    string: title,
                    attributes: [
                        .foregroundColor: style.color.flatMap(CSSColor.parse)
                            ?? NSColor.labelColor,
                        .font: nsFont(for: style, defaultSize: 13.5),
                    ])
            }
            guard painted else {
                self.gradient.isHidden = true
                layer.backgroundColor = nil
                layer.borderWidth = 0
                layer.shadowOpacity = 0
                return
            }
            let radius = CGFloat(style.borderRadius ?? 0)

            if let fill = style.backgroundGradient {
                let (start, end) = fill.direction.unit
                self.gradient.isHidden = false
                self.gradient.colors = fill.colors.compactMap { CSSColor.parse($0)?.cgColor }
                self.gradient.startPoint = CGPoint(x: start.x, y: start.y)
                self.gradient.endPoint = CGPoint(x: end.x, y: end.y)
                self.gradient.cornerRadius = radius
                layer.backgroundColor = nil
            } else {
                self.gradient.isHidden = true
                layer.backgroundColor = style.backgroundColor.flatMap(CSSColor.parse)?.cgColor
            }

            layer.cornerRadius = radius
            layer.borderWidth = CGFloat(style.borderWidth ?? 0)
            layer.borderColor = style.borderColor.flatMap(CSSColor.parse)?.cgColor

            // A shadow needs to escape the bounds; a rounded fill needs to be
            // clipped by them. The gradient sublayer carries its own corner
            // radius so the fill stays rounded either way.
            if let shadow = style.shadow {
                let color = CSSColor.parse(style.shadowColor ?? shadow.color)
                layer.masksToBounds = false
                layer.shadowColor = color?.cgColor
                layer.shadowOpacity = Float(color?.alphaComponent ?? 0)
                layer.shadowRadius = CGFloat(shadow.radius)
                layer.shadowOffset = CGSize(width: shadow.offsetX, height: shadow.offsetY)
            } else {
                layer.shadowOpacity = 0
                layer.masksToBounds = radius > 0
            }
        }
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
        field.keyInterest = KeyInterest(node: node, executor: context.executeHandler)
        if node.props["autoFocus"]?.boolValue == true { container.focusFieldOnce() }
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

    /// `autoFocus` — put the caret in the field on mount, and only on mount: a
    /// re-render must not drag the caret back to the start of what the user is
    /// typing, and this component re-renders on every keystroke.
    private var hasAutoFocused = false
    func focusFieldOnce() {
        guard !hasAutoFocused else { return }
        hasAutoFocused = true
        // The view is not in a window yet on the first commit; `viewDidMoveToWindow`
        // is where it becomes possible to hold focus at all.
        if window != nil { window?.makeFirstResponder(field) } else { wantsFocusOnMount = true }
    }
    private var wantsFocusOnMount = false

    public override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if wantsFocusOnMount, window != nil {
            wantsFocusOnMount = false
            window?.makeFirstResponder(field)
        }
    }

    private func setFocused(_ value: Bool) {
        focused = value
        updateColors()
    }

    private func updateColors() {
        effectiveAppearance.performAsCurrentDrawingAppearance { [self] in
            layer?.backgroundColor = NSColor.labelColor.withAlphaComponent(0.06).cgColor
            layer?.borderColor =
                (focused ? NSColor.controlAccentColor.withAlphaComponent(0.85) : NSColor.separatorColor)
                .cgColor
            iconView.contentTintColor = focused ? .controlAccentColor : .secondaryLabelColor
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

    /// The keys this field declared with `keyDownEvents`.
    ///
    /// A focused field does not receive `keyDown` at all: the *field editor* (a
    /// shared `NSTextView`) is the first responder, and it has already turned the
    /// press into an editing command — `moveDown:`, `cancelOperation:` — by the
    /// time anything else could see it. That is why a search field cannot drive a
    /// list below it with the arrow keys unless it says so here: the keys were
    /// never lost, they were *consumed*, correctly, by the thing that had focus.
    ///
    /// So the interception happens where the command is dispatched, and it is
    /// still opt-in: a field that declared `ArrowDown` moves the selection instead
    /// of the caret, and a field that declared nothing behaves exactly like every
    /// other `NSTextField` on the machine.
    var keyInterest = KeyInterest()

    func control(_ control: NSControl, textView: NSTextView, doCommandBy command: Selector) -> Bool {
        keyInterest.handle(command: command)
    }

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
