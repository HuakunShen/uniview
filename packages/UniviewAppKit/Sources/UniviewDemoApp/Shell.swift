import AppKit
import UniviewAppKit
import UniviewNativeCore
import UniviewYoga

/// A demo section: a native sidebar entry (SF Symbol + title) paired with the
/// Uniview tree it renders into the content pane.
struct DemoSection {
    let title: String
    let symbol: String
    let tree: () -> UINode
}

// MARK: - Sidebar

/// A Music/Finder-style sidebar row: SF Symbol + label on a soft neutral pill.
/// When selected the label and (filled) symbol tint brand over a quiet
/// `labelColor.opacity(0.08)` pill; hovering shows a fainter pill. Selection is
/// never an accent-filled bar. Mirrors the reference app's `SidebarItemRow`.
@MainActor
final class SidebarRow: NSView {
    private let icon = NSImageView()
    private let label = NSTextField(labelWithString: "")
    private let symbolName: String
    private let index: Int
    private let onClick: (Int) -> Void
    private var tracking: NSTrackingArea?

    var isSelected = false { didSet { restyle() } }
    private var isHovering = false { didSet { restyle() } }

    init(section: DemoSection, index: Int, onClick: @escaping (Int) -> Void) {
        self.symbolName = section.symbol
        self.index = index
        self.onClick = onClick
        super.init(frame: .zero)
        wantsLayer = true
        layer?.cornerRadius = 8

        icon.translatesAutoresizingMaskIntoConstraints = false
        icon.imageScaling = .scaleProportionallyDown

        label.stringValue = section.title
        label.translatesAutoresizingMaskIntoConstraints = false

        addSubview(icon)
        addSubview(label)
        NSLayoutConstraint.activate([
            heightAnchor.constraint(equalToConstant: 30),
            icon.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 8),
            icon.centerYAnchor.constraint(equalTo: centerYAnchor),
            icon.widthAnchor.constraint(equalToConstant: 22),
            label.leadingAnchor.constraint(equalTo: icon.trailingAnchor, constant: 8),
            label.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        restyle()
    }

    required init?(coder: NSCoder) { fatalError() }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let tracking { removeTrackingArea(tracking) }
        let area = NSTrackingArea(
            rect: bounds, options: [.mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect],
            owner: self)
        addTrackingArea(area)
        tracking = area
    }

    override func mouseEntered(with event: NSEvent) { isHovering = true }
    override func mouseExited(with event: NSEvent) { isHovering = false }
    override func mouseDown(with event: NSEvent) { onClick(index) }

    private func restyle() {
        // Filled glyph when selected, outline otherwise (Music/Finder detail).
        let name = isSelected ? "\(symbolName).fill" : symbolName
        icon.image =
            NSImage(systemSymbolName: name, accessibilityDescription: label.stringValue)
            ?? NSImage(systemSymbolName: symbolName, accessibilityDescription: label.stringValue)
        icon.symbolConfiguration = NSImage.SymbolConfiguration(
            pointSize: 13, weight: isSelected ? .semibold : .medium)

        let pill: NSColor
        if isSelected {
            pill = NSColor.labelColor.withAlphaComponent(0.09)
            icon.contentTintColor = univiewBrandColor
            label.textColor = univiewBrandColor
            label.font = .systemFont(ofSize: 13, weight: .semibold)
        } else if isHovering {
            pill = NSColor.labelColor.withAlphaComponent(0.05)
            icon.contentTintColor = .secondaryLabelColor
            label.textColor = .labelColor
            label.font = .systemFont(ofSize: 13, weight: .regular)
        } else {
            pill = .clear
            icon.contentTintColor = .secondaryLabelColor
            label.textColor = .labelColor
            label.font = .systemFont(ofSize: 13, weight: .regular)
        }
        layer?.backgroundColor = pill.cgColor
    }
}

/// The pinned sync-status footer at the bottom of the sidebar: a status dot and
/// a two-line label on a soft glass pill (mirrors the reference's footer).
@MainActor
final class SidebarStatusFooter: NSView {
    override var isFlipped: Bool { true }

