import AppKit

/// Command-style host for Uniview plugins.
/// The left pane is host-owned native chrome; the right pane renders plugin UINodes.
class MainViewController: NSViewController, NSTableViewDataSource, NSTableViewDelegate, NSSearchFieldDelegate {

    // MARK: - Properties

    private let rpcClient = RPCClient()
    private let reconciler = TreeReconciler()
    private let commandModel = CommandPaletteModel(commands: PluginCommand.builtInCommands)

    // Command chrome
    private let searchField = CommandSearchField()
    private let commandTableView = NSTableView()
    private let statusDot = NSView()
    private let statusLabel = NSTextField(labelWithString: "Ready")
    private let runButton = NSButton(title: "Run", target: nil, action: nil)
    private let disconnectButton = NSButton(title: "Stop", target: nil, action: nil)

    // Plugin content
    private let contentTitleLabel = NSTextField(labelWithString: "Select a command")
    private let contentSubtitleLabel = NSTextField(labelWithString: "Search plugins and press Return to run")
    private let scrollView = NSScrollView()
    private let pluginContentView = FlippedView()
    private let placeholderLabel = NSTextField(labelWithString: "No command running")

    // State
    private var rootViewModel: NodeViewModel?
    private var activePluginId: String?

    private let commandCellIdentifier = NSUserInterfaceItemIdentifier("CommandRow")

    // MARK: - Load View

    override func loadView() {
        self.view = NSView()
        self.view.wantsLayer = true
        self.view.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor

        let rootStack = NSStackView()
        rootStack.orientation = .horizontal
        rootStack.spacing = 0
        rootStack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(rootStack)

        let sidebar = makeSidebar()
        let divider = NSBox()
        divider.boxType = .separator
        divider.translatesAutoresizingMaskIntoConstraints = false
        let content = makeContentPane()

        rootStack.addArrangedSubview(sidebar)
        rootStack.addArrangedSubview(divider)
        rootStack.addArrangedSubview(content)

        NSLayoutConstraint.activate([
            rootStack.topAnchor.constraint(equalTo: view.topAnchor),
            rootStack.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            rootStack.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            rootStack.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            sidebar.widthAnchor.constraint(equalToConstant: 300),
            divider.widthAnchor.constraint(equalToConstant: 1),
            content.widthAnchor.constraint(greaterThanOrEqualToConstant: 420),
        ])
    }

    private func makeSidebar() -> NSView {
        let sidebar = NSStackView()
        sidebar.orientation = .vertical
        sidebar.spacing = 10
        sidebar.edgeInsets = NSEdgeInsets(top: 18, left: 16, bottom: 14, right: 16)
        sidebar.translatesAutoresizingMaskIntoConstraints = false

        searchField.placeholderString = "Search commands"
        searchField.setAccessibilityIdentifier("command-search")
        searchField.delegate = self
        searchField.onMoveSelection = { [weak self] offset in
            self?.moveSelection(offset: offset)
        }
        searchField.onRun = { [weak self] in
            self?.runSelectedCommand()
        }
        searchField.translatesAutoresizingMaskIntoConstraints = false

        let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("command"))
        column.resizingMask = .autoresizingMask
        commandTableView.addTableColumn(column)
        commandTableView.headerView = nil
        commandTableView.rowHeight = 58
        commandTableView.intercellSpacing = NSSize(width: 0, height: 4)
        commandTableView.selectionHighlightStyle = .regular
        commandTableView.backgroundColor = .clear
        commandTableView.setAccessibilityIdentifier("command-table")
        commandTableView.dataSource = self
        commandTableView.delegate = self
        commandTableView.target = self
        commandTableView.doubleAction = #selector(runSelectedCommand)

        let commandScrollView = NSScrollView()
        commandScrollView.documentView = commandTableView
        commandScrollView.hasVerticalScroller = true
        commandScrollView.autohidesScrollers = true
        commandScrollView.borderType = .noBorder
        commandScrollView.drawsBackground = false

