import AppKit

private enum RaycastListDisplayRow {
    case section(String)
    case item(RaycastListItem)
}

private final class RaycastFlippedStackView: NSStackView {
    override var isFlipped: Bool {
        true
    }
}

class RaycastListNodeView: NSView, UpdatableNodeView, InitialFocusableNodeView, ShortcutHandlingNodeView, NSTableViewDataSource, NSTableViewDelegate, NSSearchFieldDelegate {
    private let searchField = CommandSearchField()
    private let dropdownButton = NSPopUpButton()
    private let tableView = NSTableView()
    private let detailDocumentStack = RaycastFlippedStackView()
    private let detailImageView = NSImageView()
    private let detailTextView = NSTextView()
    private let detailScrollView = NSScrollView()
    private let emptyStateView = RaycastEmptyStateView()
    private let metadataStack = RaycastMetadataStackView()
    private let actionStack = NSStackView()

    private var model: NodeViewModel?
    private var listModel: RaycastListModel?
    private var handlerExecutor: NodeViewFactory.HandlerExecutor?
    private var selectedItemId: String?
    private var localQuery = ""
    private var isUpdatingDropdown = false

    var initialFocusView: NSView? {
        searchField
    }

    convenience init(model: NodeViewModel, handlerExecutor: @escaping NodeViewFactory.HandlerExecutor) {
        self.init(frame: .zero)
        self.model = model
        self.handlerExecutor = handlerExecutor
        setupView()
        applyModel(model)
    }

    func update(
        from oldModel: NodeViewModel,
        to newModel: NodeViewModel,
        handlerExecutor: @escaping NodeViewFactory.HandlerExecutor
    ) {
        self.model = newModel
        self.handlerExecutor = handlerExecutor
        applyModel(newModel)
    }

	func handleShortcut(_ shortcut: String) -> Bool {
		if shortcut == "cmd+k" {
			showActionPanel()
			return selectedItem?.actions.isEmpty == false
		}

		return runShortcutAction(shortcut)
	}

    func numberOfRows(in tableView: NSTableView) -> Int {
        visibleRows.count
    }

    func tableView(_ tableView: NSTableView, heightOfRow row: Int) -> CGFloat {
        switch visibleRows[row] {
        case .section:
            return 28
        case .item:
            return 54
        }
    }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        switch visibleRows[row] {
        case .section(let title):
            let identifier = NSUserInterfaceItemIdentifier("RaycastSectionRow")
            let cell = tableView.makeView(withIdentifier: identifier, owner: self) as? RaycastSectionRowView
                ?? RaycastSectionRowView(identifier: identifier)
            cell.configure(title: title)
            return cell

        case .item(let item):
            let identifier = NSUserInterfaceItemIdentifier("RaycastListRow")
            let cell = tableView.makeView(withIdentifier: identifier, owner: self) as? RaycastListRowView
                ?? RaycastListRowView(identifier: identifier)
            cell.configure(item: item)
            return cell
        }
    }

    func tableView(_ tableView: NSTableView, shouldSelectRow row: Int) -> Bool {
        if case .item = visibleRows[row] {
            return true
        }

        return false
    }

    func tableViewSelectionDidChange(_ notification: Notification) {
        let selectedRow = tableView.selectedRow
        guard selectedRow >= 0, selectedRow < visibleRows.count,
              case .item(let item) = visibleRows[selectedRow] else {
            selectedItemId = nil
            updateDetail()
            return
        }

        selectedItemId = item.id
        executeHandler(named: "onSelectionChange", args: [.string(item.id)])
        updateDetail()
    }

    func controlTextDidChange(_ obj: Notification) {
        localQuery = searchField.stringValue
        executeHandler(named: "onSearchTextChange", args: [.string(localQuery)])
        reloadList(preserveSelection: true)
    }

    private func setupView() {
        translatesAutoresizingMaskIntoConstraints = false

        searchField.delegate = self
        searchField.placeholderString = "Search"
        searchField.setAccessibilityIdentifier("raycast-list-search")
        searchField.setContentHuggingPriority(.defaultLow, for: .horizontal)
        searchField.setContentCompressionResistancePriority(.defaultHigh, for: .horizontal)
        searchField.onMoveSelection = { [weak self] offset in
            self?.moveSelection(offset: offset)
        }
        searchField.onRun = { [weak self] in
            self?.runPrimaryAction()
        }
        searchField.onShowActions = { [weak self] in
            self?.showActionPanel()
        }
        searchField.onShortcut = { [weak self] shortcut in
            self?.runShortcutAction(shortcut) ?? false
        }

        dropdownButton.target = self
        dropdownButton.action = #selector(dropdownSelectionChanged)
        dropdownButton.bezelStyle = .rounded
        dropdownButton.controlSize = .large
        dropdownButton.font = NSFont.systemFont(ofSize: 13, weight: .semibold)
        dropdownButton.isHidden = true
        dropdownButton.setAccessibilityIdentifier("raycast-list-dropdown")
        dropdownButton.translatesAutoresizingMaskIntoConstraints = false

        let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("item"))
        column.resizingMask = .autoresizingMask
        tableView.addTableColumn(column)
        tableView.headerView = nil
        tableView.rowHeight = 54
        tableView.intercellSpacing = NSSize(width: 0, height: 4)
        tableView.selectionHighlightStyle = .regular
        tableView.backgroundColor = .clear
        tableView.setAccessibilityIdentifier("raycast-list-table")
        tableView.dataSource = self
        tableView.delegate = self
        tableView.target = self
        tableView.doubleAction = #selector(runPrimaryAction)

        let listScrollView = NSScrollView()
        listScrollView.documentView = tableView
        listScrollView.hasVerticalScroller = true
        listScrollView.autohidesScrollers = true
        listScrollView.borderType = .noBorder
        listScrollView.drawsBackground = false

        detailImageView.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 72, weight: .regular)
        detailImageView.contentTintColor = .controlAccentColor
        detailImageView.imageScaling = .scaleProportionallyUpOrDown
        detailImageView.imageFrameStyle = .grayBezel
        detailImageView.wantsLayer = true
        detailImageView.layer?.backgroundColor = NSColor.controlBackgroundColor.withAlphaComponent(0.35).cgColor
        detailImageView.layer?.cornerRadius = 8
        detailImageView.layer?.borderWidth = 1
        detailImageView.layer?.borderColor = NSColor.separatorColor.withAlphaComponent(0.6).cgColor
        detailImageView.isHidden = true
        detailImageView.setAccessibilityIdentifier("raycast-list-detail-image")
        detailImageView.setAccessibilityLabel("Preview")
        detailImageView.translatesAutoresizingMaskIntoConstraints = false

        detailTextView.isEditable = false
        detailTextView.isSelectable = true
        detailTextView.drawsBackground = false
        detailTextView.font = NSFont.systemFont(ofSize: 13)
        detailTextView.textColor = .labelColor
        detailTextView.textContainerInset = NSSize(width: 0, height: 0)
        detailTextView.isVerticallyResizable = true
        detailTextView.autoresizingMask = [.width]
        detailTextView.setAccessibilityIdentifier("raycast-list-detail-text")

        detailDocumentStack.orientation = .vertical
        detailDocumentStack.spacing = 12
        detailDocumentStack.alignment = .leading
        detailDocumentStack.translatesAutoresizingMaskIntoConstraints = false
        detailDocumentStack.addArrangedSubview(detailImageView)
        detailDocumentStack.addArrangedSubview(detailTextView)

        detailScrollView.documentView = detailDocumentStack
        detailScrollView.hasVerticalScroller = true
        detailScrollView.autohidesScrollers = true
        detailScrollView.borderType = .noBorder
        detailScrollView.drawsBackground = false
        emptyStateView.isHidden = true
        metadataStack.isHidden = true

        actionStack.orientation = .horizontal
        actionStack.spacing = 8
        actionStack.alignment = .leading
        actionStack.setAccessibilityIdentifier("raycast-list-action-row")

        let detailPane = NSStackView(views: [detailScrollView, metadataStack, emptyStateView])
        detailPane.orientation = .vertical
        detailPane.spacing = 10

        let splitStack = NSStackView(views: [listScrollView, detailPane])
        splitStack.orientation = .horizontal
        splitStack.spacing = 14

        let searchRow = NSStackView(views: [searchField, dropdownButton])
        searchRow.orientation = .horizontal
        searchRow.distribution = .fill
        searchRow.spacing = 10
        searchRow.alignment = .centerY

        let rootStack = NSStackView(views: [searchRow, splitStack, actionStack])
        rootStack.orientation = .vertical
        rootStack.spacing = 10
        rootStack.translatesAutoresizingMaskIntoConstraints = false

        addSubview(rootStack)

        NSLayoutConstraint.activate([
            searchRow.heightAnchor.constraint(equalToConstant: 36),
            searchField.heightAnchor.constraint(equalToConstant: 32),
            searchField.widthAnchor.constraint(greaterThanOrEqualToConstant: 220),
            dropdownButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 150),
            detailScrollView.heightAnchor.constraint(greaterThanOrEqualToConstant: 210),
            detailDocumentStack.topAnchor.constraint(equalTo: detailScrollView.contentView.topAnchor),
            detailDocumentStack.leadingAnchor.constraint(equalTo: detailScrollView.contentView.leadingAnchor),
            detailDocumentStack.trailingAnchor.constraint(equalTo: detailScrollView.contentView.trailingAnchor),
            detailDocumentStack.widthAnchor.constraint(equalTo: detailScrollView.contentView.widthAnchor),
            detailImageView.heightAnchor.constraint(equalToConstant: 176),
            detailImageView.widthAnchor.constraint(equalToConstant: 300),
            listScrollView.widthAnchor.constraint(equalToConstant: 260),
            detailPane.widthAnchor.constraint(greaterThanOrEqualToConstant: 220),
            rootStack.topAnchor.constraint(equalTo: topAnchor),
            rootStack.leadingAnchor.constraint(equalTo: leadingAnchor),
            rootStack.trailingAnchor.constraint(equalTo: trailingAnchor),
            rootStack.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }

    private func applyModel(_ model: NodeViewModel) {
        let searchText = model.props["searchText"]?.stringValue
        localQuery = searchText ?? localQuery
        if searchField.stringValue != localQuery {
            searchField.stringValue = localQuery
        }
        searchField.placeholderString = model.props["searchBarPlaceholder"]?.stringValue ?? "Search"

        listModel = RaycastListModel(root: model, query: localQuery)
        configureDropdown(listModel?.dropdown)
        if let selectedId = listModel?.selectedItemId {
            selectedItemId = selectedId
        }
        reloadList(preserveSelection: true)
    }

    @objc private func dropdownSelectionChanged() {
        guard !isUpdatingDropdown,
              let dropdown = listModel?.dropdown,
              let value = dropdownButton.selectedItem?.representedObject as? String,
              value != dropdown.value,
              let handlerId = dropdown.handlerId,
              let handlerExecutor else {
            return
        }

        handlerExecutor(handlerId, [.string(value)])
    }

    private func configureDropdown(_ dropdown: RaycastSearchBarDropdown?) {
        isUpdatingDropdown = true
        defer { isUpdatingDropdown = false }

        dropdownButton.removeAllItems()

        guard let dropdown else {
            dropdownButton.isHidden = true
            return
        }

        dropdownButton.isHidden = false
        dropdownButton.toolTip = dropdown.tooltip.isEmpty ? nil : dropdown.tooltip

        for item in dropdown.items {
            dropdownButton.addItem(withTitle: item.title)
            dropdownButton.lastItem?.representedObject = item.value
            if let icon = item.icon {
                dropdownButton.lastItem?.image = RaycastImageResolver.image(from: icon, accessibilityDescription: item.title)
            }
        }

        if let selectedIndex = dropdown.selectedIndex {
            dropdownButton.selectItem(at: selectedIndex)
        }
    }

    private func reloadList(preserveSelection: Bool) {
        tableView.reloadData()

        let visible = visibleItems
        guard !visible.isEmpty else {
            selectedItemId = nil
            tableView.deselectAll(nil)
            showEmptyState()
            return
        }

        if !preserveSelection || selectedItemId == nil || !visible.contains(where: { $0.id == selectedItemId }) {
            selectedItemId = visible.first?.id
        }

        if let selectedItemId, let row = visible.firstIndex(where: { $0.id == selectedItemId }) {
            let displayRow = rowIndex(forItemId: selectedItemId) ?? row
            tableView.selectRowIndexes(IndexSet(integer: displayRow), byExtendingSelection: false)
            tableView.scrollRowToVisible(displayRow)
        }
        updateDetail()
    }

    private func moveSelection(offset: Int) {
        let visible = visibleItems
        guard !visible.isEmpty else {
            return
        }

        let currentIndex = selectedItemId.flatMap { id in
            visible.firstIndex(where: { $0.id == id })
        } ?? 0
        let nextIndex = (currentIndex + offset + visible.count) % visible.count
        selectedItemId = visible[nextIndex].id
        let displayRow = rowIndex(forItemId: visible[nextIndex].id) ?? nextIndex
        tableView.selectRowIndexes(IndexSet(integer: displayRow), byExtendingSelection: false)
        tableView.scrollRowToVisible(displayRow)
        updateDetail()
    }

    @objc private func runPrimaryAction() {
        guard let action = selectedItem?.primaryAction,
              let handlerId = action.handlerId,
              let handlerExecutor else {
            return
        }
        handlerExecutor(handlerId, [])
    }

    private func runShortcutAction(_ shortcut: String) -> Bool {
        guard let action = selectedItem?.action(matchingShortcut: shortcut),
              let handlerId = action.handlerId,
              let handlerExecutor else {
            return false
        }

        handlerExecutor(handlerId, [])
        return true
    }

	@discardableResult
	private func showActionPanel() -> Bool {
		guard let item = selectedItem, !item.actions.isEmpty else {
			return false
		}
		guard window != nil else {
			return true
		}

		presentRaycastActionPanel(
			actions: item.actions,
			relativeTo: actionStack,
			handlerExecutor: handlerExecutor
		)
		return true
	}

    private var selectedItem: RaycastListItem? {
        guard let selectedItemId else {
            return visibleItems.first
        }
        return visibleItems.first { $0.id == selectedItemId } ?? visibleItems.first
    }

    private func updateDetail() {
        guard let item = selectedItem else {
            showEmptyState()
            return
        }

        detailScrollView.isHidden = false
        emptyStateView.isHidden = true
        metadataStack.isHidden = item.detailMetadata.isEmpty
        let detail = item.detailMarkdown.isEmpty
            ? "\(item.title)\n\n\(item.subtitle)"
            : item.detailMarkdown
        configureDetailPreview(markdown: detail, imageSource: item.detailImageSource)
        metadataStack.configure(title: "Information", items: item.detailMetadata)

        clearActions()
		for action in item.actions {
			let button = RaycastActionButton(title: action.title, target: nil, action: nil)
			button.handlerId = action.handlerId
			button.handlerExecutor = handlerExecutor
			button.isEnabled = !action.isDisabled && action.handlerId != nil
			button.bezelStyle = action.style == "primary" ? .rounded : .texturedRounded
			button.configureShortcut(action.shortcut)
			actionStack.addArrangedSubview(button)
		}
		actionStack.addArrangedSubview(RaycastShowActionsButton { [weak self] in
			self?.showActionPanel() ?? false
		})
	}

    private func showEmptyState() {
        detailScrollView.isHidden = true
        emptyStateView.isHidden = false
        metadataStack.isHidden = true
        emptyStateView.configure(listModel?.emptyState ?? .fallback)
        clearActions()
    }

    private func configureDetailPreview(markdown: String, imageSource: String?) {
        let imageName = imageSource ?? markdownImageName(in: markdown)
        if let imageName,
           let image = RaycastImageResolver.image(from: imageName, accessibilityDescription: "Preview") {
            detailImageView.image = image
            detailImageView.isHidden = false
        } else {
            detailImageView.image = nil
            detailImageView.isHidden = true
        }

        detailTextView.string = markdown
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("![") }
            .joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func markdownImageName(in markdown: String) -> String? {
        guard let start = markdown.range(of: "](")?.upperBound,
              let end = markdown[start...].firstIndex(of: ")") else {
            return nil
        }

        return String(markdown[start..<end])
    }

    private func clearActions() {
        for view in actionStack.arrangedSubviews {
            actionStack.removeArrangedSubview(view)
            view.removeFromSuperview()
        }
    }

    private func executeHandler(named eventName: String, args: [JSONValue]) {
        guard let handlerId = model?.handlerId(for: eventName), let handlerExecutor else {
            return
        }
        handlerExecutor(handlerId, args)
    }

    private var visibleItems: [RaycastListItem] {
        listModel?.visibleItems ?? []
    }

    private var visibleRows: [RaycastListDisplayRow] {
        var rows: [RaycastListDisplayRow] = []
        var previousSectionTitle: String?

        for item in visibleItems {
            if let sectionTitle = item.sectionTitle, !sectionTitle.isEmpty, sectionTitle != previousSectionTitle {
                rows.append(.section(sectionTitle))
                previousSectionTitle = sectionTitle
            }
            rows.append(.item(item))
        }

        return rows
    }

    private func rowIndex(forItemId itemId: String) -> Int? {
        visibleRows.firstIndex { row in
            if case .item(let item) = row {
                return item.id == itemId
            }
            return false
        }
    }
}

