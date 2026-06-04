import Foundation

func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() {
        fputs("FAIL: \(message)\n", stderr)
        exit(1)
    }
}

@main
struct RaycastListModelTests {
    static func main() {
        let root = UINode(
            id: "root",
            type: "List",
            props: [
                "filtering": .bool(true),
                "selectedItemId": .string("issue-sync"),
            ],
            children: [
                .node(UINode(
                    id: "type-filter",
                    type: "ListDropdown",
                    props: [
                        "value": .string("Image"),
                        "tooltip": .string("Filter by content type"),
                        "_onChangeHandlerId": .string("handler-filter-type"),
                    ],
                    children: [
                        .node(UINode(
                            id: "all-types",
                            type: "ListDropdownItem",
                            props: [
                                "value": .string("All Types"),
                                "title": .string("All Types"),
                            ]
                        )),
                        .node(UINode(
                            id: "image-type",
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
                    id: "section",
                    type: "ListSection",
                    props: ["title": .string("Issues")],
                    children: [
                        .node(issueNode(
                            id: "issue-login",
                            title: "Fix login redirect",
                            subtitle: "#128",
                            keywords: ["auth", "urgent"],
                            accessories: ["P1"],
                            firstActionDisabled: true
                        )),
                        .node(issueNode(
                            id: "issue-sync",
                            title: "Audit plugin bridge reconnects",
                            subtitle: "#142",
                            keywords: ["bridge", "runtime"],
                            accessories: ["P2"],
                            firstActionDisabled: false
                        )),
                    ]
                )),
                .node(UINode(
                    id: "empty",
                    type: "EmptyView",
                    props: [
                        "title": .string("Nothing found"),
                        "description": .string("Try another query"),
                        "icon": .string("magnifyingglass"),
                    ]
                )),
            ]
        )

        let model = RaycastListModel(root: NodeViewModel(from: root), query: "p1")
        expect(model.items.count == 2, "all nested section items are parsed")
        expect(model.visibleItems.map(\.id) == ["issue-login"], "query matches accessories")
        expect(model.selectedItem?.id == "issue-login", "selection falls back into visible results")
        expect(model.emptyMessage == "Nothing found\n\nTry another query", "empty view text is parsed")
        expect(model.emptyState.icon == "magnifyingglass", "empty view icon is parsed")
        expect(model.dropdown?.value == "Image", "list dropdown selected value is parsed")
        expect(model.dropdown?.tooltip == "Filter by content type", "list dropdown tooltip is parsed")
        expect(model.dropdown?.handlerId == "handler-filter-type", "list dropdown change handler is parsed")
        expect(model.dropdown?.items.map(\.title) == ["All Types", "Image"], "list dropdown items are parsed")
        expect(model.dropdown?.items[1].icon == "photo", "list dropdown item icons are parsed")

        let login = model.items[0]
        expect(login.detailMarkdown.contains("Fix login redirect"), "detail markdown is parsed from child slot")
        expect(login.detailImageSource == "photo", "detail image child source is parsed")
        expect(login.sectionTitle == "Issues", "section title is preserved on nested list items")
        expect(login.detailMetadata.count == 3, "detail metadata rows are parsed")
        expect(login.detailMetadata[0] == .label(title: "Source", text: "Google Chrome", icon: "globe"), "metadata labels preserve title, text, and icon")
        expect(login.detailMetadata[1] == .separator, "metadata separators are parsed")
        expect(login.actions.count == 2, "action panel children are parsed")
        expect(login.primaryAction?.title == "Copy ID", "primary action skips disabled actions")
        expect(login.primaryAction?.handlerId == "handler-copy-issue-login", "action handler ID is preserved")
        expect(login.primaryAction?.shortcut == "cmd+c", "action shortcut is parsed")
        expect(login.action(matchingShortcut: "CMD+C")?.title == "Copy ID", "shortcut lookup is case-insensitive")

        print("RaycastListModelTests passed")
    }

    private static func issueNode(
        id: String,
        title: String,
        subtitle: String,
        keywords: [String],
        accessories: [String],
        firstActionDisabled: Bool
    ) -> UINode {
        UINode(
            id: id,
            type: "ListItem",
            props: [
                "id": .string(id),
                "title": .string(title),
                "subtitle": .string(subtitle),
                "keywords": .array(keywords.map(JSONValue.string)),
                "accessories": .array(accessories.map(JSONValue.string)),
            ],
            children: [
                .node(UINode(
                    id: "\(id)-detail",
                    type: "ListItemDetail",
                    props: ["markdown": .string("# \(title)\n\nDetails for \(id)")],
                    children: [
                        .node(UINode(
                            id: "\(id)-preview",
                            type: "img",
                            props: [
                                "src": .string("photo"),
                                "alt": .string("Preview"),
                                "width": .number(320),
                                "height": .number(180),
                            ]
                        )),
                        .node(UINode(
                            id: "\(id)-metadata",
                            type: "ListItemDetailMetadata",
                            children: [
                                .node(UINode(
                                    id: "\(id)-source",
                                    type: "ListItemDetailMetadataLabel",
                                    props: [
                                        "title": .string("Source"),
                                        "text": .string("Google Chrome"),
                                        "icon": .string("globe"),
                                    ]
                                )),
                                .node(UINode(
                                    id: "\(id)-separator",
                                    type: "ListItemDetailMetadataSeparator"
                                )),
                                .node(UINode(
                                    id: "\(id)-characters",
                                    type: "ListItemDetailMetadataLabel",
                                    props: [
                                        "title": .string("Characters"),
                                        "text": .string("54"),
                                    ]
                                )),
                            ]
                        )),
                    ]
                )),
                .node(UINode(
                    id: "\(id)-actions",
                    type: "ActionPanel",
                    children: [
                        .node(UINode(
                            id: "\(id)-open",
                            type: "Action",
                            props: [
                                "title": .string("Open Issue"),
                                "shortcut": .string("return"),
                                "disabled": .bool(firstActionDisabled),
                                "_onActionHandlerId": .string("handler-open-\(id)"),
                            ]
                        )),
                        .node(UINode(
                            id: "\(id)-copy",
                            type: "Action",
                            props: [
                                "title": .string("Copy ID"),
                                "shortcut": .string("cmd+c"),
                                "_onActionHandlerId": .string("handler-copy-\(id)"),
                            ]
                        )),
                    ]
                )),
            ]
        )
    }
}
