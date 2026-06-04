import Foundation

struct RaycastGridItem: Equatable {
    let id: String
    let sectionTitle: String?
    let title: String
    let subtitle: String
    let content: String
    let keywords: [String]
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

struct RaycastGridModel {
    let root: NodeViewModel
    let query: String
    let columns: Int
    let items: [RaycastGridItem]
    let selectedItemId: String?
    let filteringEnabled: Bool
    let dropdown: RaycastSearchBarDropdown?

    init(root: NodeViewModel, query: String) {
        self.root = root
        self.query = query
        self.columns = max(1, root.props["columns"]?.intValue ?? 4)
        self.items = RaycastGridModel.extractItems(from: root.children, sectionTitle: nil)
        self.selectedItemId = root.props["selectedItemId"]?.stringValue
        self.filteringEnabled = root.props["filtering"]?.boolValue ?? true
        self.dropdown = RaycastSearchBarDropdownParser.extract(
            from: root.children,
            dropdownType: "GridDropdown",
            itemType: "GridDropdownItem"
        )
    }

    var visibleItems: [RaycastGridItem] {
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
        }
    }

    var selectedItem: RaycastGridItem? {
        guard let selectedItemId else {
            return visibleItems.first
        }

        return visibleItems.first { $0.id == selectedItemId } ?? visibleItems.first
    }

    private static func extractItems(from children: [NodeViewModel], sectionTitle: String?) -> [RaycastGridItem] {
        children.flatMap { child -> [RaycastGridItem] in
            if child.type == "GridItem" {
                return [makeItem(from: child, sectionTitle: sectionTitle)]
            }
            if child.type == "GridSection" {
                let title = child.props["title"]?.stringValue ?? sectionTitle
                return extractItems(from: child.children, sectionTitle: title)
            }
            return []
        }
    }

    private static func makeItem(from model: NodeViewModel, sectionTitle: String?) -> RaycastGridItem {
        let actionPanel = model.children.first { $0.type == "ActionPanel" }

        return RaycastGridItem(
            id: model.props["id"]?.stringValue ?? model.id,
            sectionTitle: sectionTitle,
            title: model.props["title"]?.stringValue ?? model.textContent,
            subtitle: model.props["subtitle"]?.stringValue ?? "",
            content: model.props["content"]?.stringValue ?? "",
            keywords: strings(from: model.props["keywords"]),
            actions: extractActions(from: actionPanel)
        )
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

    private static func strings(from value: JSONValue?) -> [String] {
        value?.arrayValue?.compactMap(\.stringValue) ?? []
    }
}