class RaycastGridNodeView: NSView, UpdatableNodeView, InitialFocusableNodeView, ShortcutHandlingNodeView, NSCollectionViewDataSource, NSCollectionViewDelegate, NSCollectionViewDelegateFlowLayout, NSSearchFieldDelegate {
    private let searchField = CommandSearchField()
    private let dropdownButton = NSPopUpButton()
    private let collectionView = NSCollectionView()
    private let emptyStateView = RaycastEmptyStateView()
    private let actionStack = NSStackView()
    private let itemIdentifier = NSUserInterfaceItemIdentifier("RaycastGridItem")

    private var model: NodeViewModel?
    private var gridModel: RaycastGridModel?
    private var handlerExecutor: NodeViewFactory.HandlerExecutor?
    private var selectedItemId: String?
    private var localQuery = ""
    private var isUpdatingDropdown = false

    var initialFocusView: NSView? {
        searchField
    }

	func handleShortcut(_ shortcut: String) -> Bool {
		if shortcut == "cmd+k" {
			showActionPanel()
			return selectedItem?.actions.isEmpty == false
		}

		return runShortcutAction(shortcut)
	}

    convenience init(model: NodeViewModel, handlerExecutor: @escaping NodeViewFactory.HandlerExecutor) {
        self.init(frame: .zero)
        self.model = model
        self.handlerExecutor = handlerExecutor
        setupView()
        applyModel(model)
    }

    func update(
        from oldModel: NodeViewModel,
        to newModel: NodeViewModel,
        handlerExecutor: @escaping NodeViewFactory.HandlerExecutor
    ) {
        self.model = newModel
        self.handlerExecutor = handlerExecutor
        applyModel(newModel)
    }

    func numberOfSections(in collectionView: NSCollectionView) -> Int {
        1
    }

    func collectionView(_ collectionView: NSCollectionView, numberOfItemsInSection section: Int) -> Int {
        visibleItems.count
    }

    func collectionView(
        _ collectionView: NSCollectionView,
        itemForRepresentedObjectAt indexPath: IndexPath
    ) -> NSCollectionViewItem {
        let item = collectionView.makeItem(withIdentifier: itemIdentifier, for: indexPath)
        if let gridItem = item as? RaycastGridCollectionItem {
            gridItem.configure(item: visibleItems[indexPath.item])
        }
        return item
    }

