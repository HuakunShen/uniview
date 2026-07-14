import AppKit
import UniviewAppKit
import UniviewBridge
import UniviewNativeCore
import UniviewYoga

/// The demo app, in full: a window, a backdrop, and a bridge connection.
///
/// It used to own a sidebar — `SidebarRow`, `SidebarStatusFooter`,
/// `SidebarViewController`, a `SidebarStyle`, and a table of "sections" pairing
/// each one with a Swift-authored `UINode` tree. All of it is gone, into
/// TypeScript, where it always belonged: a row is a box with an icon, a label and
/// a hover state, and the plugin can say all three.
///
/// What is left is the part that genuinely *is* the app's: an `NSWindow`, the one
/// material behind everything, and the socket the plugin's render output arrives
/// on. This file no longer knows what a sidebar is — and neither does
/// `UniviewAppKit`, which is the entire bet.

// MARK: - Content pane (transparent — shares the window ambience)

/// The detail pane hosting Uniview content. It is fully transparent: the window's
/// backdrop material shows through, so the background is continuous under the
/// sidebar and the content alike — the Music-style look. The Uniview root is
/// inset to the safe area so it clears the transparent title bar.
/// Routes a native interaction to whatever is currently driving the UI. The host's
/// handler closure is built before the plugin connection exists, so it talks to
/// this box instead of capturing a connection directly.
@MainActor
final class HandlerRouter {
    var connection: PluginConnection?

    func execute(_ handlerId: String, _ args: [JSONValue]) {
        guard let connection else {
            FileHandle.standardError.write(Data("[uniview] \(handlerId) (no plugin)\n".utf8))
            return
        }
        // Hand the click back to React; its re-render arrives via updateTree.
        Task { await connection.executeHandler(handlerId, args) }
    }
}

@MainActor
final class ContentViewController: NSViewController {
    private let host: UniviewHost
    private let router = HandlerRouter()
    private var connection: PluginConnection?
    private var connectTask: Task<Void, Never>?
    private var environmentObserver: HostEnvironmentObserver?

    init() {
        let router = self.router
        let registry = ComponentRegistry.standard()
        // `<Menu>` is native but not a view: the plugin's React tree owns the
        // menu bar. When a plugin stops rendering one, fall back to the app's own
        // menu — the app must never be left without ⌘Q.
        registry.registerSurface(
            "Menu",
            MenuSurface(restore: { UniviewMainMenu.standard(appName: "Uniview Desktop") }))

        host = UniviewHost(
            registry: registry,
            layoutEngine: YogaLayoutEngine(),
            containerSize: .zero,
            executeHandler: { id, args in router.execute(id, args) })

        // A style field this host can't use is a bug in the plugin — or a plugin
        // newer than this host. Neither is a reason to tear the UI down (that's
        // what `onError` does): the node keeps the styling we *do* understand and
        // the dropped field goes to the log, where it can be fixed.
        host.tree.onStyleIssue = { nodeId, issue in
            FileHandle.standardError.write(Data("[uniview] node '\(nodeId)': \(issue)\n".utf8))
        }
        super.init(nibName: nil, bundle: nil)

        // `<Window>` configures the window the app already owns — it can't be
        // resolved yet, because a view has no window until it is on screen.
        registry.registerSurface(
            "Window",
            WindowSurface(window: { [weak self] in
                guard let self, isViewLoaded else { return nil }
                return view.window
            }))
    }

    required init?(coder: NSCoder) { fatalError() }

    override func loadView() {
        view = AppearanceReportingView()  // clear; the shared ambience shows through
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        // The plugin is told about dark mode / accent / accessibility as it applies
        // *to this view* — so a window forced light by `<Window appearance="light">`
        // reports light, even on a dark system.
        let observer = HostEnvironmentObserver(view: view) { [weak self] environment in
            guard let connection = self?.connection else { return }
            Task { await connection.setEnvironment(environment.json) }
        }
        self.environmentObserver = observer
        (view as? AppearanceReportingView)?.onAppearanceChange = { [weak observer] in
            observer?.appearanceChanged()
        }
    }

    // MARK: - The plugin

