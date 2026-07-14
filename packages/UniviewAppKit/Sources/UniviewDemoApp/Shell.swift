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

/// A Music/Finder-style sidebar row: SF Symbol + label on a soft pill, brand-
/// tinted when selected, a fainter pill on hover. Never an accent-filled bar.
@MainActor
final class SidebarRow: NSView {
    private let icon = NSImageView()
    private let label = NSTextField(labelWithString: "")
    private let index: Int
    private let onClick: (Int) -> Void
    private var tracking: NSTrackingArea?

    var isSelected = false { didSet { restyle() } }
    private var isHovering = false { didSet { restyle() } }

    init(section: DemoSection, index: Int, onClick: @escaping (Int) -> Void) {
        self.index = index
        self.onClick = onClick
        super.init(frame: .zero)
        wantsLayer = true
        layer?.cornerRadius = 7

        icon.image = NSImage(
            systemSymbolName: section.symbol, accessibilityDescription: section.title)
        icon.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 13, weight: .semibold)
        icon.translatesAutoresizingMaskIntoConstraints = false

        label.stringValue = section.title
        label.font = .systemFont(ofSize: 13, weight: .medium)
        label.translatesAutoresizingMaskIntoConstraints = false

        addSubview(icon)
        addSubview(label)
        NSLayoutConstraint.activate([
            heightAnchor.constraint(equalToConstant: 28),
            icon.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 10),
            icon.centerYAnchor.constraint(equalTo: centerYAnchor),
            icon.widthAnchor.constraint(equalToConstant: 20),
            label.leadingAnchor.constraint(equalTo: icon.trailingAnchor, constant: 7),
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
        let pill: NSColor
        if isSelected {
            pill = NSColor.quaternaryLabelColor.withAlphaComponent(0.6)
            icon.contentTintColor = univiewBrandColor
            label.textColor = univiewBrandColor
        } else if isHovering {
            pill = NSColor.quaternaryLabelColor.withAlphaComponent(0.28)
            icon.contentTintColor = .secondaryLabelColor
            label.textColor = .labelColor
        } else {
            pill = .clear
            icon.contentTintColor = .secondaryLabelColor
            label.textColor = .labelColor
        }
        layer?.backgroundColor = pill.cgColor
    }
}

@MainActor
final class SidebarViewController: NSViewController {
    private let sections: [DemoSection]
    private let onSelect: (Int) -> Void
    private var rows: [SidebarRow] = []

    init(sections: [DemoSection], onSelect: @escaping (Int) -> Void) {
        self.sections = sections
        self.onSelect = onSelect
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func loadView() {
        let root = NSView()

        let brand = NSTextField(labelWithString: "Uniview")
        brand.font = .systemFont(ofSize: 15, weight: .bold)
        brand.textColor = .labelColor
        brand.translatesAutoresizingMaskIntoConstraints = false

        let subtitle = NSTextField(labelWithString: "Desktop Studio")
        subtitle.font = .systemFont(ofSize: 11, weight: .regular)
        subtitle.textColor = .secondaryLabelColor
        subtitle.translatesAutoresizingMaskIntoConstraints = false

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

        root.addSubview(brand)
        root.addSubview(subtitle)
        root.addSubview(stack)
        NSLayoutConstraint.activate([
            brand.topAnchor.constraint(equalTo: root.topAnchor, constant: 14),
            brand.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 18),
            subtitle.topAnchor.constraint(equalTo: brand.bottomAnchor, constant: 1),
            subtitle.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 18),
            stack.topAnchor.constraint(equalTo: subtitle.bottomAnchor, constant: 16),
            stack.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 8),
            stack.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -8),
        ])
        view = root
        select(0)
    }

    private func select(_ index: Int) {
        for (i, row) in rows.enumerated() { row.isSelected = (i == index) }
        onSelect(index)
    }
}

// MARK: - Content pane (frost + brand blooms + Uniview)

/// The detail pane: a behind-window frost with soft brand "bloom" glows, and
/// the Uniview host rendering plugin content on top (its root is transparent so
/// the ambience shows through — the Music-style look).
@MainActor
final class ContentViewController: NSViewController {
    private let host: UniviewHost
    private let bloom = BloomView()

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
        let frost = MaterialView()
        frost.material = .underWindowBackground
        frost.blendingMode = .behindWindow
        frost.state = .active

        bloom.autoresizingMask = [.width, .height]
        bloom.frame = frost.bounds
        frost.addSubview(bloom)
        view = frost
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
        host.setContainerSize(Size(width: Double(view.bounds.width), height: Double(view.bounds.height)))
        placeRoot()
    }

    private func placeRoot() {
        guard let root = host.rootView else { return }
        if root.superview !== view { view.addSubview(root) }
    }
}

/// Draws soft brand-colored radial "blooms" that glow through the frost.
final class BloomView: NSView {
    override var isFlipped: Bool { true }
    private let blooms: [(color: NSColor, opacity: CGFloat, size: CGFloat, dx: CGFloat, dy: CGFloat)] = [
        (univiewBrandColor, 0.34, 0.95, -0.28, -0.32),
        (univiewBrandViolet, 0.26, 0.78, 0.46, 0.42),
        (univiewBrandCyan, 0.20, 0.62, 0.10, 0.60),
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

// MARK: - Split shell

@MainActor
final class MainSplitViewController: NSSplitViewController {
    private let content = ContentViewController()
    private let sections: [DemoSection]

    init(sections: [DemoSection]) {
        self.sections = sections
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()

        let sidebarVC = SidebarViewController(sections: sections) { [weak self] index in
            guard let self else { return }
            self.content.render(self.sections[index].tree())
        }
        let sidebarItem = NSSplitViewItem(sidebarWithViewController: sidebarVC)
        sidebarItem.minimumThickness = 210
        sidebarItem.maximumThickness = 280
        sidebarItem.canCollapse = false

        let contentItem = NSSplitViewItem(viewController: content)
        contentItem.minimumThickness = 480

        addSplitViewItem(sidebarItem)
        addSplitViewItem(contentItem)
    }
}