    func collectionView(
        _ collectionView: NSCollectionView,
        layout collectionViewLayout: NSCollectionViewLayout,
        sizeForItemAt indexPath: IndexPath
    ) -> NSSize {
        let columns = CGFloat(gridModel?.columns ?? 4)
        let totalSpacing = max(0, columns - 1) * 12
        let width = max(96, floor((collectionView.bounds.width - totalSpacing) / columns))
        return NSSize(width: width, height: 132)
    }

    func collectionView(_ collectionView: NSCollectionView, didSelectItemsAt indexPaths: Set<IndexPath>) {
        guard let indexPath = indexPaths.first, indexPath.item < visibleItems.count else {
            return
        }
        let item = visibleItems[indexPath.item]
        selectedItemId = item.id
        executeHandler(named: "onSelectionChange", args: [.string(item.id)])
        updateActions()
    }

    func controlTextDidChange(_ obj: Notification) {
        localQuery = searchField.stringValue
        executeHandler(named: "onSearchTextChange", args: [.string(localQuery)])
        reloadGrid(preserveSelection: true)
    }

    private func setupView() {
        translatesAutoresizingMaskIntoConstraints = false

        searchField.delegate = self
        searchField.placeholderString = "Search"
        searchField.setAccessibilityIdentifier("raycast-grid-search")
        searchField.setContentHuggingPriority(.defaultLow, for: .horizontal)
        searchField.setContentCompressionResistancePriority(.defaultHigh, for: .horizontal)
        searchField.onMoveSelection = { [weak self] offset in
            self?.moveSelection(offset: offset)
        }
        searchField.onRun = { [weak self] in
            self?.runPrimaryAction()
        }
        searchField.onShowActions = { [weak self] in
            self?.showActionPanel()
        }
        searchField.onShortcut = { [weak self] shortcut in
            self?.runShortcutAction(shortcut) ?? false
        }

        dropdownButton.target = self
        dropdownButton.action = #selector(dropdownSelectionChanged)
        dropdownButton.bezelStyle = .rounded
        dropdownButton.controlSize = .large
        dropdownButton.font = NSFont.systemFont(ofSize: 13, weight: .semibold)
        dropdownButton.isHidden = true
        dropdownButton.setAccessibilityIdentifier("raycast-grid-dropdown")
        dropdownButton.translatesAutoresizingMaskIntoConstraints = false

        let layout = NSCollectionViewFlowLayout()
        layout.minimumInteritemSpacing = 12
        layout.minimumLineSpacing = 12
        layout.sectionInset = NSEdgeInsets(top: 2, left: 2, bottom: 2, right: 2)

        collectionView.collectionViewLayout = layout
        collectionView.register(RaycastGridCollectionItem.self, forItemWithIdentifier: itemIdentifier)
        collectionView.dataSource = self
        collectionView.delegate = self
        collectionView.isSelectable = true
        collectionView.allowsMultipleSelection = false
        collectionView.backgroundColors = [.clear]
        collectionView.frame = NSRect(x: 0, y: 0, width: 520, height: 420)
        collectionView.setAccessibilityIdentifier("raycast-grid-collection")

        let scrollView = NSScrollView()
        scrollView.documentView = collectionView
        scrollView.hasVerticalScroller = true
        scrollView.autohidesScrollers = true
        scrollView.borderType = .noBorder
        scrollView.drawsBackground = false
        scrollView.translatesAutoresizingMaskIntoConstraints = false

        emptyStateView.isHidden = true
        actionStack.orientation = .horizontal
        actionStack.spacing = 8
        actionStack.alignment = .leading
        actionStack.setAccessibilityIdentifier("raycast-grid-action-row")

        let searchRow = NSStackView(views: [searchField, dropdownButton])
        searchRow.orientation = .horizontal
        searchRow.distribution = .fill
        searchRow.spacing = 10
        searchRow.alignment = .centerY

        let rootStack = NSStackView(views: [searchRow, scrollView, emptyStateView, actionStack])
        rootStack.orientation = .vertical
        rootStack.spacing = 12
        rootStack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(rootStack)

        NSLayoutConstraint.activate([
            searchRow.heightAnchor.constraint(equalToConstant: 36),
            searchField.heightAnchor.constraint(equalToConstant: 36),
            searchField.widthAnchor.constraint(greaterThanOrEqualToConstant: 220),
            dropdownButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 150),
            scrollView.heightAnchor.constraint(greaterThanOrEqualToConstant: 320),
            rootStack.topAnchor.constraint(equalTo: topAnchor),
            rootStack.leadingAnchor.constraint(equalTo: leadingAnchor),
            rootStack.trailingAnchor.constraint(equalTo: trailingAnchor),
            rootStack.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }

    private func applyModel(_ model: NodeViewModel) {
        let searchText = model.props["searchText"]?.stringValue
        localQuery = searchText ?? localQuery
        if searchField.stringValue != localQuery {
            searchField.stringValue = localQuery
        }
        searchField.placeholderString = model.props["searchBarPlaceholder"]?.stringValue ?? "Search"

        gridModel = RaycastGridModel(root: model, query: localQuery)
        configureDropdown(gridModel?.dropdown)
        if let selectedId = gridModel?.selectedItemId {
            selectedItemId = selectedId
        }
        reloadGrid(preserveSelection: true)
    }

    @objc private func dropdownSelectionChanged() {
        guard !isUpdatingDropdown,
              let dropdown = gridModel?.dropdown,
              let value = dropdownButton.selectedItem?.representedObject as? String,
              value != dropdown.value,
              let handlerId = dropdown.handlerId,
              let handlerExecutor else {
            return
        }

        handlerExecutor(handlerId, [.string(value)])
    }

    private func configureDropdown(_ dropdown: RaycastSearchBarDropdown?) {
        isUpdatingDropdown = true
        defer { isUpdatingDropdown = false }

        dropdownButton.removeAllItems()

        guard let dropdown else {
            dropdownButton.isHidden = true
            return
        }

        dropdownButton.isHidden = false
        dropdownButton.toolTip = dropdown.tooltip.isEmpty ? nil : dropdown.tooltip

        for item in dropdown.items {
            dropdownButton.addItem(withTitle: item.title)
            dropdownButton.lastItem?.representedObject = item.value
            if let icon = item.icon {
                dropdownButton.lastItem?.image = RaycastImageResolver.image(from: icon, accessibilityDescription: item.title)
            }
        }

        if let selectedIndex = dropdown.selectedIndex {
            dropdownButton.selectItem(at: selectedIndex)
        }
    }

    private func reloadGrid(preserveSelection: Bool) {
        collectionView.reloadData()

        let visible = visibleItems
        emptyStateView.isHidden = !visible.isEmpty
        if visible.isEmpty {
            selectedItemId = nil
            emptyStateView.configure(title: "No results", description: "Try a different search", icon: "magnifyingglass")
            clearActions()
            return
        }

        if !preserveSelection || selectedItemId == nil || !visible.contains(where: { $0.id == selectedItemId }) {
            selectedItemId = visible.first?.id
        }

        if let selectedItemId, let itemIndex = visible.firstIndex(where: { $0.id == selectedItemId }) {
            collectionView.selectItems(at: [IndexPath(item: itemIndex, section: 0)], scrollPosition: .nearestVerticalEdge)
        }
        updateActions()
    }

    private func moveSelection(offset: Int) {
        let visible = visibleItems
        guard !visible.isEmpty else {
            return
        }

        let currentIndex = selectedItemId.flatMap { id in
            visible.firstIndex(where: { $0.id == id })
        } ?? 0
        let nextIndex = (currentIndex + offset + visible.count) % visible.count
        selectedItemId = visible[nextIndex].id
        collectionView.selectItems(at: [IndexPath(item: nextIndex, section: 0)], scrollPosition: .nearestVerticalEdge)
        updateActions()
    }

    @objc private func runPrimaryAction() {
        guard let action = selectedItem?.primaryAction,
              let handlerId = action.handlerId,
              let handlerExecutor else {
            return
        }

        handlerExecutor(handlerId, [])
    }

    private func runShortcutAction(_ shortcut: String) -> Bool {
        guard let action = selectedItem?.action(matchingShortcut: shortcut),
              let handlerId = action.handlerId,
              let handlerExecutor else {
            return false
        }

        handlerExecutor(handlerId, [])
        return true
    }

	@discardableResult
	private func showActionPanel() -> Bool {
		guard let item = selectedItem, !item.actions.isEmpty else {
			return false
		}
		guard window != nil else {
			return true
		}

		presentRaycastActionPanel(
			actions: item.actions,
			relativeTo: actionStack,
			handlerExecutor: handlerExecutor
		)
		return true
	}

    private var selectedItem: RaycastGridItem? {
        guard let selectedItemId else {
            return visibleItems.first
        }

        return visibleItems.first { $0.id == selectedItemId } ?? visibleItems.first
    }

    private func updateActions() {
        clearActions()

        guard let item = selectedItem else {
            return
        }

		for action in item.actions {
			let button = RaycastActionButton(title: action.title, target: nil, action: nil)
			button.handlerId = action.handlerId
			button.handlerExecutor = handlerExecutor
			button.isEnabled = !action.isDisabled && action.handlerId != nil
			button.bezelStyle = action.style == "primary" ? .rounded : .texturedRounded
			button.configureShortcut(action.shortcut)
			actionStack.addArrangedSubview(button)
		}
		actionStack.addArrangedSubview(RaycastShowActionsButton { [weak self] in
			self?.showActionPanel() ?? false
		})
	}

    private func clearActions() {
        for view in actionStack.arrangedSubviews {
            actionStack.removeArrangedSubview(view)
            view.removeFromSuperview()
        }
    }

    private func executeHandler(named eventName: String, args: [JSONValue]) {
        guard let handlerId = model?.handlerId(for: eventName), let handlerExecutor else {
            return
        }
        handlerExecutor(handlerId, args)
    }

    private var visibleItems: [RaycastGridItem] {
        gridModel?.visibleItems ?? []
    }
}

private final class RaycastGridCollectionItem: NSCollectionViewItem {
    private let tileView = NSView()
    private let contentImageView = NSImageView()
    private let titleLabel = NSTextField(labelWithString: "")
    private let subtitleLabel = NSTextField(labelWithString: "")

