import Foundation

enum RaycastShortcut {
    static func normalize(_ shortcut: String?) -> String? {
        guard let shortcut else {
            return nil
        }

        let parts = shortcut
            .lowercased()
            .split(separator: "+")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard let key = parts.last else {
            return nil
        }

        var modifiers = Set<String>()
        for part in parts.dropLast() {
            switch part {
            case "cmd", "command":
                modifiers.insert("cmd")
            case "ctrl", "control":
                modifiers.insert("ctrl")
            case "option", "opt", "alt":
                modifiers.insert("option")
            case "shift":
                modifiers.insert("shift")
            default:
                return nil
            }
        }

        let normalizedKey: String
        switch key {
        case "\r", "\n", "enter":
            normalizedKey = "return"
        case " ":
            normalizedKey = "space"
        case "\t":
            normalizedKey = "tab"
        case "\u{1b}", "esc":
            normalizedKey = "escape"
        default:
            normalizedKey = key
        }

        var normalizedParts: [String] = []
        if modifiers.contains("cmd") {
            normalizedParts.append("cmd")
        }
        if modifiers.contains("ctrl") {
            normalizedParts.append("ctrl")
        }
        if modifiers.contains("option") {
            normalizedParts.append("option")
        }
        if modifiers.contains("shift") {
            normalizedParts.append("shift")
        }
        normalizedParts.append(normalizedKey)
        return normalizedParts.joined(separator: "+")
    }
}

struct RaycastListAction: Equatable {
    let title: String
    let handlerId: String?
    let isDisabled: Bool
    let style: String
    let shortcut: String?
}

enum RaycastDetailMetadataItem: Equatable {
    case label(title: String, text: String, icon: String?)
    case separator
}

struct RaycastListItem: Equatable {
    let id: String
    let sectionTitle: String?
    let title: String
    let subtitle: String
    let icon: String?
    let keywords: [String]
    let accessories: [String]
    let detailMarkdown: String
    let detailImageSource: String?
    let detailMetadata: [RaycastDetailMetadataItem]
    let actions: [RaycastListAction]

    var primaryAction: RaycastListAction? {
        actions.first { !$0.isDisabled && $0.handlerId != nil }
    }

    func action(matchingShortcut shortcut: String) -> RaycastListAction? {
        guard let normalizedShortcut = RaycastShortcut.normalize(shortcut) else {
            return nil
        }

        return actions.first { action in
            !action.isDisabled
                && action.handlerId != nil
                && RaycastShortcut.normalize(action.shortcut) == normalizedShortcut
        }
    }
}

struct RaycastEmptyState: Equatable {
    let title: String
    let description: String
    let icon: String?

    static let fallback = RaycastEmptyState(title: "No results", description: "", icon: nil)

    var message: String {
        description.isEmpty ? title : "\(title)\n\n\(description)"
    }
}

struct RaycastSearchBarDropdownItem: Equatable {
    let value: String
    let title: String
    let icon: String?
}

struct RaycastSearchBarDropdown: Equatable {
    let value: String
    let tooltip: String
    let handlerId: String?
    let items: [RaycastSearchBarDropdownItem]

    var selectedIndex: Int? {
        items.firstIndex { $0.value == value }
    }
}

enum RaycastSearchBarDropdownParser {
    static func extract(from children: [NodeViewModel], dropdownType: String, itemType: String) -> RaycastSearchBarDropdown? {
        guard let dropdownNode = children.first(where: { $0.type == dropdownType }) else {
            return nil
        }

        let items = dropdownNode.children.compactMap { child -> RaycastSearchBarDropdownItem? in
            guard child.type == itemType else {
                return nil
            }

            let title = child.props["title"]?.stringValue ?? child.textContent
            let value = child.props["value"]?.stringValue ?? title
            return RaycastSearchBarDropdownItem(
                value: value,
                title: title,
                icon: child.props["icon"]?.stringValue
            )
        }

        guard !items.isEmpty else {
            return nil
        }

        let configuredValue = dropdownNode.props["value"]?.stringValue
            ?? dropdownNode.props["defaultValue"]?.stringValue
        let value = configuredValue.flatMap { configured in
            items.contains { $0.value == configured } ? configured : nil
        } ?? items[0].value

        return RaycastSearchBarDropdown(
            value: value,
            tooltip: dropdownNode.props["tooltip"]?.stringValue ?? "",
            handlerId: dropdownNode.handlerId(for: "onChange"),
            items: items
        )
    }
}

struct RaycastListModel {
    let root: NodeViewModel
    let query: String
    let items: [RaycastListItem]
    let selectedItemId: String?
    let filteringEnabled: Bool
    let emptyState: RaycastEmptyState
    let dropdown: RaycastSearchBarDropdown?