    /// Connect to the plugin that *is* this app. Every React render it pushes
    /// becomes a commit, which mounts as native views — the sidebar included.
    func connectPlugin(id: String) {
        disconnectPlugin()
        apply([.setRoot(node: statusTree("Connecting to “\(id)” over the bridge…"))])

        connectTask = Task { @MainActor in
            do {
                let connection = try PluginConnection(
                    serverUrl: "ws://127.0.0.1:3000", pluginId: id)
                self.connection = connection
                self.router.connection = connection

                try await connection.connect(
                    onCommit: { [weak self] batch in
                        await MainActor.run { self?.apply(batch.mutations) }
                    },
                    onError: { [weak self] message in
                        await MainActor.run {
                            self?.apply([.setRoot(node: self?.statusTree("Plugin error: \(message)"))])
                        }
                    },
                    environment: self.environmentObserver?.snapshot().json)
            } catch {
                self.apply([
                    .setRoot(
                        node: statusTree(
                            "Could not reach the bridge at ws://127.0.0.1:3000.\n"
                                + "Start it with:  cd examples/bridge-server && bun src/index.ts\n"
                                + "then run the plugin:  cd examples/plugin-example && pnpm client:simple"))
                ])
            }
        }
    }

    private func disconnectPlugin() {
        connectTask?.cancel()
        connectTask = nil
        router.connection = nil
        if let connection {
            self.connection = nil
            Task { await connection.disconnect() }
        }
    }

    // MARK: - Commits

    /// Re-stamp every commit with a monotonic revision. The plugin numbers its own
    /// batches from 1, but the shadow tree drops stale revisions — so a status
    /// message rendered before the plugin connected would make its first batches
    /// look stale.
    private func apply(_ mutations: [Mutation]) {
        revision += 1
        host.apply(CommitBatch(revision: revision, mutations: mutations))
        placeRoot()
    }

    private var revision = 0

    /// A plain message pane — connecting / bridge-unreachable / plugin error.
    private func statusTree(_ message: String) -> UINode {
        UINode(
            id: "status", type: "View",
            props: [
                "style": .object([
                    "flexDirection": .string("column"),
                    "width": .string("100%"), "height": .string("100%"),
                    "paddingTop": .number(60), "paddingLeft": .number(34),
                    "paddingRight": .number(34),
                ])
            ],
            children: [
                UINode(
                    id: "status.text", type: "Text",
                    props: [
                        "style": .object([
                            "fontSize": .number(13),
                            "color": .string("secondaryLabel"),
                            "height": .number(140),
                        ])
                    ],
                    children: [UINode.text(message, id: "status.text.t")])
            ])
    }

    /// The plugin's tree gets the WHOLE window, title bar included — it draws the
    /// sidebar that wraps the traffic lights, so it cannot be inset below them.
    /// Where the lights sit is the plugin's call too (`<Window
    /// trafficLightPosition>`).
    override func viewDidLayout() {
        super.viewDidLayout()
        host.setContainerSize(
            Size(width: Double(view.bounds.width), height: Double(view.bounds.height)))
        placeRoot()
    }

    private func placeRoot() {
        guard let root = host.rootView else { return }
        if root.superview !== view { view.addSubview(root) }
        root.frame.origin = .zero
    }
}

// MARK: - Root (one backdrop, one plugin)

/// The window's content: the shared backdrop material, and the plugin's tree over
/// it. That is the entire composition now — the sidebar, the content pane and the
/// split between them are all inside the tree, in TypeScript.
@MainActor
final class RootViewController: NSViewController {
    private let pluginId: String
    private let content = ContentViewController()

    init(pluginId: String) {
        self.pluginId = pluginId
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func loadView() {
        let root = FlippedView()

        // The window's backdrop, and the BACKMOST subview on purpose: that is the
        // contract `WindowSurface` looks for, so `<Window vibrancy="…">` drives
        // this exact view instead of burying a second effect layer beneath it,
        // where nothing would show. The host says where the backdrop is; the
        // plugin says what it is made of.
        //
        // It is left unpainted. A brand glow washed over the material would make
        // the window look good and make it *unreadable*: you could no longer tell
        // whether the background is a real blur of what is behind the window, or a
        // picture of one.
        let backdrop = MaterialView()
        backdrop.material = .underWindowBackground
        backdrop.blendingMode = .behindWindow
        backdrop.state = .active
        backdrop.translatesAutoresizingMaskIntoConstraints = false

        addChild(content)
        let contentView = content.view
        contentView.translatesAutoresizingMaskIntoConstraints = false

        root.addSubview(backdrop)  // must stay first — see above
        root.addSubview(contentView)

        NSLayoutConstraint.activate([
            backdrop.topAnchor.constraint(equalTo: root.topAnchor),
            backdrop.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            backdrop.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            backdrop.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            contentView.topAnchor.constraint(equalTo: root.topAnchor),
            contentView.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            contentView.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            contentView.bottomAnchor.constraint(equalTo: root.bottomAnchor),
        ])
        view = root
    }

    override func viewDidAppear() {
        super.viewDidAppear()
        content.connectPlugin(id: pluginId)
    }
}