    override var isSelected: Bool {
        didSet {
            tileView.layer?.backgroundColor = isSelected
                ? NSColor.selectedContentBackgroundColor.withAlphaComponent(0.38).cgColor
                : NSColor.controlBackgroundColor.withAlphaComponent(0.28).cgColor
        }
    }

    override func loadView() {
        view = NSView()
        setupView()
    }

    func configure(item: RaycastGridItem) {
        view.setAccessibilityIdentifier("raycast-grid-item-\(item.id)")
        titleLabel.stringValue = item.title
        subtitleLabel.stringValue = item.subtitle
        subtitleLabel.isHidden = item.subtitle.isEmpty

        contentImageView.image = RaycastImageResolver.image(from: item.content, accessibilityDescription: item.title)
            ?? RaycastImageResolver.image(from: "photo", accessibilityDescription: item.title)
    }

    private func setupView() {
        tileView.wantsLayer = true
        tileView.layer?.cornerRadius = 8
        tileView.layer?.backgroundColor = NSColor.controlBackgroundColor.withAlphaComponent(0.28).cgColor
        tileView.translatesAutoresizingMaskIntoConstraints = false

        contentImageView.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 36, weight: .regular)
        contentImageView.contentTintColor = .controlAccentColor
        contentImageView.imageScaling = .scaleProportionallyUpOrDown
        contentImageView.translatesAutoresizingMaskIntoConstraints = false

        titleLabel.font = NSFont.systemFont(ofSize: 12, weight: .semibold)
        titleLabel.alignment = .center
        titleLabel.lineBreakMode = .byTruncatingTail

        subtitleLabel.font = NSFont.systemFont(ofSize: 10)
        subtitleLabel.textColor = .secondaryLabelColor
        subtitleLabel.alignment = .center
        subtitleLabel.lineBreakMode = .byTruncatingTail

        let textStack = NSStackView(views: [titleLabel, subtitleLabel])
        textStack.orientation = .vertical
        textStack.spacing = 2

        let stack = NSStackView(views: [tileView, textStack])
        stack.orientation = .vertical
        stack.spacing = 7
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        tileView.addSubview(contentImageView)

        NSLayoutConstraint.activate([
            tileView.heightAnchor.constraint(equalToConstant: 82),
            contentImageView.centerXAnchor.constraint(equalTo: tileView.centerXAnchor),
            contentImageView.centerYAnchor.constraint(equalTo: tileView.centerYAnchor),
            contentImageView.widthAnchor.constraint(equalToConstant: 48),
            contentImageView.heightAnchor.constraint(equalToConstant: 48),
            stack.topAnchor.constraint(equalTo: view.topAnchor),
            stack.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            stack.bottomAnchor.constraint(lessThanOrEqualTo: view.bottomAnchor),
        ])
    }
}

class RaycastFormNodeView: NSView, UpdatableNodeView, InitialFocusableNodeView, ShortcutHandlingNodeView {
    private let formDocumentView = FlippedView()
    private let formStack = NSStackView()
    private let actionStack = NSStackView()
    private var model: NodeViewModel?
    private var handlerExecutor: NodeViewFactory.HandlerExecutor?

    var initialFocusView: NSView? {
        firstEditableField(in: self)
    }

    convenience init(model: NodeViewModel, handlerExecutor: @escaping NodeViewFactory.HandlerExecutor) {
        self.init(frame: .zero)
        self.model = model
        self.handlerExecutor = handlerExecutor
        setupView()
        rebuild(from: model)
    }

    func update(
        from oldModel: NodeViewModel,
        to newModel: NodeViewModel,
        handlerExecutor: @escaping NodeViewFactory.HandlerExecutor
    ) {
        self.model = newModel
        self.handlerExecutor = handlerExecutor
        rebuild(from: newModel)
    }

    func handleShortcut(_ shortcut: String) -> Bool {
        if shortcut == "cmd+k" {
            return showActionPanel()
        }

        guard let model,
              let handlerExecutor,
              let normalizedShortcut = RaycastShortcut.normalize(shortcut) else {
            return false
        }

        for actionPanel in model.children where actionPanel.type == "ActionPanel" {
            for action in actionPanel.children where action.type == "Action" {
                guard RaycastShortcut.normalize(action.props["shortcut"]?.stringValue) == normalizedShortcut,
                       !(action.props["disabled"]?.boolValue ?? false),
                       let handlerId = action.handlerId(for: "onAction") else {
                    continue
                }

                handlerExecutor(handlerId, [])
                return true
            }
        }

        return false
    }

    @discardableResult
    private func showActionPanel() -> Bool {
        guard let model, let handlerExecutor else {
            return false
        }

        let actions = RaycastFormModel(root: model).actions
        guard !actions.isEmpty else {
            return false
        }
        guard window != nil else {
            return true
        }

        presentRaycastActionPanel(
            actions: actions,
            relativeTo: actionStack,
            handlerExecutor: handlerExecutor
        )
        return true
    }