    var emptyMessage: String {
        emptyState.message
    }

    init(root: NodeViewModel, query: String) {
        self.root = root
        self.query = query
        self.items = RaycastListModel.extractItems(from: root.children, sectionTitle: nil)
        self.selectedItemId = root.props["selectedItemId"]?.stringValue
        self.filteringEnabled = root.props["filtering"]?.boolValue ?? true
        self.emptyState = RaycastListModel.extractEmptyState(from: root.children)
        self.dropdown = RaycastSearchBarDropdownParser.extract(
            from: root.children,
            dropdownType: "ListDropdown",
            itemType: "ListDropdownItem"
        )
    }

    var visibleItems: [RaycastListItem] {
        guard filteringEnabled else {
            return items
        }

        let normalizedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalizedQuery.isEmpty else {
            return items
        }

        return items.filter { item in
            item.title.lowercased().contains(normalizedQuery)
                || item.subtitle.lowercased().contains(normalizedQuery)
                || item.keywords.contains { $0.lowercased().contains(normalizedQuery) }
                || item.accessories.contains { $0.lowercased().contains(normalizedQuery) }
        }
    }

    var selectedItem: RaycastListItem? {
        guard let selectedItemId else {
            return visibleItems.first
        }

        return visibleItems.first { $0.id == selectedItemId } ?? visibleItems.first
    }

    private static func extractItems(from children: [NodeViewModel], sectionTitle: String?) -> [RaycastListItem] {
        children.flatMap { child -> [RaycastListItem] in
            if child.type == "ListItem" {
                return [makeItem(from: child, sectionTitle: sectionTitle)]
            }
            if child.type == "ListSection" {
                let title = child.props["title"]?.stringValue ?? sectionTitle
                return extractItems(from: child.children, sectionTitle: title)
            }
            return []
        }
    }

    private static func makeItem(from model: NodeViewModel, sectionTitle: String?) -> RaycastListItem {
        let detailNode = model.children.first { $0.type == "ListItemDetail" || $0.type == "Detail" }
        let actionPanel = model.children.first { $0.type == "ActionPanel" }

        return RaycastListItem(
            id: model.props["id"]?.stringValue ?? model.id,
            sectionTitle: sectionTitle,
            title: model.props["title"]?.stringValue ?? model.textContent,
            subtitle: model.props["subtitle"]?.stringValue ?? "",
            icon: model.props["icon"]?.stringValue,
            keywords: strings(from: model.props["keywords"]),
            accessories: strings(from: model.props["accessories"]),
            detailMarkdown: detailNode?.props["markdown"]?.stringValue ?? detailNode?.textContent ?? "",
            detailImageSource: imageSource(from: detailNode),
            detailMetadata: extractMetadata(from: detailNode),
            actions: extractActions(from: actionPanel)
        )
    }

    private static func imageSource(from detailNode: NodeViewModel?) -> String? {
        guard let detailNode else {
            return nil
        }

        if detailNode.type == "img" {
            return detailNode.props["src"]?.stringValue
        }

        return detailNode.children.first { $0.type == "img" }?.props["src"]?.stringValue
    }

    private static func extractMetadata(from detailNode: NodeViewModel?) -> [RaycastDetailMetadataItem] {
        guard let detailNode else {
            return []
        }

        let metadataNode = detailNode.children.first {
            $0.type == "ListItemDetailMetadata" || $0.type == "DetailMetadata"
        }

        return metadataNode?.children.compactMap { child in
            switch child.type {
            case "ListItemDetailMetadataLabel", "DetailMetadataLabel":
                return .label(
                    title: child.props["title"]?.stringValue ?? child.textContent,
                    text: child.props["text"]?.stringValue ?? "",
                    icon: child.props["icon"]?.stringValue
                )
            case "ListItemDetailMetadataSeparator", "DetailMetadataSeparator":
                return .separator
            default:
                return nil
            }
        } ?? []
    }

    private static func extractActions(from actionPanel: NodeViewModel?) -> [RaycastListAction] {
        actionPanel?.children.compactMap { action in
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
        } ?? []
    }

    private static func extractEmptyState(from children: [NodeViewModel]) -> RaycastEmptyState {
        guard let emptyNode = children.first(where: { $0.type == "EmptyView" }) else {
            return .fallback
        }

        return RaycastEmptyState(
            title: emptyNode.props["title"]?.stringValue ?? "No results",
            description: emptyNode.props["description"]?.stringValue ?? "",
            icon: emptyNode.props["icon"]?.stringValue
        )
    }

    private static func strings(from value: JSONValue?) -> [String] {
        value?.arrayValue?.compactMap(\.stringValue) ?? []
    }
}
