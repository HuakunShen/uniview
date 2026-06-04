import Foundation

func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() {
        fputs("FAIL: \(message)\n", stderr)
        exit(1)
    }
}

@main
struct CommandPaletteModelTests {
    static func main() {
        let commands = [
            PluginCommand(
                id: "simple-demo",
                title: "Simple Demo",
                subtitle: "Counter and text input",
                keywords: ["counter", "input"],
                iconName: "1.circle"
            ),
            PluginCommand(
                id: "advanced-demo",
                title: "Advanced Demo",
                subtitle: "Form, switches, and toggles",
                keywords: ["form", "settings"],
                iconName: "slider.horizontal.3"
            ),
        ]

        let model = CommandPaletteModel(commands: commands)
        expect(model.filteredCommands.map(\.id) == ["simple-demo", "advanced-demo"], "all commands are visible with an empty query")
        expect(model.selectedCommand?.id == "simple-demo", "first command is selected by default")

        model.updateQuery("form")
        expect(model.filteredCommands.map(\.id) == ["advanced-demo"], "query matches title, subtitle, and keywords")
        expect(model.selectedCommand?.id == "advanced-demo", "selection moves to the first filtered command")

        model.updateQuery("simple")
        expect(model.selectedCommand?.id == "simple-demo", "selection follows a new filtered result")

        model.updateQuery("")
        model.selectNext()
        expect(model.selectedCommand?.id == "advanced-demo", "selectNext moves down")
        model.selectNext()
        expect(model.selectedCommand?.id == "simple-demo", "selectNext wraps")
        model.selectPrevious()
        expect(model.selectedCommand?.id == "advanced-demo", "selectPrevious wraps")

        print("CommandPaletteModelTests passed")
    }
}