    private func setupView() {
        translatesAutoresizingMaskIntoConstraints = false

        formStack.orientation = .vertical
        formStack.spacing = 14
        formStack.alignment = .leading
        formStack.edgeInsets = NSEdgeInsets(top: 4, left: 2, bottom: 12, right: 2)

        formDocumentView.frame = NSRect(x: 0, y: 0, width: 520, height: 420)
        formDocumentView.setAccessibilityIdentifier("raycast-form-document")
        formDocumentView.addSubview(formStack)
        formStack.translatesAutoresizingMaskIntoConstraints = false
        formStack.setAccessibilityIdentifier("raycast-form-stack")

        let scrollView = NSScrollView()
        scrollView.documentView = formDocumentView
        scrollView.hasVerticalScroller = true
        scrollView.autohidesScrollers = true
        scrollView.borderType = .noBorder
        scrollView.drawsBackground = false

        actionStack.orientation = .horizontal
        actionStack.spacing = 8
        actionStack.alignment = .centerY
        actionStack.setAccessibilityIdentifier("raycast-form-action-row")

        let rootStack = NSStackView(views: [scrollView, actionStack])
        rootStack.orientation = .vertical
        rootStack.spacing = 12
        rootStack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(rootStack)

        NSLayoutConstraint.activate([
            formStack.topAnchor.constraint(equalTo: formDocumentView.topAnchor),
            formStack.leadingAnchor.constraint(equalTo: formDocumentView.leadingAnchor),
            formStack.trailingAnchor.constraint(equalTo: formDocumentView.trailingAnchor),
            formStack.widthAnchor.constraint(greaterThanOrEqualToConstant: 420),
            scrollView.heightAnchor.constraint(greaterThanOrEqualToConstant: 320),
            rootStack.topAnchor.constraint(equalTo: topAnchor),
            rootStack.leadingAnchor.constraint(equalTo: leadingAnchor),
            rootStack.trailingAnchor.constraint(equalTo: trailingAnchor),
            rootStack.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }

    private func rebuild(from model: NodeViewModel) {
        clear(stack: formStack)
        clear(stack: actionStack)

        for child in model.children {
            switch child.type {
            case "FormTextField", "FormPasswordField":
                formStack.addArrangedSubview(RaycastFormTextFieldRow(model: child, handlerExecutor: handlerExecutor))
            case "FormTextArea":
                formStack.addArrangedSubview(RaycastFormTextAreaRow(model: child, handlerExecutor: handlerExecutor))
            case "FormCheckbox":
                formStack.addArrangedSubview(RaycastFormCheckboxRow(model: child, handlerExecutor: handlerExecutor))
            case "FormDropdown":
                formStack.addArrangedSubview(RaycastFormDropdownRow(model: child, handlerExecutor: handlerExecutor))
            case "FormSeparator":
                formStack.addArrangedSubview(RaycastSeparatorView())
            case "ActionPanel":
                addActions(from: child)
            default:
                break
            }
        }

        let estimatedHeight = max(420, formStack.arrangedSubviews.reduce(CGFloat(44)) { partial, view in
            partial + max(40, view.fittingSize.height) + formStack.spacing
        })
        formDocumentView.frame = NSRect(x: 0, y: 0, width: max(520, bounds.width), height: estimatedHeight)
    }

	private func addActions(from actionPanel: NodeViewModel) {
		var hasActions = false
		for action in actionPanel.children where action.type == "Action" {
			hasActions = true
			let button = RaycastActionButton(
				title: action.props["title"]?.stringValue ?? action.textContent,
				target: nil,
				action: nil
            )
            button.handlerId = action.handlerId(for: "onAction")
            button.handlerExecutor = handlerExecutor
            button.isEnabled = !(action.props["disabled"]?.boolValue ?? false) && button.handlerId != nil
            button.bezelStyle = action.props["style"]?.stringValue == "primary" ? .rounded : .texturedRounded
			button.configureShortcut(action.props["shortcut"]?.stringValue)
			actionStack.addArrangedSubview(button)
		}

		if hasActions {
			actionStack.addArrangedSubview(RaycastShowActionsButton { [weak self] in
				self?.showActionPanel() ?? false
			})
		}
	}

    private func clear(stack: NSStackView) {
        for view in stack.arrangedSubviews {
            stack.removeArrangedSubview(view)
            view.removeFromSuperview()
        }
    }

    private func firstEditableField(in view: NSView) -> NSView? {
        if view is NSTextField || view is NSTextView || view is NSPopUpButton {
            return view
        }

        for subview in view.subviews {
            if let target = firstEditableField(in: subview) {
                return target
            }
        }

        return nil
    }
}

private final class RaycastFormTextFieldRow: NSView, NSTextFieldDelegate {
    private let textField: NSTextField
    private let isUpdatingFromPlugin: Bool = false
    private var handlerId: String?
    private var handlerExecutor: NodeViewFactory.HandlerExecutor?

    init(model: NodeViewModel, handlerExecutor: NodeViewFactory.HandlerExecutor?) {
        self.textField = model.type == "FormPasswordField" ? NSSecureTextField() : NSTextField()
        super.init(frame: .zero)
        self.handlerExecutor = handlerExecutor
        setupView(model: model)
    }

    required init?(coder: NSCoder) {
        self.textField = NSTextField()
        super.init(coder: coder)
    }

    func controlTextDidChange(_ obj: Notification) {
        guard !isUpdatingFromPlugin, let handlerId, let handlerExecutor else {
            return
        }
        handlerExecutor(handlerId, [.string(textField.stringValue)])
    }

    private func setupView(model: NodeViewModel) {
        let fieldId = model.props["id"]?.stringValue ?? model.id
        let title = model.props["title"]?.stringValue ?? model.textContent
        let label = makeRaycastFormLabel(title)
        textField.delegate = self
        textField.placeholderString = model.props["placeholder"]?.stringValue ?? ""
        textField.stringValue = model.props["value"]?.stringValue ?? model.props["defaultValue"]?.stringValue ?? ""
        textField.isEnabled = !(model.props["disabled"]?.boolValue ?? false)
        textField.font = NSFont.systemFont(ofSize: 13)
        textField.bezelStyle = .roundedBezel
        let fieldKind = model.type == "FormPasswordField" ? "password" : "text"
        textField.setAccessibilityIdentifier("raycast-form-\(fieldKind)-\(fieldId)")
        handlerId = model.handlerId(for: "onChange")

        let stack = NSStackView(views: [label, textField])
        stack.orientation = .vertical
        stack.spacing = 5
        stack.alignment = .leading
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            textField.widthAnchor.constraint(greaterThanOrEqualToConstant: 360),
            stack.topAnchor.constraint(equalTo: topAnchor),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }
}

private final class RaycastFormTextAreaRow: NSView, NSTextViewDelegate {
    private let textView = NSTextView()
    private var handlerId: String?
    private var handlerExecutor: NodeViewFactory.HandlerExecutor?

    init(model: NodeViewModel, handlerExecutor: NodeViewFactory.HandlerExecutor?) {
        super.init(frame: .zero)
        self.handlerExecutor = handlerExecutor
        setupView(model: model)
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
    }

    func textDidChange(_ notification: Notification) {
        guard let handlerId, let handlerExecutor else {
            return
        }
        handlerExecutor(handlerId, [.string(textView.string)])
    }

    private func setupView(model: NodeViewModel) {
        let fieldId = model.props["id"]?.stringValue ?? model.id
        let label = makeRaycastFormLabel(model.props["title"]?.stringValue ?? model.textContent)
        textView.delegate = self
        textView.string = model.props["value"]?.stringValue ?? model.props["defaultValue"]?.stringValue ?? ""
        textView.font = NSFont.systemFont(ofSize: 13)
        textView.isEditable = !(model.props["disabled"]?.boolValue ?? false)
        textView.setAccessibilityIdentifier("raycast-form-textarea-\(fieldId)")

        let scrollView = NSScrollView()
        scrollView.documentView = textView
        scrollView.hasVerticalScroller = true
        scrollView.borderType = .bezelBorder

        handlerId = model.handlerId(for: "onChange")

        let stack = NSStackView(views: [label, scrollView])
        stack.orientation = .vertical
        stack.spacing = 5
        stack.alignment = .leading
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            scrollView.widthAnchor.constraint(greaterThanOrEqualToConstant: 360),
            scrollView.heightAnchor.constraint(equalToConstant: 96),
            stack.topAnchor.constraint(equalTo: topAnchor),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }
}

private final class RaycastFormCheckboxRow: NSButton {
    private var handlerId: String?
    private var handlerExecutor: NodeViewFactory.HandlerExecutor?

    convenience init(model: NodeViewModel, handlerExecutor: NodeViewFactory.HandlerExecutor?) {
        self.init(frame: .zero)
        self.handlerExecutor = handlerExecutor
        let fieldId = model.props["id"]?.stringValue ?? model.id
        setButtonType(.switch)
        title = model.props["label"]?.stringValue ?? model.textContent
        state = (model.props["value"]?.boolValue ?? model.props["defaultValue"]?.boolValue ?? false) ? .on : .off
        isEnabled = !(model.props["disabled"]?.boolValue ?? false)
        setAccessibilityIdentifier("raycast-form-checkbox-\(fieldId)")
        handlerId = model.handlerId(for: "onChange")
        target = self
        action = #selector(toggle)
    }

    @objc private func toggle() {
        guard let handlerId, let handlerExecutor else {
            return
        }
        handlerExecutor(handlerId, [.bool(state == .on)])
    }
}

private final class RaycastFormDropdownRow: NSView {
    private let popUpButton = NSPopUpButton()
    private var values: [String] = []
    private var handlerId: String?
    private var handlerExecutor: NodeViewFactory.HandlerExecutor?

    init(model: NodeViewModel, handlerExecutor: NodeViewFactory.HandlerExecutor?) {
        super.init(frame: .zero)
        self.handlerExecutor = handlerExecutor
        setupView(model: model)
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
    }

    private func setupView(model: NodeViewModel) {
        let fieldId = model.props["id"]?.stringValue ?? model.id
        let label = makeRaycastFormLabel(model.props["title"]?.stringValue ?? model.textContent)
        values = model.children.compactMap { child in
            guard child.type == "FormDropdownItem" else {
                return nil
            }
            popUpButton.addItem(withTitle: child.props["title"]?.stringValue ?? child.textContent)
            return child.props["value"]?.stringValue ?? child.id
        }

        let selectedValue = model.props["value"]?.stringValue ?? model.props["defaultValue"]?.stringValue
        if let selectedValue, let index = values.firstIndex(of: selectedValue) {
            popUpButton.selectItem(at: index)
        }
        popUpButton.isEnabled = !(model.props["disabled"]?.boolValue ?? false)
        popUpButton.setAccessibilityIdentifier("raycast-form-dropdown-\(fieldId)")
        popUpButton.target = self
        popUpButton.action = #selector(selectionChanged)
        handlerId = model.handlerId(for: "onChange")

        let stack = NSStackView(views: [label, popUpButton])
        stack.orientation = .vertical
        stack.spacing = 5
        stack.alignment = .leading
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            popUpButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 220),
            stack.topAnchor.constraint(equalTo: topAnchor),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }

    @objc private func selectionChanged() {
        guard popUpButton.indexOfSelectedItem >= 0,
              popUpButton.indexOfSelectedItem < values.count,
              let handlerId,
              let handlerExecutor else {
            return
        }
        handlerExecutor(handlerId, [.string(values[popUpButton.indexOfSelectedItem])])
    }
}

private func makeRaycastFormLabel(_ title: String) -> NSTextField {
    let label = NSTextField(labelWithString: title)
    label.font = NSFont.systemFont(ofSize: 12, weight: .semibold)
    label.textColor = .secondaryLabelColor
    return label
}

private final class RaycastEmptyStateView: NSStackView {
    private let iconView = NSImageView()
    private let titleLabel = NSTextField(labelWithString: "")
    private let descriptionLabel = NSTextField(labelWithString: "")

    convenience init() {
        self.init(frame: .zero)
    }

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setupView()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupView()
    }

    func configure(_ emptyState: RaycastEmptyState) {
        configure(
            title: emptyState.title,
            description: emptyState.description,
            icon: emptyState.icon
        )
    }

    func configure(title: String, description: String, icon: String?) {
        titleLabel.stringValue = title
        descriptionLabel.stringValue = description
        descriptionLabel.isHidden = description.isEmpty

        guard let icon,
              let image = RaycastImageResolver.image(from: icon, accessibilityDescription: title) else {
            iconView.image = nil
            iconView.isHidden = true
            return
        }

        iconView.image = image
        iconView.isHidden = false
    }

    private func setupView() {
        orientation = .vertical
        alignment = .centerX
        spacing = 7
        edgeInsets = NSEdgeInsets(top: 48, left: 16, bottom: 16, right: 16)

        iconView.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 28, weight: .regular)
        iconView.contentTintColor = .tertiaryLabelColor
        iconView.translatesAutoresizingMaskIntoConstraints = false

        titleLabel.font = NSFont.systemFont(ofSize: 15, weight: .semibold)
        titleLabel.alignment = .center
        titleLabel.lineBreakMode = .byWordWrapping

        descriptionLabel.font = NSFont.systemFont(ofSize: 12)
        descriptionLabel.textColor = .secondaryLabelColor
        descriptionLabel.alignment = .center
        descriptionLabel.lineBreakMode = .byWordWrapping
        descriptionLabel.maximumNumberOfLines = 3

        addArrangedSubview(iconView)
        addArrangedSubview(titleLabel)
        addArrangedSubview(descriptionLabel)

        NSLayoutConstraint.activate([
            iconView.widthAnchor.constraint(equalToConstant: 34),
            iconView.heightAnchor.constraint(equalToConstant: 34),
        ])
    }
}

private final class RaycastMetadataStackView: NSStackView {
    private let titleLabel = NSTextField(labelWithString: "")