        statusDot.wantsLayer = true
        statusDot.layer?.cornerRadius = 4
        statusDot.layer?.backgroundColor = NSColor.systemGray.cgColor
        statusDot.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            statusDot.widthAnchor.constraint(equalToConstant: 8),
            statusDot.heightAnchor.constraint(equalToConstant: 8),
        ])

        statusLabel.font = NSFont.systemFont(ofSize: 12, weight: .medium)
        statusLabel.textColor = .secondaryLabelColor
        statusLabel.lineBreakMode = .byTruncatingTail
        statusLabel.setAccessibilityIdentifier("status-label")

        let statusRow = NSStackView(views: [statusDot, statusLabel])
        statusRow.orientation = .horizontal
        statusRow.spacing = 6
        statusRow.alignment = .centerY

        runButton.bezelStyle = .rounded
        runButton.setAccessibilityIdentifier("run-command")
        runButton.target = self
        runButton.action = #selector(runSelectedCommand)
        runButton.keyEquivalent = "\r"

        disconnectButton.bezelStyle = .rounded
        disconnectButton.setAccessibilityIdentifier("stop-command")
        disconnectButton.target = self
        disconnectButton.action = #selector(disconnectTapped)
        disconnectButton.isEnabled = false

        let buttonRow = NSStackView(views: [runButton, disconnectButton])
        buttonRow.orientation = .horizontal
        buttonRow.spacing = 8

        sidebar.addArrangedSubview(searchField)
        sidebar.addArrangedSubview(commandScrollView)
        sidebar.addArrangedSubview(statusRow)
        sidebar.addArrangedSubview(buttonRow)

        commandScrollView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            searchField.heightAnchor.constraint(equalToConstant: 32),
            commandScrollView.heightAnchor.constraint(greaterThanOrEqualToConstant: 300),
        ])

        return sidebar
    }

    private func makeContentPane() -> NSView {
        let contentStack = NSStackView()
        contentStack.orientation = .vertical
        contentStack.spacing = 12
        contentStack.edgeInsets = NSEdgeInsets(top: 18, left: 18, bottom: 18, right: 18)
        contentStack.translatesAutoresizingMaskIntoConstraints = false

        contentTitleLabel.font = NSFont.systemFont(ofSize: 20, weight: .semibold)
        contentTitleLabel.setAccessibilityIdentifier("content-title")
        contentTitleLabel.lineBreakMode = .byTruncatingTail

        contentSubtitleLabel.font = NSFont.systemFont(ofSize: 12)
        contentSubtitleLabel.setAccessibilityIdentifier("content-subtitle")
        contentSubtitleLabel.textColor = .secondaryLabelColor
        contentSubtitleLabel.lineBreakMode = .byTruncatingTail

        let header = NSStackView(views: [contentTitleLabel, contentSubtitleLabel])
        header.orientation = .vertical
        header.spacing = 2
        header.alignment = .leading

        let separator = NSBox()
        separator.boxType = .separator

        scrollView.hasVerticalScroller = true
        scrollView.hasHorizontalScroller = false
        scrollView.autohidesScrollers = true
        scrollView.borderType = .noBorder
        scrollView.drawsBackground = false

        pluginContentView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.documentView = pluginContentView

        placeholderLabel.isEditable = false
        placeholderLabel.isBordered = false
        placeholderLabel.drawsBackground = false
        placeholderLabel.textColor = .secondaryLabelColor
        placeholderLabel.alignment = .center
        pluginContentView.addSubview(placeholderLabel)
        placeholderLabel.translatesAutoresizingMaskIntoConstraints = false

        contentStack.addArrangedSubview(header)
        contentStack.addArrangedSubview(separator)
        contentStack.addArrangedSubview(scrollView)

        scrollView.translatesAutoresizingMaskIntoConstraints = false
        separator.translatesAutoresizingMaskIntoConstraints = false

        let clipView = scrollView.contentView
        NSLayoutConstraint.activate([
            separator.leadingAnchor.constraint(equalTo: contentStack.leadingAnchor),
            separator.trailingAnchor.constraint(equalTo: contentStack.trailingAnchor),
            pluginContentView.widthAnchor.constraint(equalTo: clipView.widthAnchor),
            placeholderLabel.centerXAnchor.constraint(equalTo: pluginContentView.centerXAnchor),
            placeholderLabel.topAnchor.constraint(equalTo: pluginContentView.topAnchor, constant: 48),
        ])

        return contentStack
    }

    // MARK: - View Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        setupRPCCallbacks()
        reloadCommandList()
        installLaunchFixtureIfNeeded()
        view.window?.makeFirstResponder(searchField)
    }

    override func viewDidAppear() {
        super.viewDidAppear()
        view.window?.makeFirstResponder(searchField)
    }

    // MARK: - Command List

    func numberOfRows(in tableView: NSTableView) -> Int {
        commandModel.filteredCommands.count
    }

    func tableView(_ tableView: NSTableView, heightOfRow row: Int) -> CGFloat {
        58
    }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        let command = commandModel.filteredCommands[row]
        let cell = tableView.makeView(withIdentifier: commandCellIdentifier, owner: self) as? CommandRowView
            ?? CommandRowView(identifier: commandCellIdentifier)
        cell.configure(command: command, isActive: command.id == activePluginId)
        return cell
    }

    func tableViewSelectionDidChange(_ notification: Notification) {
        let selectedRow = commandTableView.selectedRow
        guard selectedRow >= 0, selectedRow < commandModel.filteredCommands.count else {
            return
        }

        commandModel.select(commandId: commandModel.filteredCommands[selectedRow].id)
        updateCommandSummary()
    }

    func controlTextDidChange(_ obj: Notification) {
        commandModel.updateQuery(searchField.stringValue)
        reloadCommandList()
    }

    private func moveSelection(offset: Int) {
        if offset > 0 {
            commandModel.selectNext()
        } else {
            commandModel.selectPrevious()
        }
        reloadCommandList()
    }

    private func reloadCommandList() {
        commandTableView.reloadData()

        if let selected = commandModel.selectedCommand,
           let row = commandModel.filteredCommands.firstIndex(where: { $0.id == selected.id }) {
            commandTableView.selectRowIndexes(IndexSet(integer: row), byExtendingSelection: false)
            commandTableView.scrollRowToVisible(row)
        } else {
            commandTableView.deselectAll(nil)
        }

        updateCommandSummary()
    }

    private func updateCommandSummary() {
        guard let command = commandModel.selectedCommand else {
            contentTitleLabel.stringValue = "No command found"
            contentSubtitleLabel.stringValue = "Try a different search"
            runButton.isEnabled = false
            return
        }

        if activePluginId == nil {
            contentTitleLabel.stringValue = command.title
            contentSubtitleLabel.stringValue = command.subtitle
        }
        runButton.isEnabled = true
    }

    // MARK: - RPC Callbacks

    private func setupRPCCallbacks() {
        rpcClient.onUpdateTree = { [weak self] tree in
            self?.handleTreeUpdate(tree)
        }

        rpcClient.onStateChange = { [weak self] state in
            self?.updateStatusUI(state)
        }

        rpcClient.onLog = { level, message in
            print("[\(level)] \(message)")
        }

        rpcClient.onError = { [weak self] message, stack in
            self?.showErrorAlert(message: message, stack: stack)
        }
    }

    // MARK: - Tree Updates

    private func handleTreeUpdate(_ tree: UINode?) {
        guard let tree else {
            rootViewModel = nil
            clearPluginShortcutHandler()
            resetPluginContent(message: "No plugin content")
            return
        }

        let newViewModel = NodeViewModel(from: tree)

        if let existingRoot = rootViewModel {
            reconciler.reconcile(
                oldModel: existingRoot,
                newModel: newViewModel,
                parentView: pluginContentView,
                handlerExecutor: makeHandlerExecutor()
            )
        } else {
            placeholderLabel.removeFromSuperview()

            let view = NodeViewFactory.createView(
                for: newViewModel,
                handlerExecutor: makeHandlerExecutor()
            )

            pluginContentView.subviews.forEach { $0.removeFromSuperview() }
            pluginContentView.addSubview(view)
            view.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([
                view.topAnchor.constraint(equalTo: pluginContentView.topAnchor, constant: 8),
                view.leadingAnchor.constraint(equalTo: pluginContentView.leadingAnchor, constant: 8),
                view.trailingAnchor.constraint(equalTo: pluginContentView.trailingAnchor, constant: -8),
                view.bottomAnchor.constraint(equalTo: pluginContentView.bottomAnchor, constant: -8),
            ])
            installPluginShortcutHandler(for: view)
            focusInitialPluginControl(in: view)
        }

        rootViewModel = newViewModel
    }

    private func installLaunchFixtureIfNeeded() {
        guard let fixture = ProcessInfo.processInfo.environment["UNIVIEW_APPKIT_UI_FIXTURE"] else {
            return
        }

        let fixtureTree: UINode
        switch fixture {
        case "clipboard-image":
            activePluginId = "clipboard-history"
            contentTitleLabel.stringValue = "Clipboard History"
            contentSubtitleLabel.stringValue = "UI fixture: native list/detail/image preview"
            fixtureTree = Self.clipboardImageFixtureTree()
        case "grid-assets":
            activePluginId = "grid-demo"
            contentTitleLabel.stringValue = "Grid Demo"
            contentSubtitleLabel.stringValue = "UI fixture: native visual grid"
            fixtureTree = Self.gridAssetsFixtureTree()
        case "preferences-form":
            activePluginId = "form-demo"
            contentTitleLabel.stringValue = "Preferences Form"
            contentSubtitleLabel.stringValue = "UI fixture: native form controls"
            fixtureTree = Self.preferencesFormFixtureTree()
        default:
            return
        }

        statusDot.layer?.backgroundColor = NSColor.systemGreen.cgColor
        statusLabel.stringValue = "Fixture"
        disconnectButton.isEnabled = false
        reloadCommandList()
        handleTreeUpdate(fixtureTree)
    }

    private func focusInitialPluginControl(in view: NSView) {
        DispatchQueue.main.async { [weak self, weak view] in
            guard let self,
                  let view,
                  let target = NodeViewFactory.initialFocusTarget(in: view) else {
                return
            }

            self.view.window?.makeFirstResponder(target)
        }
    }

    private func installPluginShortcutHandler(for pluginView: NSView) {
        (view.window as? ShortcutWindow)?.shortcutHandler = { [weak pluginView] shortcut in
            guard let pluginView else {
                return false
            }

            return NodeViewFactory.handleShortcut(in: pluginView, shortcut: shortcut)
        }
    }

    private func clearPluginShortcutHandler() {
        (view.window as? ShortcutWindow)?.shortcutHandler = nil
    }

    private func executeHandler(handlerId: String, args: [JSONValue]) {
        Task { @MainActor in
            do {
                try await rpcClient.executeHandler(handlerId: handlerId, args: args)
            } catch {
                print("[AppKit Host] Handler \(handlerId) failed: \(error)")
            }
        }
    }

    private func makeHandlerExecutor() -> NodeViewFactory.HandlerExecutor {
        { [weak self] handlerId, args in
            guard let self else {
                return
            }

            if self.isFixtureMode {
                self.executeFixtureHandler(handlerId: handlerId, args: args)
                return
            }

            self.executeHandler(handlerId: handlerId, args: args)
        }
    }

    private var isFixtureMode: Bool {
        ProcessInfo.processInfo.environment["UNIVIEW_APPKIT_UI_FIXTURE"] != nil
    }

    private func executeFixtureHandler(handlerId: String, args: [JSONValue]) {
        statusDot.layer?.backgroundColor = NSColor.systemGreen.cgColor
        statusLabel.stringValue = "Fixture action: \(handlerId)"
        contentSubtitleLabel.stringValue = args.isEmpty
            ? "Handled \(handlerId)"
            : "Handled \(handlerId) with \(args.count) arg(s)"
    }

    // MARK: - Status UI

    private func updateStatusUI(_ state: RPCClientState) {
        switch state {
        case .disconnected:
            statusDot.layer?.backgroundColor = NSColor.systemGray.cgColor
            statusLabel.stringValue = "Ready"
            disconnectButton.isEnabled = false
            activePluginId = nil
            rootViewModel = nil
            resetPluginContent(message: "No command running")
            reloadCommandList()

        case .connecting:
            statusDot.layer?.backgroundColor = NSColor.systemYellow.cgColor
            statusLabel.stringValue = "Connecting"
            disconnectButton.isEnabled = true

        case .connected:
            statusDot.layer?.backgroundColor = NSColor.systemBlue.cgColor
            statusLabel.stringValue = "Connected"

        case .initialized:
            statusDot.layer?.backgroundColor = NSColor.systemGreen.cgColor
            statusLabel.stringValue = "Running"
            disconnectButton.isEnabled = true
            commandTableView.reloadData()
        }
    }

    private func resetPluginContent(message: String) {
        clearPluginShortcutHandler()
        pluginContentView.subviews.forEach { $0.removeFromSuperview() }
        pluginContentView.addSubview(placeholderLabel)
        placeholderLabel.stringValue = message
        placeholderLabel.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            placeholderLabel.centerXAnchor.constraint(equalTo: pluginContentView.centerXAnchor),
            placeholderLabel.topAnchor.constraint(equalTo: pluginContentView.topAnchor, constant: 48),
        ])
    }

    // MARK: - Actions

    @objc private func runSelectedCommand() {
        guard let command = commandModel.selectedCommand else {
            return
        }

        Task { @MainActor in
            do {
                if rpcClient.state != .disconnected {
                    rpcClient.disconnect()
                }

                activePluginId = command.id
                contentTitleLabel.stringValue = command.title
                contentSubtitleLabel.stringValue = command.subtitle
                resetPluginContent(message: "Waiting for \(command.title)...")
                reloadCommandList()

                try await rpcClient.connect(pluginId: command.id)
                try await initializeSelectedPlugin()
            } catch {
                activePluginId = nil
                reloadCommandList()
                showErrorAlert(message: error.localizedDescription, stack: nil)
            }
        }
    }

    private func initializeSelectedPlugin() async throws {
        do {
            try await rpcClient.initialize()
        } catch RPCClientError.notConnected where rpcClient.state == .connected {
            try await Task.sleep(nanoseconds: 200_000_000)
            try await rpcClient.initialize()
        }
    }

    @objc private func disconnectTapped() {
        rpcClient.disconnect()
    }

    // MARK: - Error Alert

    private func showErrorAlert(message: String, stack: String?) {
        let alert = NSAlert()
        alert.messageText = "Error"
        alert.informativeText = stack != nil ? "\(message)\n\n\(stack!)" : message
        alert.alertStyle = .warning
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }

    private static func clipboardImageFixtureTree() -> UINode {
        UINode(
            id: "fixture-list",
            type: "List",
            props: [
                "searchBarPlaceholder": .string("Type to filter entries..."),
                "selectedItemId": .string("clip-image-1"),
                "isShowingDetail": .bool(true),
            ],
            children: [
                .node(UINode(
                    id: "fixture-type-filter",
                    type: "ListDropdown",
                    props: [
                        "value": .string("All Types"),
                        "tooltip": .string("Filter by content type"),
                    ],
                    children: [
                        .node(UINode(
                            id: "fixture-all-types",
                            type: "ListDropdownItem",
                            props: [
                                "value": .string("All Types"),
                                "title": .string("All Types"),
                            ]
                        )),
                        .node(UINode(
                            id: "fixture-image-type",
                            type: "ListDropdownItem",
                            props: [
                                "value": .string("Image"),
                                "title": .string("Image"),
                                "icon": .string("photo"),
                            ]
                        )),
                    ]
                )),
                .node(UINode(
                    id: "fixture-today",
                    type: "ListSection",
                    props: ["title": .string("Today")],
                    children: [
                        .node(clipboardFixtureItem(
                            id: "clip-note-1",
                            title: "然后帮我把那个enter full screen和keep screen on这两个都关掉吧",
                            subtitle: "Google Chrome - 14:07",
                            icon: "doc",
                            contentType: "Text",
                            markdown: "然后帮我把那个enter full screen和keep screen on这两个都关掉吧，都直接删掉就好",
                            imageSource: nil,
                            source: "Google Chrome"
                        )),
                        .node(clipboardFixtureItem(
                            id: "clip-image-1",
                            title: "Image (710x452)",
                            subtitle: "Screenshot - Today",
                            icon: "photo",
                            contentType: "Image",
                            markdown: "A copied screenshot from a compact command window.",
                            imageSource: transparentPixelDataURL,
                            source: "Screen Capture"
                        )),
                    ]
                )),
            ]
        )
    }

    private static func clipboardFixtureItem(
        id: String,
        title: String,
        subtitle: String,
        icon: String,
        contentType: String,
        markdown: String,
        imageSource: String?,
        source: String
    ) -> UINode {
        var detailChildren: [UINodeChild] = []
        if let imageSource {
            detailChildren.append(.node(UINode(
                id: "\(id)-preview",
                type: "img",
                props: [
                    "src": .string(imageSource),
                    "alt": .string(title),
                    "width": .number(360),
                    "height": .number(220),
                ]
            )))
        }

        detailChildren.append(.node(UINode(
            id: "\(id)-metadata",
            type: "ListItemDetailMetadata",
            children: [
                .node(UINode(
                    id: "\(id)-source",
                    type: "ListItemDetailMetadataLabel",
                    props: [
                        "title": .string("Source"),
                        "text": .string(source),
                        "icon": .string(icon),
                    ]
                )),
                .node(UINode(id: "\(id)-separator", type: "ListItemDetailMetadataSeparator")),
                .node(UINode(
                    id: "\(id)-content-type",
                    type: "ListItemDetailMetadataLabel",
                    props: [
                        "title": .string("Content type"),
                        "text": .string(contentType),
                    ]
                )),
            ]
        )))

        return UINode(
            id: id,
            type: "ListItem",
            props: [
                "id": .string(id),
                "title": .string(title),
                "subtitle": .string(subtitle),
                "icon": .string(icon),
                "accessories": .array([.string(contentType)]),
                "keywords": .array([.string(contentType.lowercased()), .string("clipboard")]),
            ],
            children: [
                .node(UINode(
                    id: "\(id)-detail",
                    type: "ListItemDetail",
                    props: ["markdown": .string(markdown)],
                    children: detailChildren
                )),
                .node(UINode(
                    id: "\(id)-actions",
                    type: "ActionPanel",
                    children: [
                        .node(UINode(
                            id: "\(id)-paste",
                            type: "Action",
                            props: [
                                "title": .string("Paste to Codex"),
                                "shortcut": .string("return"),
                                "style": .string("primary"),
                                "_onActionHandlerId": .string("fixture-paste-\(id)"),
                            ]
                        )),
                        .node(UINode(
                            id: "\(id)-copy",
                            type: "Action",
                            props: [
                                "title": .string("Copy to Clipboard"),
                                "shortcut": .string("cmd+c"),
                                "_onActionHandlerId": .string("fixture-copy-\(id)"),
                            ]
                        )),
                    ]
                )),
            ]
        )
    }

    private static func gridAssetsFixtureTree() -> UINode {
        UINode(
            id: "fixture-grid",
            type: "Grid",
            props: [
                "columns": .number(4),
                "searchBarPlaceholder": .string("Search visual assets"),
                "selectedItemId": .string("asset-photo"),
            ],
            children: [
                .node(UINode(
                    id: "fixture-grid-filter",
                    type: "GridDropdown",
                    props: [
                        "value": .string("All Assets"),
                        "tooltip": .string("Filter by asset type"),
                    ],
                    children: [
                        .node(UINode(
                            id: "fixture-grid-all",
                            type: "GridDropdownItem",
                            props: ["value": .string("All Assets"), "title": .string("All Assets")]
                        )),
                        .node(UINode(
                            id: "fixture-grid-image",
                            type: "GridDropdownItem",
                            props: ["value": .string("Image"), "title": .string("Image"), "icon": .string("photo")]
                        )),
                    ]
                )),
                .node(UINode(
                    id: "fixture-grid-section",
                    type: "GridSection",
                    props: ["title": .string("Clipboard Types")],
                    children: [
                        .node(gridFixtureItem(
                            id: "asset-photo",
                            title: "Screenshot",
                            subtitle: "Image",
                            content: transparentPixelDataURL
                        )),
                        .node(gridFixtureItem(
                            id: "asset-doc",
                            title: "Document",
                            subtitle: "Text",
                            content: "doc.text"
                        )),
                        .node(gridFixtureItem(
                            id: "asset-link",
                            title: "Link Preview",
                            subtitle: "URL",
                            content: "globe"
                        )),
                    ]
                )),
            ]
        )
    }

    private static func gridFixtureItem(
        id: String,
        title: String,
        subtitle: String,
        content: String
    ) -> UINode {
        UINode(
            id: id,
            type: "GridItem",
            props: [
                "id": .string(id),
                "title": .string(title),
                "subtitle": .string(subtitle),
                "content": .string(content),
                "keywords": .array([.string(title.lowercased()), .string(subtitle.lowercased())]),
            ],
            children: [
                .node(UINode(
                    id: "\(id)-actions",
                    type: "ActionPanel",
                    children: [
                        .node(UINode(
                            id: "\(id)-copy",
                            type: "Action",
                            props: [
                                "title": .string("Copy Asset Name"),
                                "shortcut": .string("cmd+c"),
                                "style": .string("primary"),
                                "_onActionHandlerId": .string("fixture-copy-\(id)"),
                            ]
                        )),
                        .node(UINode(
                            id: "\(id)-open",
                            type: "Action",
                            props: [
                                "title": .string("Open Preview"),
                                "shortcut": .string("return"),
                                "_onActionHandlerId": .string("fixture-open-\(id)"),
                            ]
                        )),
                    ]
                )),
            ]
        )
    }

    private static func preferencesFormFixtureTree() -> UINode {
        UINode(
            id: "fixture-form",
            type: "Form",
            children: [
                .node(UINode(
                    id: "form-name",
                    type: "FormTextField",
                    props: [
                        "id": .string("name"),
                        "title": .string("Command Name"),
                        "value": .string("Clipboard History"),
                        "placeholder": .string("Name"),
                        "_onChangeHandlerId": .string("fixture-change-name"),
                    ]
                )),
                .node(UINode(
                    id: "form-description",
                    type: "FormTextArea",
                    props: [
                        "id": .string("description"),
                        "title": .string("Description"),
                        "value": .string("Keep recent text, image, link, and file entries."),
                        "placeholder": .string("Describe the command"),
                        "_onChangeHandlerId": .string("fixture-change-description"),
                    ]
                )),
                .node(UINode(
                    id: "form-remember",
                    type: "FormCheckbox",
                    props: [
                        "id": .string("remember"),
                        "label": .string("Remember selected clipboard type"),
                        "value": .bool(true),
                        "_onChangeHandlerId": .string("fixture-change-remember"),
                    ]
                )),
                .node(UINode(
                    id: "form-default-type",
                    type: "FormDropdown",
                    props: [
                        "id": .string("default-type"),
                        "title": .string("Default Clipboard Type"),
                        "value": .string("text"),
                        "_onChangeHandlerId": .string("fixture-change-default-type"),
                    ],
                    children: [
                        .node(UINode(
                            id: "form-type-text",
                            type: "FormDropdownItem",
                            props: ["value": .string("text"), "title": .string("Text")]
                        )),
                        .node(UINode(
                            id: "form-type-image",
                            type: "FormDropdownItem",
                            props: ["value": .string("image"), "title": .string("Image")]
                        )),
                    ]
                )),
                .node(UINode(id: "form-separator", type: "FormSeparator")),
                .node(UINode(
                    id: "form-secret",
                    type: "FormPasswordField",
                    props: [
                        "id": .string("secret"),
                        "title": .string("Optional Token"),
                        "placeholder": .string("Paste token"),
                        "_onChangeHandlerId": .string("fixture-change-secret"),
                    ]
                )),
                .node(UINode(
                    id: "form-actions",
                    type: "ActionPanel",
                    children: [
                        .node(UINode(
                            id: "form-save",
                            type: "Action",
                            props: [
                                "title": .string("Save Preferences"),
                                "shortcut": .string("cmd+s"),
                                "style": .string("primary"),
                                "_onActionHandlerId": .string("fixture-save-preferences"),
                            ]
                        )),
                    ]
                )),
            ]
        )
    }

    private static let transparentPixelDataURL =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lP9u0wAAAABJRU5ErkJggg=="
}

