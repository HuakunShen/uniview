import AppKit

/// Main view controller hosting the connection chrome and plugin UI content area.
/// Wires RPCClient callbacks through TreeReconciler to the AppKit NSView hierarchy.
class MainViewController: NSViewController {

    // MARK: - Properties

    private let rpcClient = RPCClient()
    private let reconciler = TreeReconciler()

    // Chrome
    private let statusDot = NSView()
    private let statusLabel = NSTextField(labelWithString: "Disconnected")
    private let pluginIdField = NSTextField()
    private let connectButton = NSButton(title: "Connect", target: nil, action: nil)
    private let disconnectButton = NSButton(title: "Disconnect", target: nil, action: nil)

    // Plugin content
    private let scrollView = NSScrollView()
    private let pluginContentView = FlippedView()
    private let placeholderLabel = NSTextField(labelWithString: "Enter a plugin ID and click Connect")

    // State
    private var rootViewModel: NodeViewModel?

    // MARK: - Load View

    override func loadView() {
        let mainStack = NSStackView()
        mainStack.orientation = .vertical
        mainStack.spacing = 12
        mainStack.edgeInsets = NSEdgeInsets(top: 16, left: 16, bottom: 16, right: 16)
        mainStack.alignment = .leading

        // -- Header row: status dot + status label
        statusDot.wantsLayer = true
        statusDot.layer?.cornerRadius = 5
        statusDot.layer?.backgroundColor = NSColor.systemGray.cgColor
        statusDot.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            statusDot.widthAnchor.constraint(equalToConstant: 10),
            statusDot.heightAnchor.constraint(equalToConstant: 10),
        ])

        statusLabel.isEditable = false
        statusLabel.isBordered = false
        statusLabel.drawsBackground = false
        statusLabel.font = NSFont.systemFont(ofSize: 12, weight: .medium)

        let headerRow = NSStackView(views: [statusDot, statusLabel])
        headerRow.orientation = .horizontal
        headerRow.spacing = 6
        headerRow.alignment = .centerY

        // -- Plugin ID row: label + text field
        let idLabel = NSTextField(labelWithString: "Plugin ID:")
        idLabel.font = NSFont.systemFont(ofSize: 13)

        pluginIdField.stringValue = "simple-demo"
        pluginIdField.placeholderString = "e.g. simple-demo"
        pluginIdField.bezelStyle = .roundedBezel
        pluginIdField.translatesAutoresizingMaskIntoConstraints = false
        pluginIdField.widthAnchor.constraint(greaterThanOrEqualToConstant: 200).isActive = true

        let idRow = NSStackView(views: [idLabel, pluginIdField])
        idRow.orientation = .horizontal
        idRow.spacing = 8
        idRow.alignment = .centerY

        // -- Button row
        connectButton.bezelStyle = .rounded
        connectButton.target = self
        connectButton.action = #selector(connectTapped)
        connectButton.keyEquivalent = "\r"

        disconnectButton.bezelStyle = .rounded
        disconnectButton.target = self
        disconnectButton.action = #selector(disconnectTapped)
        disconnectButton.isEnabled = false

        let buttonRow = NSStackView(views: [connectButton, disconnectButton])
        buttonRow.orientation = .horizontal
        buttonRow.spacing = 8

        // -- Separator
        let separator = NSBox()
        separator.boxType = .separator
        separator.translatesAutoresizingMaskIntoConstraints = false

        // -- Scroll view for plugin content
        scrollView.hasVerticalScroller = true
        scrollView.hasHorizontalScroller = false
        scrollView.autohidesScrollers = true
        scrollView.borderType = .noBorder

        pluginContentView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.documentView = pluginContentView

        // Placeholder
        placeholderLabel.isEditable = false
        placeholderLabel.isBordered = false
        placeholderLabel.drawsBackground = false
        placeholderLabel.textColor = .secondaryLabelColor
        placeholderLabel.alignment = .center
        pluginContentView.addSubview(placeholderLabel)
        placeholderLabel.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            placeholderLabel.centerXAnchor.constraint(equalTo: pluginContentView.centerXAnchor),
            placeholderLabel.topAnchor.constraint(equalTo: pluginContentView.topAnchor, constant: 40),
        ])

        // Assemble
        mainStack.addArrangedSubview(headerRow)
        mainStack.addArrangedSubview(idRow)
        mainStack.addArrangedSubview(buttonRow)
        mainStack.addArrangedSubview(separator)
        mainStack.addArrangedSubview(scrollView)

        // Make scroll view expand to fill
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        separator.translatesAutoresizingMaskIntoConstraints = false

        // Pin main stack to fill the view
        self.view = NSView()
        self.view.addSubview(mainStack)
        mainStack.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            mainStack.topAnchor.constraint(equalTo: self.view.topAnchor),
            mainStack.leadingAnchor.constraint(equalTo: self.view.leadingAnchor),
            mainStack.trailingAnchor.constraint(equalTo: self.view.trailingAnchor),
            mainStack.bottomAnchor.constraint(equalTo: self.view.bottomAnchor),
            separator.leadingAnchor.constraint(equalTo: mainStack.leadingAnchor),
            separator.trailingAnchor.constraint(equalTo: mainStack.trailingAnchor),
            scrollView.leadingAnchor.constraint(equalTo: mainStack.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: mainStack.trailingAnchor),
        ])

        // Make pluginContentView match scroll view width
        let clipView = scrollView.contentView
        NSLayoutConstraint.activate([
            pluginContentView.widthAnchor.constraint(equalTo: clipView.widthAnchor),
        ])
    }

    // MARK: - View Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        setupRPCCallbacks()
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

    private func handleTreeUpdate(_ tree: UINode) {
        let newViewModel = NodeViewModel(from: tree)

        if let existingRoot = rootViewModel {
            // Diff-based update
            reconciler.reconcile(
                oldModel: existingRoot,
                newModel: newViewModel,
                parentView: pluginContentView,
                handlerExecutor: { [weak self] handlerId, args in
                    self?.executeHandler(handlerId: handlerId, args: args)
                }
            )
        } else {
            // First render
            placeholderLabel.removeFromSuperview()

            let view = NodeViewFactory.createView(
                for: newViewModel,
                handlerExecutor: { [weak self] handlerId, args in
                    self?.executeHandler(handlerId: handlerId, args: args)
                }
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
        }

        rootViewModel = newViewModel
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

    // MARK: - Status UI

    private func updateStatusUI(_ state: RPCClientState) {
        switch state {
        case .disconnected:
            statusDot.layer?.backgroundColor = NSColor.systemGray.cgColor
            statusLabel.stringValue = "Disconnected"
            pluginIdField.isEnabled = true
            connectButton.isEnabled = true
            disconnectButton.isEnabled = false
            rootViewModel = nil
            pluginContentView.subviews.forEach { $0.removeFromSuperview() }
            pluginContentView.addSubview(placeholderLabel)
            placeholderLabel.stringValue = "Enter a plugin ID and click Connect"

        case .connecting:
            statusDot.layer?.backgroundColor = NSColor.systemYellow.cgColor
            statusLabel.stringValue = "Connecting..."
            pluginIdField.isEnabled = false
            connectButton.isEnabled = false
            disconnectButton.isEnabled = true

        case .connected:
            statusDot.layer?.backgroundColor = NSColor.systemBlue.cgColor
            statusLabel.stringValue = "Connected"

        case .initialized:
            statusDot.layer?.backgroundColor = NSColor.systemGreen.cgColor
            statusLabel.stringValue = "Initialized"
            placeholderLabel.stringValue = "Waiting for plugin UI..."
        }
    }

    // MARK: - Actions

    @objc private func connectTapped() {
        let pluginId = pluginIdField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !pluginId.isEmpty else {
            showErrorAlert(message: "Please enter a plugin ID", stack: nil)
            return
        }

        Task { @MainActor in
            do {
                try await rpcClient.connect(pluginId: pluginId)
                try await rpcClient.initialize()
            } catch {
                showErrorAlert(message: error.localizedDescription, stack: nil)
            }
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
}

// MARK: - FlippedView

/// NSView subclass that flips the coordinate system so children lay out top-to-bottom.
class FlippedView: NSView {
    override var isFlipped: Bool { true }
}