    init() {
        super.init(frame: .zero)
        wantsLayer = true
        layer?.cornerRadius = 10
        layer?.backgroundColor = NSColor.labelColor.withAlphaComponent(0.05).cgColor
        layer?.borderWidth = 1
        layer?.borderColor = NSColor.separatorColor.withAlphaComponent(0.6).cgColor

        let dot = NSView()
        dot.wantsLayer = true
        dot.layer?.cornerRadius = 4.5
        dot.layer?.backgroundColor = NSColor.secondaryLabelColor.cgColor
        dot.translatesAutoresizingMaskIntoConstraints = false

        let primary = NSTextField(labelWithString: "Not syncing")
        primary.font = .systemFont(ofSize: 11, weight: .medium)
        primary.textColor = .labelColor
        primary.translatesAutoresizingMaskIntoConstraints = false

        let secondary = NSTextField(labelWithString: "This device")
        secondary.font = .systemFont(ofSize: 10, weight: .regular)
        secondary.textColor = .secondaryLabelColor
        secondary.translatesAutoresizingMaskIntoConstraints = false

        let text = NSStackView(views: [primary, secondary])
        text.orientation = .vertical
        text.alignment = .leading
        text.spacing = 1
        text.translatesAutoresizingMaskIntoConstraints = false

        addSubview(dot)
        addSubview(text)
        NSLayoutConstraint.activate([
            heightAnchor.constraint(equalToConstant: 44),
            dot.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 11),
            dot.centerYAnchor.constraint(equalTo: centerYAnchor),
            dot.widthAnchor.constraint(equalToConstant: 9),
            dot.heightAnchor.constraint(equalToConstant: 9),
            text.leadingAnchor.constraint(equalTo: dot.trailingAnchor, constant: 9),
            text.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -8),
            text.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
    }

    required init?(coder: NSCoder) { fatalError() }
}

/// Configures the sidebar's presentation. Sidebar styling is a design choice,
/// not a standard — so it is a settable option, not hardcoded. Two presets ship:
/// a `floating` glass panel (inset, rounded, traffic lights on the ambience
/// above) and a `fullHeight` sidebar (edge-to-edge, running to the window top
/// with the traffic lights inline). Both sit on the one shared `AmbienceView`.
struct SidebarStyle {
    enum Placement { case floating, fullHeight }

    var placement: Placement
    var material: NSVisualEffectView.Material
    var cornerRadius: CGFloat
    var borderColor: NSColor?
    var borderWidth: CGFloat
    var width: CGFloat

    /// A floating glass panel inset from the window edges (macOS-26-style).
    static let floating = SidebarStyle(
        placement: .floating, material: .hudWindow, cornerRadius: 14,
        // A whisper-thin edge, not a bright hairline.
        borderColor: NSColor.white.withAlphaComponent(0.07), borderWidth: 1, width: 214)

    /// A full-height sidebar with the traffic lights inline (Music/Finder-style).
    static let fullHeight = SidebarStyle(
        placement: .fullHeight, material: .hudWindow, cornerRadius: 0,
        borderColor: nil, borderWidth: 0, width: 240)
}

@MainActor
final class SidebarViewController: NSViewController {
    private let sections: [DemoSection]
    private let style: SidebarStyle
    private let onSelect: (Int) -> Void
    private var rows: [SidebarRow] = []

    init(sections: [DemoSection], style: SidebarStyle, onSelect: @escaping (Int) -> Void) {
        self.sections = sections
        self.style = style
        self.onSelect = onSelect
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func loadView() {
        // The sidebar's OWN surface: a glass panel with a distinct material that
        // sits on the shared ambience. `withinWindow` blending lets a hint of the
        // frost + bloom behind it show through, so it reads as a translucent panel
        // rather than an opaque slab. Corner/border come from the chosen style.
        let root = MaterialView()
        root.material = style.material
        root.blendingMode = .withinWindow
        root.state = .active
        root.wantsLayer = true
        root.layer?.cornerRadius = style.cornerRadius
        root.layer?.masksToBounds = style.cornerRadius > 0
        root.layer?.borderWidth = style.borderWidth
        root.layer?.borderColor = style.borderColor?.cgColor

        let stack = NSStackView()
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 2
        stack.translatesAutoresizingMaskIntoConstraints = false
        for (i, section) in sections.enumerated() {
            let row = SidebarRow(section: section, index: i) { [weak self] in self?.select($0) }
            row.translatesAutoresizingMaskIntoConstraints = false
            rows.append(row)
            stack.addArrangedSubview(row)
            row.widthAnchor.constraint(equalTo: stack.widthAnchor).isActive = true
        }

        let footer = SidebarStatusFooter()
        footer.translatesAutoresizingMaskIntoConstraints = false

        root.addSubview(stack)
        root.addSubview(footer)
        // Anchor to the safe area — it resolves to the panel's own top when the
        // sidebar floats (below the title bar) and to just under the inline
        // traffic lights when it runs full-height. One anchor covers both styles.
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: root.safeAreaLayoutGuide.topAnchor, constant: 8),
            stack.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 10),
            stack.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -10),
            footer.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 10),
            footer.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -10),
            footer.bottomAnchor.constraint(equalTo: root.bottomAnchor, constant: -12),
        ])
        view = root
        select(0)
    }

    private func select(_ index: Int) {
        for (i, row) in rows.enumerated() { row.isSelected = (i == index) }
        onSelect(index)
    }
}