    convenience init() {
        self.init(frame: .zero)
    }

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setupView()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupView()
    }

    func configure(title: String, items: [RaycastDetailMetadataItem]) {
        titleLabel.stringValue = title

        for view in arrangedSubviews where view !== titleLabel {
            removeArrangedSubview(view)
            view.removeFromSuperview()
        }

        for item in items {
            switch item {
            case .label(let title, let text, let icon):
                addArrangedSubview(RaycastMetadataRowView(title: title, text: text, icon: icon))
            case .separator:
                addArrangedSubview(RaycastSeparatorView())
            }
        }
    }

    private func setupView() {
        orientation = .vertical
        spacing = 6
        alignment = .leading
        edgeInsets = NSEdgeInsets(top: 14, left: 0, bottom: 8, right: 0)

        titleLabel.font = NSFont.systemFont(ofSize: 13, weight: .semibold)
        titleLabel.textColor = .secondaryLabelColor
        addArrangedSubview(titleLabel)
    }
}

private final class RaycastMetadataRowView: NSView {
    private let titleLabel = NSTextField(labelWithString: "")
    private let valueLabel = NSTextField(labelWithString: "")
    private let iconView = NSImageView()

    init(title: String, text: String, icon: String?) {
        super.init(frame: .zero)
        setupView()
        configure(title: title, text: text, icon: icon)
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupView()
    }

    private func configure(title: String, text: String, icon: String?) {
        titleLabel.stringValue = title
        valueLabel.stringValue = text

        if let icon,
           let image = RaycastImageResolver.image(from: icon, accessibilityDescription: text) {
            iconView.image = image
            iconView.isHidden = false
        } else {
            iconView.image = nil
            iconView.isHidden = true
        }
    }

    private func setupView() {
        translatesAutoresizingMaskIntoConstraints = false

        titleLabel.font = NSFont.systemFont(ofSize: 12, weight: .medium)
        titleLabel.textColor = .secondaryLabelColor
        titleLabel.lineBreakMode = .byTruncatingTail

        valueLabel.font = NSFont.systemFont(ofSize: 12, weight: .semibold)
        valueLabel.textColor = .labelColor
        valueLabel.alignment = .right
        valueLabel.lineBreakMode = .byTruncatingTail

        iconView.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 13, weight: .semibold)
        iconView.contentTintColor = .controlAccentColor
        iconView.translatesAutoresizingMaskIntoConstraints = false

        let valueStack = NSStackView(views: [iconView, valueLabel])
        valueStack.orientation = .horizontal
        valueStack.spacing = 6
        valueStack.alignment = .centerY

        let row = NSStackView(views: [titleLabel, valueStack])
        row.orientation = .horizontal
        row.spacing = 12
        row.alignment = .centerY
        row.distribution = .fill
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)

        NSLayoutConstraint.activate([
            iconView.widthAnchor.constraint(equalToConstant: 16),
            iconView.heightAnchor.constraint(equalToConstant: 16),
            titleLabel.widthAnchor.constraint(greaterThanOrEqualToConstant: 120),
            row.topAnchor.constraint(equalTo: topAnchor),
            row.leadingAnchor.constraint(equalTo: leadingAnchor),
            row.trailingAnchor.constraint(equalTo: trailingAnchor),
            row.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }
}

private final class RaycastSeparatorView: NSBox {
	convenience init() {
		self.init(frame: .zero)
		boxType = .separator
	}
}

private var activeRaycastActionPanel: NSPopover?

private func presentRaycastActionPanel(
	actions: [RaycastListAction],
	relativeTo anchorView: NSView,
	handlerExecutor: NodeViewFactory.HandlerExecutor?
) {
	activeRaycastActionPanel?.close()

	let popover = NSPopover()
	let controller = RaycastActionPanelViewController(actions: actions) { handlerId, args in
		popover.close()
		activeRaycastActionPanel = nil
		handlerExecutor?(handlerId, args)
	}

	popover.behavior = .transient
	popover.contentViewController = controller
	popover.contentSize = controller.preferredContentSize
	activeRaycastActionPanel = popover
	popover.show(relativeTo: anchorView.bounds, of: anchorView, preferredEdge: .maxY)

    DispatchQueue.main.async { [weak popover, weak controller] in
        guard let popover, let controller else {
            return
        }
        popover.contentViewController?.view.window?.makeFirstResponder(controller.focusView)
    }
}

final class RaycastActionPanelViewController: NSViewController, NSTableViewDataSource, NSTableViewDelegate {
    private let actions: [RaycastListAction]
    private let handlerExecutor: NodeViewFactory.HandlerExecutor
    private let tableView = RaycastActionPanelTableView()
    private let rowIdentifier = NSUserInterfaceItemIdentifier("RaycastActionPanelRow")

    var focusView: NSView {
        tableView
    }

    override var preferredContentSize: NSSize {
        get {
            NSSize(width: 320, height: CGFloat(max(1, actions.count) * 38 + 12))
        }
        set {}
    }

    init(actions: [RaycastListAction], handlerExecutor: @escaping NodeViewFactory.HandlerExecutor) {
        self.actions = actions
        self.handlerExecutor = handlerExecutor
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        self.actions = []
        self.handlerExecutor = { _, _ in }
        super.init(coder: coder)
    }

    override func loadView() {
        let container = NSView()
        container.wantsLayer = true
        container.layer?.cornerRadius = 8

        tableView.addTableColumn(NSTableColumn(identifier: NSUserInterfaceItemIdentifier("Action")))
        tableView.headerView = nil
        tableView.rowHeight = 38
        tableView.intercellSpacing = NSSize(width: 0, height: 3)
        tableView.selectionHighlightStyle = .regular
        tableView.backgroundColor = .clear
        tableView.setAccessibilityIdentifier("raycast-action-panel-table")
        tableView.dataSource = self
        tableView.delegate = self
        tableView.target = self
        tableView.doubleAction = #selector(triggerSelectedAction)
        tableView.onMoveSelection = { [weak self] offset in
            self?.selectAction(offset: offset)
        }
        tableView.onRunSelection = { [weak self] in
            self?.triggerSelectedAction()
        }
        tableView.onShortcut = { [weak self] shortcut in
            self?.triggerAction(matchingShortcut: shortcut) ?? false
        }

        let scrollView = NSScrollView()
        scrollView.documentView = tableView
        scrollView.hasVerticalScroller = actions.count > 8
        scrollView.autohidesScrollers = true
        scrollView.borderType = .noBorder
        scrollView.drawsBackground = false
        scrollView.translatesAutoresizingMaskIntoConstraints = false

        container.addSubview(scrollView)
        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: container.topAnchor, constant: 6),
            scrollView.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 6),
            scrollView.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -6),
            scrollView.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -6),
        ])

        view = container
        tableView.reloadData()
        selectFirstEnabledAction()
    }

    func numberOfRows(in tableView: NSTableView) -> Int {
        actions.count
    }

    func tableView(_ tableView: NSTableView, shouldSelectRow row: Int) -> Bool {
        row >= 0 && row < actions.count && actions[row].canRun
    }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        let view = tableView.makeView(withIdentifier: rowIdentifier, owner: self) as? RaycastActionPanelRowView
            ?? RaycastActionPanelRowView(identifier: rowIdentifier)
        view.configure(action: actions[row])
        return view
    }

    @objc func triggerSelectedAction() {
        let selectedRow = tableView.selectedRow
        guard selectedRow >= 0, selectedRow < actions.count else {
            return
        }

        trigger(action: actions[selectedRow])
    }

    func selectAction(offset: Int) {
        guard !actions.isEmpty else {
            return
        }

        let enabledRows = actions.indices.filter { actions[$0].canRun }
        guard !enabledRows.isEmpty else {
            return
        }

        let currentRow = tableView.selectedRow
        let currentEnabledIndex = enabledRows.firstIndex(of: currentRow) ?? 0
        let nextEnabledIndex = (currentEnabledIndex + offset + enabledRows.count) % enabledRows.count
        let nextRow = enabledRows[nextEnabledIndex]
        tableView.selectRowIndexes(IndexSet(integer: nextRow), byExtendingSelection: false)
        tableView.scrollRowToVisible(nextRow)
    }

    func triggerAction(matchingShortcut shortcut: String) -> Bool {
        guard let normalizedShortcut = RaycastShortcut.normalize(shortcut),
              let action = actions.first(where: { $0.canRun && RaycastShortcut.normalize($0.shortcut) == normalizedShortcut }) else {
            return false
        }

        trigger(action: action)
        return true
    }

    private func selectFirstEnabledAction() {
        guard let row = actions.firstIndex(where: \.canRun) else {
            return
        }

        tableView.selectRowIndexes(IndexSet(integer: row), byExtendingSelection: false)
    }

    private func trigger(action: RaycastListAction) {
        guard action.canRun, let handlerId = action.handlerId else {
            return
        }

        handlerExecutor(handlerId, [])
    }
}

private final class RaycastActionPanelTableView: NSTableView {
    var onMoveSelection: ((Int) -> Void)?
    var onRunSelection: (() -> Void)?
    var onShortcut: ((String) -> Bool)?

    override var acceptsFirstResponder: Bool {
        true
    }

    override func keyDown(with event: NSEvent) {
        switch event.keyCode {
        case 125:
            onMoveSelection?(1)
        case 126:
            onMoveSelection?(-1)
        case 36:
            onRunSelection?()
        default:
            if let shortcut = CommandSearchField.normalizedShortcut(for: event),
               onShortcut?(shortcut) == true {
                return
            }
            super.keyDown(with: event)
        }
    }
}

private final class RaycastActionPanelRowView: NSTableCellView {
    private let titleLabel = NSTextField(labelWithString: "")
    private let shortcutLabel = NSTextField(labelWithString: "")

    init(identifier: NSUserInterfaceItemIdentifier) {
        super.init(frame: .zero)
        self.identifier = identifier
        setupView()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupView()
    }

