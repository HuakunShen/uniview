import AppKit
import Foundation

func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() {
        fputs("FAIL: \(message)\n", stderr)
        exit(1)
    }
}

@main
struct RaycastActionPanelTests {
    static func main() {
        var executedHandlerIds: [String] = []
        let controller = RaycastActionPanelViewController(
            actions: [
                RaycastListAction(
                    title: "Disabled",
                    handlerId: "handler-disabled",
                    isDisabled: true,
                    style: "regular",
                    shortcut: "cmd+d"
                ),
                RaycastListAction(
                    title: "Copy",
                    handlerId: "handler-copy",
                    isDisabled: false,
                    style: "primary",
                    shortcut: "cmd+c"
                ),
                RaycastListAction(
                    title: "Open",
                    handlerId: "handler-open",
                    isDisabled: false,
                    style: "regular",
                    shortcut: "return"
                ),
            ],
            handlerExecutor: { handlerId, _ in
                executedHandlerIds.append(handlerId)
            }
        )

        _ = controller.view
        controller.triggerSelectedAction()
        expect(executedHandlerIds == ["handler-copy"], "action panel selects the first runnable action")

        controller.selectAction(offset: 1)
        controller.triggerSelectedAction()
        expect(executedHandlerIds == ["handler-copy", "handler-open"], "action panel moves to the next runnable action")

        controller.selectAction(offset: 1)
        controller.triggerSelectedAction()
        expect(executedHandlerIds == ["handler-copy", "handler-open", "handler-copy"], "action panel wraps around disabled rows")

        expect(controller.triggerAction(matchingShortcut: "CMD+C"), "action panel matches shortcuts case-insensitively")
        expect(executedHandlerIds == ["handler-copy", "handler-open", "handler-copy", "handler-copy"], "shortcut execution triggers matching action")

        expect(!controller.triggerAction(matchingShortcut: "cmd+d"), "disabled shortcut action is not runnable")

        guard let commandReturnEvent = NSEvent.keyEvent(
            with: .keyDown,
            location: .zero,
            modifierFlags: [.command],
            timestamp: 0,
            windowNumber: 0,
            context: nil,
            characters: "\r",
            charactersIgnoringModifiers: "\r",
            isARepeat: false,
            keyCode: 36
        ) else {
            fputs("FAIL: expected command-return event\n", stderr)
            exit(1)
        }
        expect(
            CommandSearchField.normalizedShortcut(for: commandReturnEvent) == "cmd+return",
            "command-return normalizes to the plugin shortcut spelling"
        )

        guard let commandShiftPEvent = NSEvent.keyEvent(
            with: .keyDown,
            location: .zero,
            modifierFlags: [.command, .shift],
            timestamp: 0,
            windowNumber: 0,
            context: nil,
            characters: "P",
            charactersIgnoringModifiers: "p",
            isARepeat: false,
            keyCode: 35
        ) else {
            fputs("FAIL: expected command-shift-p event\n", stderr)
            exit(1)
        }
        expect(
            CommandSearchField.normalizedShortcut(for: commandShiftPEvent) == "cmd+shift+p",
            "command-shift shortcuts normalize modifiers in plugin shortcut order"
        )

        print("RaycastActionPanelTests passed")
    }
}