// MARK: - Content pane (transparent — shares the window ambience)

/// The detail pane hosting Uniview content. It is fully transparent: the shared
/// window ambience (frost + brand blooms, drawn once behind the whole scene by
/// `AmbienceView`) shows through, so the background is continuous under the
/// sidebar and content alike — the Music-style look. The Uniview root is inset
/// to the safe area so it clears the transparent title bar.
@MainActor
final class ContentViewController: NSViewController {
    private let host: UniviewHost

    init() {
        host = UniviewHost(
            layoutEngine: YogaLayoutEngine(),
            containerSize: .zero,
            executeHandler: { id, args in
                FileHandle.standardError.write("[uniview] \(id) \(args)\n".data(using: .utf8)!)
            })
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func loadView() {
        view = FlippedView()  // clear; the shared ambience shows through
    }

    func render(_ tree: UINode) {
        host.apply(CommitBatch(revision: nextRevision(), mutations: [.setRoot(node: tree)]))
        placeRoot()
    }

    private var revision = -1
    private func nextRevision() -> Int {
        revision += 1
        return revision
    }

    override func viewDidLayout() {
        super.viewDidLayout()
        let safe = view.safeAreaInsets
        let width = Double(view.bounds.width - safe.left - safe.right)
        let height = Double(view.bounds.height - safe.top - safe.bottom)
        host.setContainerSize(Size(width: max(0, width), height: max(0, height)))
        placeRoot()
    }

    private func placeRoot() {
        guard let root = host.rootView else { return }
        if root.superview !== view { view.addSubview(root) }
        // Offset below the transparent title bar (view is flipped: +y is down).
        let safe = view.safeAreaInsets
        root.frame.origin = CGPoint(x: safe.left, y: safe.top)
    }
}

/// Draws soft brand-colored radial "blooms" that glow through the frost.
final class BloomView: NSView {
    override var isFlipped: Bool { true }
    private let blooms: [(color: NSColor, opacity: CGFloat, size: CGFloat, dx: CGFloat, dy: CGFloat)] = [
        // Top-left brand bloom pulled over the sidebar so its glow bleeds in.
        (univiewBrandColor, 0.30, 1.20, -0.34, -0.30),
        (univiewBrandViolet, 0.18, 0.88, 0.46, 0.42),
        (univiewBrandCyan, 0.14, 0.70, 0.15, 0.58),
    ]
    private var bloomLayers: [CAGradientLayer] = []

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        for spec in blooms {
            let g = CAGradientLayer()
            g.type = .radial
            g.colors = [
                spec.color.withAlphaComponent(spec.opacity).cgColor,
                spec.color.withAlphaComponent(0).cgColor,
            ]
            g.startPoint = CGPoint(x: 0.5, y: 0.5)
            g.endPoint = CGPoint(x: 1, y: 1)
            layer?.addSublayer(g)
            bloomLayers.append(g)
        }
    }

    required init?(coder: NSCoder) { fatalError() }

    override func layout() {
        super.layout()
        let w = bounds.width
        let h = bounds.height
        for (i, spec) in blooms.enumerated() {
            let size = max(w, h) * spec.size
            let layer = bloomLayers[i]
            layer.frame = CGRect(
                x: w * 0.5 + w * spec.dx - size / 2,
                y: h * 0.5 + h * spec.dy - size / 2,
                width: size, height: size)
        }
    }
}

// MARK: - Shared ambience