// MARK: - CommandSearchField

final class CommandSearchField: NSSearchField {
    var onMoveSelection: ((Int) -> Void)?
    var onRun: (() -> Void)?
    var onShowActions: (() -> Void)?
    var onShortcut: ((String) -> Bool)?

    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        if handleShortcut(event) {
            return true
        }
        return super.performKeyEquivalent(with: event)
    }

    override func keyDown(with event: NSEvent) {
        if handleShortcut(event) {
            return
        }

        switch event.keyCode {
        case 125:
            onMoveSelection?(1)
        case 126:
            onMoveSelection?(-1)
        case 36:
            onRun?()
        default:
            super.keyDown(with: event)
        }
    }

    private func handleShortcut(_ event: NSEvent) -> Bool {
        guard let shortcut = Self.normalizedShortcut(for: event) else {
            return false
        }

        if shortcut == "cmd+k" {
            onShowActions?()
            return onShowActions != nil
        }

        return onShortcut?(shortcut) ?? false
    }

    static func normalizedShortcut(for event: NSEvent) -> String? {
        guard let key = normalizedKeyName(for: event) else {
            return nil
        }

        var parts: [String] = []
        let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        if flags.contains(.command) {
            parts.append("cmd")
        }
        if flags.contains(.control) {
            parts.append("ctrl")
        }
        if flags.contains(.option) {
            parts.append("option")
        }
        if flags.contains(.shift) {
            parts.append("shift")
        }

        guard !parts.isEmpty else {
            return nil
        }

        parts.append(key)
        return RaycastShortcut.normalize(parts.joined(separator: "+"))
    }

    private static func normalizedKeyName(for event: NSEvent) -> String? {
        switch event.keyCode {
        case 36, 76:
            return "return"
        case 48:
            return "tab"
        case 49:
            return "space"
        case 51:
            return "delete"
        case 53:
            return "escape"
        case 117:
            return "forwarddelete"
        case 123:
            return "left"
        case 124:
            return "right"
        case 125:
            return "down"
        case 126:
            return "up"
        default:
            guard let character = event.charactersIgnoringModifiers?.lowercased(),
                  !character.isEmpty else {
                return nil
            }
            return character
        }
    }
}