    func configure(action: RaycastListAction) {
        setAccessibilityIdentifier("raycast-action-panel-row-\(action.title)")
        titleLabel.stringValue = action.title
        titleLabel.textColor = action.canRun ? .labelColor : .disabledControlTextColor
        shortcutLabel.stringValue = RaycastShortcutFormatter.label(for: action.shortcut)
        shortcutLabel.isHidden = shortcutLabel.stringValue.isEmpty
        shortcutLabel.textColor = action.canRun ? .secondaryLabelColor : .disabledControlTextColor
    }

    private func setupView() {
        wantsLayer = true
        layer?.cornerRadius = 7

        titleLabel.font = NSFont.systemFont(ofSize: 13, weight: .medium)
        titleLabel.lineBreakMode = .byTruncatingTail

        shortcutLabel.font = NSFont.monospacedSystemFont(ofSize: 11, weight: .medium)
        shortcutLabel.alignment = .right
        shortcutLabel.lineBreakMode = .byTruncatingTail

        let row = NSStackView(views: [titleLabel, shortcutLabel])
        row.orientation = .horizontal
        row.spacing = 16
        row.alignment = .centerY
        row.distribution = .fill
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)

        NSLayoutConstraint.activate([
            shortcutLabel.widthAnchor.constraint(greaterThanOrEqualToConstant: 54),
            row.topAnchor.constraint(equalTo: topAnchor, constant: 7),
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 10),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -10),
            row.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -7),
        ])
    }
}

private enum RaycastShortcutFormatter {
    static func label(for shortcut: String?) -> String {
        guard let shortcut, !shortcut.isEmpty else {
            return ""
        }

        return shortcut
            .lowercased()
            .split(separator: "+")
            .map(formatPart)
            .joined()
    }

    private static func formatPart(_ part: Substring) -> String {
        switch part {
        case "cmd", "command":
            return "⌘"
        case "ctrl", "control":
            return "⌃"
        case "option", "opt", "alt":
            return "⌥"
        case "shift":
            return "⇧"
        case "return":
            return "↵"
        case "space":
            return "Space"
        default:
            return part.uppercased()
        }
    }
}

private extension RaycastListAction {
	var canRun: Bool {
		!isDisabled && handlerId != nil
	}
}

private final class RaycastShowActionsButton: NSButton {
	private let onPress: () -> Bool

	init(onPress: @escaping () -> Bool) {
		self.onPress = onPress
		super.init(frame: .zero)
		title = "Actions"
		bezelStyle = .texturedRounded
		keyEquivalent = "k"
		keyEquivalentModifierMask = [.command]
		setAccessibilityIdentifier("raycast-show-actions")
		target = self
		action = #selector(run)
	}

	required init?(coder: NSCoder) {
		nil
	}

	override func sendAction(_ action: Selector?, to target: Any?) -> Bool {
		onPress()
	}

	override func accessibilityPerformPress() -> Bool {
		onPress()
	}

	@objc private func run() {
		_ = onPress()
	}
}

private final class RaycastActionButton: NSButton {
	var handlerId: String?
	var handlerExecutor: NodeViewFactory.HandlerExecutor?

    convenience init(title: String, target: AnyObject?, action: Selector?) {
        self.init(frame: .zero)
        self.title = title
        setAccessibilityIdentifier("raycast-action-\(title)")
        self.target = self
        self.action = #selector(run)
    }

    func configureShortcut(_ shortcut: String?) {
        keyEquivalent = ""
        keyEquivalentModifierMask = []

        guard let shortcut = RaycastShortcut.normalize(shortcut) else {
            return
        }

        var parts = shortcut.lowercased().split(separator: "+").map(String.init)
        guard let key = parts.popLast() else {
            return
        }

        var modifiers: NSEvent.ModifierFlags = []
        for part in parts {
            switch part {
            case "cmd", "command":
                modifiers.insert(.command)
            case "ctrl", "control":
                modifiers.insert(.control)
            case "option", "opt", "alt":
                modifiers.insert(.option)
            case "shift":
                modifiers.insert(.shift)
            default:
                break
            }
        }

        keyEquivalent = key == "return" ? "\r" : key
        keyEquivalentModifierMask = modifiers
    }

    override func sendAction(_ action: Selector?, to target: Any?) -> Bool {
        executeHandler()
    }

    override func accessibilityPerformPress() -> Bool {
        executeHandler()
    }

    @objc private func run() {
        _ = executeHandler()
    }

    @discardableResult
    private func executeHandler() -> Bool {
        guard isEnabled, let handlerId, let handlerExecutor else {
            return false
        }

        handlerExecutor(handlerId, [])
        return true
    }
}

private final class RaycastListRowView: NSTableCellView {
    private let iconView = NSImageView()
    private let titleLabel = NSTextField(labelWithString: "")
    private let subtitleLabel = NSTextField(labelWithString: "")
    private let accessoryLabel = NSTextField(labelWithString: "")

    init(identifier: NSUserInterfaceItemIdentifier) {
        super.init(frame: .zero)
        self.identifier = identifier
        setupView()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupView()
    }

    func configure(item: RaycastListItem) {
        if let icon = item.icon {
            iconView.image = RaycastImageResolver.image(from: icon, accessibilityDescription: item.title)
        } else {
            iconView.image = RaycastImageResolver.image(from: "square.grid.2x2", accessibilityDescription: item.title)
        }
        titleLabel.stringValue = item.title
        subtitleLabel.stringValue = item.subtitle
        accessoryLabel.stringValue = item.accessories.joined(separator: "  ")
    }

    private func setupView() {
        iconView.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 18, weight: .medium)
        iconView.contentTintColor = .controlAccentColor

        titleLabel.font = NSFont.systemFont(ofSize: 13, weight: .semibold)
        titleLabel.lineBreakMode = .byTruncatingTail

        subtitleLabel.font = NSFont.systemFont(ofSize: 11)
        subtitleLabel.textColor = .secondaryLabelColor
        subtitleLabel.lineBreakMode = .byTruncatingTail

        accessoryLabel.font = NSFont.systemFont(ofSize: 10, weight: .medium)
        accessoryLabel.textColor = .secondaryLabelColor
        accessoryLabel.alignment = .right

        let textStack = NSStackView(views: [titleLabel, subtitleLabel])
        textStack.orientation = .vertical
        textStack.spacing = 2
        textStack.alignment = .leading

        let rowStack = NSStackView(views: [iconView, textStack, accessoryLabel])
        rowStack.orientation = .horizontal
        rowStack.spacing = 8
        rowStack.alignment = .centerY
        rowStack.translatesAutoresizingMaskIntoConstraints = false

        addSubview(rowStack)

        NSLayoutConstraint.activate([
            iconView.widthAnchor.constraint(equalToConstant: 22),
            iconView.heightAnchor.constraint(equalToConstant: 22),
            accessoryLabel.widthAnchor.constraint(equalToConstant: 70),
            rowStack.topAnchor.constraint(equalTo: topAnchor, constant: 7),
            rowStack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 8),
            rowStack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8),
            rowStack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -7),
        ])
    }
}

private final class RaycastSectionRowView: NSTableCellView {
    private let titleLabel = NSTextField(labelWithString: "")

    init(identifier: NSUserInterfaceItemIdentifier) {
        super.init(frame: .zero)
        self.identifier = identifier
        setupView()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupView()
    }

    func configure(title: String) {
        titleLabel.stringValue = title.uppercased()
    }

    private func setupView() {
        titleLabel.font = NSFont.systemFont(ofSize: 10, weight: .semibold)
        titleLabel.textColor = .tertiaryLabelColor
        titleLabel.lineBreakMode = .byTruncatingTail
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        addSubview(titleLabel)

        NSLayoutConstraint.activate([
            titleLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 8),
            titleLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8),
            titleLabel.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -3),
        ])
    }
}

class DetailNodeView: NSView, UpdatableNodeView, ShortcutHandlingNodeView {
    private let documentStack = RaycastFlippedStackView()
    private let imageView = NSImageView()
    private let textView = NSTextView()
    private let scrollView = NSScrollView()
    private let metadataStack = RaycastMetadataStackView()
    private let actionStack = NSStackView()
    private var model: NodeViewModel?
    private var handlerExecutor: NodeViewFactory.HandlerExecutor?

    convenience init(model: NodeViewModel, handlerExecutor: @escaping NodeViewFactory.HandlerExecutor) {
        self.init(frame: .zero)
        self.model = model
        self.handlerExecutor = handlerExecutor
        setupView()
        applyModel(model)
    }

    func update(
        from oldModel: NodeViewModel,
        to newModel: NodeViewModel,
        handlerExecutor: @escaping NodeViewFactory.HandlerExecutor
    ) {
        self.model = newModel
        self.handlerExecutor = handlerExecutor
        applyModel(newModel)
    }

    func handleShortcut(_ shortcut: String) -> Bool {
        if shortcut == "cmd+k" {
            return showActionPanel()
        }

        guard let normalizedShortcut = RaycastShortcut.normalize(shortcut),
              let action = actions.first(where: { $0.canRun && RaycastShortcut.normalize($0.shortcut) == normalizedShortcut }),
              let handlerId = action.handlerId,
              let handlerExecutor else {
            return false
        }

        handlerExecutor(handlerId, [])
        return true
    }

    private func setupView() {
        translatesAutoresizingMaskIntoConstraints = false

        imageView.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 72, weight: .regular)
        imageView.contentTintColor = .controlAccentColor
        imageView.imageScaling = .scaleProportionallyUpOrDown
        imageView.imageFrameStyle = .grayBezel
        imageView.wantsLayer = true
        imageView.layer?.backgroundColor = NSColor.controlBackgroundColor.withAlphaComponent(0.35).cgColor
        imageView.layer?.cornerRadius = 8
        imageView.layer?.borderWidth = 1
        imageView.layer?.borderColor = NSColor.separatorColor.withAlphaComponent(0.6).cgColor
        imageView.isHidden = true
        imageView.setAccessibilityIdentifier("raycast-detail-image")
        imageView.setAccessibilityLabel("Preview")
        imageView.translatesAutoresizingMaskIntoConstraints = false

