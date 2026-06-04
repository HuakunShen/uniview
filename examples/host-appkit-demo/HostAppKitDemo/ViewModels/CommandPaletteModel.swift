import Foundation

struct PluginCommand: Equatable {
    let id: String
    let title: String
    let subtitle: String
    let keywords: [String]
    let iconName: String

    static let builtInCommands = [
        PluginCommand(
            id: "raycast-demo",
            title: "Issues Demo",
            subtitle: "Native list, detail, and actions",
            keywords: ["issues", "list", "detail", "actions", "native"],
            iconName: "command"
        ),
        PluginCommand(
            id: "clipboard-history",
            title: "Clipboard History",
            subtitle: "List detail, preview, metadata, and actions",
            keywords: ["clipboard", "history", "list", "detail", "metadata"],
            iconName: "clipboard"
        ),
        PluginCommand(
            id: "grid-demo",
            title: "Grid Demo",
            subtitle: "Native visual asset grid",
            keywords: ["grid", "images", "icons", "native"],
            iconName: "square.grid.2x2"
        ),
        PluginCommand(
            id: "form-demo",
            title: "Preferences Form",
            subtitle: "Native form controls",
            keywords: ["form", "preferences", "settings", "native"],
            iconName: "gearshape"
        ),
        PluginCommand(
            id: "detail-demo",
            title: "Detail Demo",
            subtitle: "Standalone image preview, metadata, and actions",
            keywords: ["detail", "image", "preview", "metadata", "native"],
            iconName: "doc.richtext"
        ),
        PluginCommand(
            id: "simple-demo",
            title: "Simple Demo",
            subtitle: "Counter, greeting, and text input",
            keywords: ["counter", "input", "hello", "react"],
            iconName: "1.circle"
        ),
        PluginCommand(
            id: "advanced-demo",
            title: "Advanced Demo",
            subtitle: "Form, switches, toggles, and async submit",
            keywords: ["form", "settings", "toggle", "switch"],
            iconName: "slider.horizontal.3"
        ),
    ]
}

final class CommandPaletteModel {
    private let commands: [PluginCommand]
    private(set) var query: String = ""
    private(set) var selectedCommandId: String?

    init(commands: [PluginCommand]) {
        self.commands = commands
        selectedCommandId = commands.first?.id
    }

    var filteredCommands: [PluginCommand] {
        let normalizedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalizedQuery.isEmpty else {
            return commands
        }

        return commands.filter { command in
            command.title.lowercased().contains(normalizedQuery)
                || command.subtitle.lowercased().contains(normalizedQuery)
                || command.keywords.contains { $0.lowercased().contains(normalizedQuery) }
        }
    }

    var selectedCommand: PluginCommand? {
        guard let selectedCommandId else {
            return filteredCommands.first
        }

        return filteredCommands.first { $0.id == selectedCommandId } ?? filteredCommands.first
    }

    func updateQuery(_ newQuery: String) {
        query = newQuery
        keepSelectionInFilteredCommands()
    }

    func selectNext() {
        moveSelection(offset: 1)
    }

    func selectPrevious() {
        moveSelection(offset: -1)
    }

    func select(commandId: String) {
        guard filteredCommands.contains(where: { $0.id == commandId }) else {
            return
        }
        selectedCommandId = commandId
    }

    private func keepSelectionInFilteredCommands() {
        let visibleCommands = filteredCommands
        guard !visibleCommands.isEmpty else {
            selectedCommandId = nil
            return
        }

        if let selectedCommandId, visibleCommands.contains(where: { $0.id == selectedCommandId }) {
            return
        }

        selectedCommandId = visibleCommands.first?.id
    }

    private func moveSelection(offset: Int) {
        let visibleCommands = filteredCommands
        guard !visibleCommands.isEmpty else {
            selectedCommandId = nil
            return
        }

        let currentIndex = selectedCommand.flatMap { selected in
            visibleCommands.firstIndex(where: { $0.id == selected.id })
        } ?? 0
        let nextIndex = (currentIndex + offset + visibleCommands.count) % visibleCommands.count
        selectedCommandId = visibleCommands[nextIndex].id
    }
}