// MARK: - CommandRowView

final class CommandRowView: NSTableCellView {
    private let iconView = NSImageView()
    private let titleLabel = NSTextField(labelWithString: "")
    private let subtitleLabel = NSTextField(labelWithString: "")
    private let activeLabel = NSTextField(labelWithString: "")

    init(identifier: NSUserInterfaceItemIdentifier) {
        super.init(frame: .zero)
        self.identifier = identifier
        setupView()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupView()
    }

    func configure(command: PluginCommand, isActive: Bool) {
        iconView.image = NSImage(systemSymbolName: command.iconName, accessibilityDescription: command.title)
        titleLabel.stringValue = command.title
        subtitleLabel.stringValue = command.subtitle
        activeLabel.stringValue = isActive ? "Running" : ""
        activeLabel.isHidden = !isActive
    }

    private func setupView() {
        wantsLayer = true
        layer?.cornerRadius = 8

        iconView.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 20, weight: .medium)
        iconView.contentTintColor = .controlAccentColor
        iconView.translatesAutoresizingMaskIntoConstraints = false

        titleLabel.font = NSFont.systemFont(ofSize: 13, weight: .semibold)
        titleLabel.lineBreakMode = .byTruncatingTail

        subtitleLabel.font = NSFont.systemFont(ofSize: 11)
        subtitleLabel.textColor = .secondaryLabelColor
        subtitleLabel.lineBreakMode = .byTruncatingTail

        activeLabel.font = NSFont.systemFont(ofSize: 10, weight: .medium)
        activeLabel.textColor = .controlAccentColor
        activeLabel.alignment = .right

        let textStack = NSStackView(views: [titleLabel, subtitleLabel])
        textStack.orientation = .vertical
        textStack.spacing = 2
        textStack.alignment = .leading

        let rowStack = NSStackView(views: [iconView, textStack, activeLabel])
        rowStack.orientation = .horizontal
        rowStack.spacing = 10
        rowStack.alignment = .centerY
        rowStack.translatesAutoresizingMaskIntoConstraints = false

        addSubview(rowStack)

        NSLayoutConstraint.activate([
            iconView.widthAnchor.constraint(equalToConstant: 24),
            iconView.heightAnchor.constraint(equalToConstant: 24),
            activeLabel.widthAnchor.constraint(equalToConstant: 52),
            rowStack.topAnchor.constraint(equalTo: topAnchor, constant: 8),
            rowStack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 10),
            rowStack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -10),
            rowStack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -8),
        ])
    }
}

// MARK: - FlippedView

/// NSView subclass that flips the coordinate system so children lay out top-to-bottom.
class FlippedView: NSView {
    override var isFlipped: Bool { true }
}