        textView.isEditable = false
        textView.isSelectable = true
        textView.drawsBackground = false
        textView.font = NSFont.systemFont(ofSize: 13)
        textView.textColor = .labelColor
        textView.textContainerInset = NSSize(width: 0, height: 0)
        textView.isVerticallyResizable = true
        textView.autoresizingMask = [.width]
        textView.setAccessibilityIdentifier("raycast-detail-text")

        documentStack.orientation = .vertical
        documentStack.spacing = 12
        documentStack.alignment = .leading
        documentStack.translatesAutoresizingMaskIntoConstraints = false
        documentStack.addArrangedSubview(imageView)
        documentStack.addArrangedSubview(textView)

        scrollView.documentView = documentStack
        scrollView.hasVerticalScroller = true
        scrollView.autohidesScrollers = true
        scrollView.borderType = .noBorder
        scrollView.drawsBackground = false

        metadataStack.isHidden = true

        actionStack.orientation = .horizontal
        actionStack.spacing = 8
        actionStack.alignment = .leading
        actionStack.setAccessibilityIdentifier("raycast-detail-action-row")

        let rootStack = NSStackView(views: [scrollView, metadataStack, actionStack])
        rootStack.orientation = .vertical
        rootStack.spacing = 12
        rootStack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(rootStack)

        NSLayoutConstraint.activate([
            scrollView.heightAnchor.constraint(greaterThanOrEqualToConstant: 280),
            documentStack.topAnchor.constraint(equalTo: scrollView.contentView.topAnchor),
            documentStack.leadingAnchor.constraint(equalTo: scrollView.contentView.leadingAnchor),
            documentStack.trailingAnchor.constraint(equalTo: scrollView.contentView.trailingAnchor),
            documentStack.widthAnchor.constraint(equalTo: scrollView.contentView.widthAnchor),
            imageView.heightAnchor.constraint(equalToConstant: 176),
            imageView.widthAnchor.constraint(equalToConstant: 300),
            rootStack.topAnchor.constraint(equalTo: topAnchor),
            rootStack.leadingAnchor.constraint(equalTo: leadingAnchor),
            rootStack.trailingAnchor.constraint(equalTo: trailingAnchor),
            rootStack.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }

    private func applyModel(_ model: NodeViewModel) {
        configureMarkdown(
            markdown: model.props["markdown"]?.stringValue ?? model.textContent,
            imageSource: imageSource(from: model)
        )
        let metadata = metadataItems(from: model)
        metadataStack.isHidden = metadata.isEmpty
        metadataStack.configure(title: "Information", items: metadata)
        updateActions()
    }

    private func configureMarkdown(markdown: String, imageSource: String?) {
        let imageName = imageSource ?? markdownImageName(in: markdown)
        if let imageName,
           let image = RaycastImageResolver.image(from: imageName, accessibilityDescription: "Preview") {
            imageView.image = image
            imageView.isHidden = false
        } else {
            imageView.image = nil
            imageView.isHidden = true
        }

        textView.string = markdown
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("![") }
            .joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func markdownImageName(in markdown: String) -> String? {
        guard let start = markdown.range(of: "](")?.upperBound,
              let end = markdown[start...].firstIndex(of: ")") else {
            return nil
        }

        return String(markdown[start..<end])
    }

    private func metadataItems(from model: NodeViewModel) -> [RaycastDetailMetadataItem] {
        let metadataNode = model.children.first { $0.type == "DetailMetadata" || $0.type == "ListItemDetailMetadata" }

        return metadataNode?.children.compactMap { child in
            switch child.type {
            case "DetailMetadataLabel", "ListItemDetailMetadataLabel":
                return .label(
                    title: child.props["title"]?.stringValue ?? child.textContent,
                    text: child.props["text"]?.stringValue ?? "",
                    icon: child.props["icon"]?.stringValue
                )
            case "DetailMetadataSeparator", "ListItemDetailMetadataSeparator":
                return .separator
            default:
                return nil
            }
        } ?? []
    }

    private var actions: [RaycastListAction] {
        guard let model,
              let actionPanel = model.children.first(where: { $0.type == "ActionPanel" }) else {
            return []
        }

        return actionPanel.children.compactMap { action in
            guard action.type == "Action" else {
                return nil
            }
            return RaycastListAction(
                title: action.props["title"]?.stringValue ?? action.textContent,
                handlerId: action.handlerId(for: "onAction"),
                isDisabled: action.props["disabled"]?.boolValue ?? false,
                style: action.props["style"]?.stringValue ?? "regular",
                shortcut: action.props["shortcut"]?.stringValue
            )
        }
    }

    private func imageSource(from model: NodeViewModel) -> String? {
        model.children.first { $0.type == "img" }?.props["src"]?.stringValue
    }

    private func updateActions() {
        clearActions()
		for action in actions {
			let button = RaycastActionButton(title: action.title, target: nil, action: nil)
			button.handlerId = action.handlerId
			button.handlerExecutor = handlerExecutor
			button.isEnabled = action.canRun
			button.bezelStyle = action.style == "primary" ? .rounded : .texturedRounded
			button.configureShortcut(action.shortcut)
			actionStack.addArrangedSubview(button)
		}
		if !actions.isEmpty {
			actionStack.addArrangedSubview(RaycastShowActionsButton { [weak self] in
				self?.showActionPanel() ?? false
			})
		}
	}

    @discardableResult
    private func showActionPanel() -> Bool {
        let actions = actions
        guard !actions.isEmpty else {
            return false
        }
        guard window != nil else {
            return true
        }

        presentRaycastActionPanel(
            actions: actions,
            relativeTo: actionStack,
            handlerExecutor: handlerExecutor
        )
        return true
    }

    private func clearActions() {
        for view in actionStack.arrangedSubviews {
            actionStack.removeArrangedSubview(view)
            view.removeFromSuperview()
        }
    }
}

class EmptyViewNodeView: NSStackView, UpdatableNodeView {
    private let emptyStateView = RaycastEmptyStateView()

    convenience init(model: NodeViewModel) {
        self.init(views: [])
        orientation = .vertical
        alignment = .centerX
        addArrangedSubview(emptyStateView)
        applyModel(model)
    }

    func update(
        from oldModel: NodeViewModel,
        to newModel: NodeViewModel,
        handlerExecutor: @escaping NodeViewFactory.HandlerExecutor
    ) {
        applyModel(newModel)
    }

    private func applyModel(_ model: NodeViewModel) {
        emptyStateView.configure(
            title: model.props["title"]?.stringValue ?? model.textContent,
            description: model.props["description"]?.stringValue ?? "",
            icon: model.props["icon"]?.stringValue
        )
    }
}

class RaycastImageNodeView: NSView, UpdatableNodeView {
    private let imageView = NSImageView()
    private var widthConstraint: NSLayoutConstraint?
    private var heightConstraint: NSLayoutConstraint?

    convenience init(model: NodeViewModel) {
        self.init(frame: .zero)
        setupView()
        applyModel(model)
    }

    func update(
        from oldModel: NodeViewModel,
        to newModel: NodeViewModel,
        handlerExecutor: @escaping NodeViewFactory.HandlerExecutor
    ) {
        applyModel(newModel)
    }

    private func setupView() {
        translatesAutoresizingMaskIntoConstraints = false
        wantsLayer = true
        layer?.cornerRadius = 8
        layer?.backgroundColor = NSColor.controlBackgroundColor.withAlphaComponent(0.28).cgColor
        layer?.borderWidth = 1
        layer?.borderColor = NSColor.separatorColor.withAlphaComponent(0.45).cgColor

        imageView.translatesAutoresizingMaskIntoConstraints = false
        imageView.imageScaling = .scaleProportionallyUpOrDown
        imageView.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 48, weight: .regular)
        imageView.contentTintColor = .controlAccentColor
        imageView.setAccessibilityIdentifier("raycast-image")

        addSubview(imageView)

        NSLayoutConstraint.activate([
            imageView.topAnchor.constraint(equalTo: topAnchor),
            imageView.leadingAnchor.constraint(equalTo: leadingAnchor),
            imageView.trailingAnchor.constraint(equalTo: trailingAnchor),
            imageView.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }

    private func applyModel(_ model: NodeViewModel) {
        let source = model.props["src"]?.stringValue ?? ""
        let alt = model.props["alt"]?.stringValue
        imageView.image = RaycastImageResolver.image(from: source, accessibilityDescription: alt)
        imageView.imageScaling = imageScaling(from: model.props["fit"]?.stringValue)

        updateDimensionConstraint(
            &widthConstraint,
            anchor: widthAnchor,
            value: model.props["width"]?.numberValue,
            fallback: 320
        )
        updateDimensionConstraint(
            &heightConstraint,
            anchor: heightAnchor,
            value: model.props["height"]?.numberValue,
            fallback: 180
        )
    }

    private func imageScaling(from fit: String?) -> NSImageScaling {
        switch fit {
        case "fill":
            return .scaleAxesIndependently
        case "cover":
            return .scaleProportionallyUpOrDown
        default:
            return .scaleProportionallyUpOrDown
        }
    }

    private func updateDimensionConstraint(
        _ constraint: inout NSLayoutConstraint?,
        anchor: NSLayoutDimension,
        value: Double?,
        fallback: CGFloat
    ) {
        let dimension = max(1, value.map { CGFloat($0) } ?? fallback)

        if let constraint {
            constraint.constant = dimension
            return
        }

        let newConstraint = anchor.constraint(equalToConstant: dimension)
        newConstraint.isActive = true
        constraint = newConstraint
    }
}
