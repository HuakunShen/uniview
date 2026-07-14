import AppKit
import Testing

@testable import UniviewAppKit
@testable import UniviewNativeCore

@MainActor
@Suite struct ComponentTests {
    private func mount(_ component: Component, _ node: ShadowNode, context: MountContext = .noop)
        -> NSView
    {
        let view = component.makeView(for: node)
        component.update(view, node: node, context: context)
        return view
    }

    @Test func buttonReflectsTitleAndDisabled() throws {
        let node = ShadowNode.from(
            UINode(
                id: "b", type: "Button",
                props: ["title": .string("Save"), "disabled": .bool(true)]))
        let button = try #require(mount(ButtonComponent(), node) as? NSButton)
        #expect(button.title == "Save")
        #expect(button.isEnabled == false)
    }

    @Test func buttonFallsBackToFlattenedTextForTitle() throws {
        let node = ShadowNode.from(
            UINode(id: "b", type: "Button", children: [UINode.text("Open", id: "t")]))
        let button = try #require(mount(ButtonComponent(), node) as? NSButton)
        #expect(button.title == "Open")
    }

    @Test func buttonClickFiresHandlerId() throws {
        var fired: (id: String, args: [JSONValue])?
        let context = MountContext { id, args in fired = (id, args) }
        let node = ShadowNode.from(
            UINode(
                id: "b", type: "Button",
                props: ["title": .string("Go"), "_onClickHandlerId": .string("h1")]))
        let button = try #require(mount(ButtonComponent(), node, context: context) as? NSButton)
        let action = try #require(button.action)
        _ = (button.target as? NSObject)?.perform(action)
        #expect(fired?.id == "h1")
        #expect(fired?.args.isEmpty == true)
    }

    @Test func textUsesFlattenedChildrenAndTypography() throws {
        let node = ShadowNode.from(
            UINode(
                id: "t", type: "Text",
                props: ["style": .object(["fontSize": .number(20), "fontWeight": .string("bold")])],
                children: [UINode.text("Hello", id: "x")]))
        let label = try #require(mount(TextComponent(), node) as? NSTextField)
        #expect(label.stringValue == "Hello")
        #expect(label.font?.pointSize == 20)
    }

    @Test func textResolvesSemanticColor() throws {
        let node = ShadowNode.from(
            UINode(
                id: "t", type: "Text",
                props: ["style": .object(["color": .string("secondaryLabel")])],
                children: [UINode.text("Muted", id: "x")]))
        let label = try #require(mount(TextComponent(), node) as? NSTextField)
        #expect(label.textColor == .secondaryLabelColor)
    }

    @Test func viewAppliesBackgroundAndRadius() throws {
        let node = ShadowNode.from(
            UINode(
                id: "v", type: "View",
                props: [
                    "style": .object([
                        "backgroundColor": .string("#ff0000"), "borderRadius": .number(8),
                    ])
                ]))
        let view = mount(ViewComponent(), node)
        let layer = try #require(view.layer)
        #expect(layer.cornerRadius == 8)
        #expect(layer.backgroundColor != nil)
        #expect(!(view is NSVisualEffectView))
    }

    @Test func viewWithMaterialBecomesVibrancy() throws {
        let node = ShadowNode.from(
            UINode(id: "v", type: "View", props: ["material": .string("sidebar")]))
        let view = mount(ViewComponent(), node)
        let effect = try #require(view as? NSVisualEffectView)
        #expect(effect.material == .sidebar)
        #expect(effect.blendingMode == .behindWindow)
    }

    @Test func textInputGuardsAgainstFeedbackLoop() throws {
        var changes: [String] = []
        let context = MountContext { _, args in
            if case .string(let value)? = args.first { changes.append(value) }
        }
        let node = ShadowNode.from(
            UINode(
                id: "i", type: "TextInput",
                props: ["value": .string("initial"), "_onChangeHandlerId": .string("h")]))
        let field = try #require(mount(TextInputComponent(), node, context: context) as? HandlerTextField)
        #expect(field.stringValue == "initial")
        #expect(changes.isEmpty)

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
