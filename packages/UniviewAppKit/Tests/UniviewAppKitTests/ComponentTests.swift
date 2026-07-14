import AppKit
import Testing

@testable import UniviewAppKit
@testable import UniviewNativeCore

@MainActor
@Suite struct ComponentTests {
    @Test func buttonReflectsTitleAndDisabled() throws {
        let component = ButtonComponent()
        let view = component.makeView()
        let node = ShadowNode.from(
            UINode(
                id: "b", type: "Button",
                props: ["title": .string("Save"), "disabled": .bool(true)])
        )
        component.update(view, node: node, context: .noop)
        let button = try #require(view as? NSButton)
        #expect(button.title == "Save")
        #expect(button.isEnabled == false)
    }

    @Test func buttonFallsBackToFlattenedTextForTitle() throws {
        let component = ButtonComponent()
        let view = component.makeView()
        let node = ShadowNode.from(
            UINode(id: "b", type: "Button", children: [UINode.text("Open", id: "t")])
        )
        component.update(view, node: node, context: .noop)
        let button = try #require(view as? NSButton)
        #expect(button.title == "Open")
    }

    @Test func buttonClickFiresHandlerId() throws {
        let component = ButtonComponent()
        let view = component.makeView()
        var fired: (id: String, args: [JSONValue])?
        let context = MountContext { id, args in fired = (id, args) }
        let node = ShadowNode.from(
            UINode(
                id: "b", type: "Button",
                props: ["title": .string("Go"), "_onClickHandlerId": .string("h1")])
        )
        component.update(view, node: node, context: context)
        // Drive the wired target/action directly (performClick needs an app
        // run loop that doesn't exist in a windowless test).
        let button = try #require(view as? NSButton)
        let action = try #require(button.action)
        _ = (button.target as? NSObject)?.perform(action)
        #expect(fired?.id == "h1")
        #expect(fired?.args.isEmpty == true)
    }

    @Test func textUsesFlattenedChildrenAndTypography() throws {
        let component = TextComponent()
        let view = component.makeView()
        let node = ShadowNode.from(
            UINode(
                id: "t", type: "Text",
                props: ["style": .object(["fontSize": .number(20), "fontWeight": .string("bold")])],
                children: [UINode.text("Hello", id: "x")])
        )
        component.update(view, node: node, context: .noop)
        let label = try #require(view as? NSTextField)
        #expect(label.stringValue == "Hello")
        #expect(label.font?.pointSize == 20)
    }

    @Test func viewAppliesBackgroundAndRadius() throws {
        let component = ViewComponent()
        let view = component.makeView()
        let node = ShadowNode.from(
            UINode(
                id: "v", type: "View",
                props: [
                    "style": .object([
                        "backgroundColor": .string("#ff0000"),
                        "borderRadius": .number(8),
                    ])
                ])
        )
        component.update(view, node: node, context: .noop)
        let layer = try #require(view.layer)
        #expect(layer.cornerRadius == 8)
        #expect(layer.backgroundColor != nil)
    }

    @Test func textInputGuardsAgainstFeedbackLoop() throws {
        let component = TextInputComponent()
        let view = component.makeView()
        var changes: [String] = []
        let context = MountContext { _, args in
            if case .string(let value)? = args.first { changes.append(value) }
        }
        let node = ShadowNode.from(
            UINode(
                id: "i", type: "TextInput",
                props: ["value": .string("initial"), "_onChangeHandlerId": .string("h")])
        )
        component.update(view, node: node, context: context)
        let field = try #require(view as? HandlerTextField)
        #expect(field.stringValue == "initial")
        #expect(changes.isEmpty)  // host-driven value must not echo back

        // A user edit routes through the delegate and fires onChange.
        field.stringValue = "typed"
        field.controlTextDidChange(
            Notification(name: NSControl.textDidChangeNotification, object: field))
        #expect(changes == ["typed"])
    }

    @Test func registryResolvesBuiltinsAndFallback() {
        let registry = ComponentRegistry.standard()
        #expect(registry.isRegistered("Button"))
        #expect(registry.isRegistered("Text"))
        #expect(registry.isRegistered("TextInput"))
        #expect(registry.isRegistered("View"))
        #expect(!registry.isRegistered("Nonexistent"))
        #expect(registry.component(for: "Nonexistent") is UnknownComponent)
    }
}