/// The single, window-spanning background: a behind-window frost (blurring the
/// desktop) with soft brand blooms glowing on top. Drawn ONCE behind the whole
/// scene so the sidebar and content share it — the brand glow in the top-left
/// bleeds continuously into the sidebar (Music-style), instead of each pane
/// carrying its own disjoint background. Being the backmost content view, the
/// window masks it to its rounded corners, so there are no sharp corners or
/// stray material edges.
@MainActor
final class AmbienceView: NSView {
    private let frost = MaterialView()
    private let bloom = BloomView()

    init() {
        super.init(frame: .zero)
        frost.material = .underWindowBackground
        frost.blendingMode = .behindWindow
        frost.state = .active
        frost.autoresizingMask = [.width, .height]
        bloom.autoresizingMask = [.width, .height]
        addSubview(frost)
        addSubview(bloom)  // blooms glow on top of the frost
    }

    required init?(coder: NSCoder) { fatalError() }

    override func layout() {
        super.layout()
        frost.frame = bounds
        bloom.frame = bounds
    }
}

// MARK: - Root (shared ambience + floating sidebar + content)

/// The window's content controller. It composes three layers to show that the
/// host can express a "virtual floating sidebar": one shared `AmbienceView`
/// spanning the whole window, a floating sidebar panel with its OWN glass
/// surface inset over that ambience, and a transparent content pane. Swapping
/// the sidebar's insets/material here (edge-to-edge vs. floating) is purely a
/// style choice — the composition supports both.
@MainActor
final class RootViewController: NSViewController {
    private let sections: [DemoSection]
    private let sidebarStyle: SidebarStyle
    private let content = ContentViewController()

    init(sections: [DemoSection], sidebarStyle: SidebarStyle) {
        self.sections = sections
        self.sidebarStyle = sidebarStyle
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func loadView() {
        let root = FlippedView()

        let ambience = AmbienceView()
        ambience.translatesAutoresizingMaskIntoConstraints = false

        let sidebar = SidebarViewController(sections: sections, style: sidebarStyle) {
            [weak self] index in
            guard let self else { return }
            self.content.render(self.sections[index].tree())
        }
        addChild(sidebar)
        addChild(content)

        let sidebarView = sidebar.view
        sidebarView.translatesAutoresizingMaskIntoConstraints = false
        let contentView = content.view
        contentView.translatesAutoresizingMaskIntoConstraints = false

        root.addSubview(ambience)
        root.addSubview(contentView)
        root.addSubview(sidebarView)

        let safe = root.safeAreaLayoutGuide
        var constraints = [
            ambience.topAnchor.constraint(equalTo: root.topAnchor),
            ambience.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            ambience.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            ambience.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            sidebarView.widthAnchor.constraint(equalToConstant: sidebarStyle.width),
            contentView.topAnchor.constraint(equalTo: root.topAnchor),
            contentView.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            contentView.bottomAnchor.constraint(equalTo: root.bottomAnchor),
        ]

        switch sidebarStyle.placement {
        case .floating:
            // Inset on all sides so the shared ambience shows around the panel.
            constraints += [
                sidebarView.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 12),
                sidebarView.topAnchor.constraint(equalTo: safe.topAnchor, constant: 6),
                sidebarView.bottomAnchor.constraint(equalTo: root.bottomAnchor, constant: -12),
                contentView.leadingAnchor.constraint(
                    equalTo: sidebarView.trailingAnchor, constant: 10),
            ]
        case .fullHeight:
            // Edge-to-edge, running to the window top with the traffic lights
            // inline; a subtle seam separates it from the content.
            let seam = NSView()
            seam.wantsLayer = true
            seam.layer?.backgroundColor = NSColor.separatorColor.withAlphaComponent(0.35).cgColor
            seam.translatesAutoresizingMaskIntoConstraints = false
            root.addSubview(seam)
            constraints += [
                sidebarView.leadingAnchor.constraint(equalTo: root.leadingAnchor),
                sidebarView.topAnchor.constraint(equalTo: root.topAnchor),
                sidebarView.bottomAnchor.constraint(equalTo: root.bottomAnchor),
                seam.leadingAnchor.constraint(equalTo: sidebarView.trailingAnchor),
                seam.topAnchor.constraint(equalTo: root.topAnchor),
                seam.bottomAnchor.constraint(equalTo: root.bottomAnchor),
                seam.widthAnchor.constraint(equalToConstant: 1),
                contentView.leadingAnchor.constraint(equalTo: seam.trailingAnchor),
            ]
        }

        NSLayoutConstraint.activate(constraints)
        view = root
    }
}
