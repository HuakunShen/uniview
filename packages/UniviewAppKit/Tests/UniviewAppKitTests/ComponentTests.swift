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
        let container = try #require(
            mount(TextInputComponent(), node, context: context) as? StyledFieldView)
        let field = container.field
        #expect(field.stringValue == "initial")
        #expect(changes.isEmpty)

        field.stringValue = "typed"
        field.controlTextDidChange(
            Notification(name: NSControl.textDidChangeNotification, object: field))
        #expect(changes == ["typed"])
    }

    /// The field's chrome is the plugin's to set. It used to paint a fixed
    /// translucent fill, hairline and radius that no tree could reach — a look
    /// compiled into the renderer. Now the Style IR drives them.
    @Test func aTextFieldDrawsTheChromeTheStyleIRAsksFor() throws {
        let node = ShadowNode.from(
            UINode(
                id: "f", type: "TextInput",
                props: [
                    "placeholder": .string("Search"),
                    "style": .object([
                        "backgroundColor": .string("#0000ff"),
                        "borderColor": .string("#ff0000"),
                        "borderWidth": .number(2),
                        "borderRadius": .number(4),
                    ]),
                ]))
        let container = try #require(mount(TextInputComponent(), node) as? StyledFieldView)

        #expect(container.layer?.cornerRadius == 4)
        #expect(container.layer?.borderWidth == 2)
        let fill = try #require(container.layer?.backgroundColor).flatMap { NSColor(cgColor: $0) }?
            .usingColorSpace(.sRGB)
        #expect(try #require(fill).blueComponent > 0.9)
        let border = try #require(container.layer?.borderColor).flatMap { NSColor(cgColor: $0) }?
            .usingColorSpace(.sRGB)
        #expect(try #require(border).redComponent > 0.9)
    }

    /// An unstyled field is not a bug — it falls back to the *system's* own
    /// semantic colors (a faint label-color fill, a separator hairline), never an
    /// invented brand tint. The point is only that the plugin *can* override them.
    @Test func anUnstyledTextFieldFallsBackToSystemColors() throws {
        let node = ShadowNode.from(
            UINode(id: "f", type: "TextInput", props: ["placeholder": .string("Search")]))
        let container = try #require(mount(TextInputComponent(), node) as? StyledFieldView)
        // The default geometry survives; nothing crashed for lack of a style.
        #expect(container.layer?.cornerRadius == 10)
        #expect(container.layer?.backgroundColor != nil)
    }

    /// An unstyled button is a REAL native button. The renderer has no house
    /// style to impose — that is the whole point of rendering natively.
    @Test func anUnstyledButtonIsANativeBezelButton() throws {
        let node = ShadowNode.from(
            UINode(id: "b", type: "Button", props: ["title": .string("Save")]))
        let button = try #require(mount(ButtonComponent(), node) as? NSButton)
        #expect(button.title == "Save")
        #expect(button.isBordered)
        #expect(button.bezelStyle == .rounded)
    }

    /// The brand belongs to the plugin. `variant: "primary"` used to make the
    /// renderer paint *Uniview's* blue→violet gradient; now a gradient is only
    /// ever drawn because the tree asked for one, in colors the tree chose.
    @Test func aButtonPaintsOnlyTheGradientTheTreeAskedFor() throws {
        let node = ShadowNode.from(
            UINode(
                id: "b", type: "Button",
                props: [
                    "title": .string("Save"),
                    "style": .object([
                        "backgroundGradient": .object([
                            "direction": .string("to-r"),
                            "colors": .array([.string("#ff0000"), .string("#00ff00")]),
                        ]),
                        "borderRadius": .number(10),
                    ]),
                ]))
        let button = try #require(mount(ButtonComponent(), node) as? NSButton)
        #expect(!button.isBordered)  // custom fill replaces the bezel

        let gradient = try #require(
            button.layer?.sublayers?.compactMap { $0 as? CAGradientLayer }.first)
        #expect(gradient.colors?.count == 2)
        #expect(gradient.startPoint == CGPoint(x: 0, y: 0.5))  // to-r
        #expect(gradient.endPoint == CGPoint(x: 1, y: 0.5))
        #expect(gradient.cornerRadius == 10)
    }

    /// A bordered-but-unfilled button — an `outline` look
    /// (`border border-border rounded-md text-foreground`) — is just as clearly
    /// plugin-drawn as a filled one. Keying "did the plugin style this?" on the
    /// fill alone made these fall back to the native bezel and threw the border,
    /// radius and text color away.
    @Test func aBorderedButtonWithNoFillIsStillPluginDrawn() throws {
        let node = ShadowNode.from(
            UINode(
                id: "b", type: "Button",
                props: [
                    "title": .string("Outline"),
                    "style": .object([
                        "borderWidth": .number(1),
                        "borderColor": .string("#ff0000"),
                        "borderRadius": .number(6),
                    ]),
                ]))
        let button = try #require(mount(ButtonComponent(), node) as? NSButton)
        // Not the native bezel — the plugin's outline.
        #expect(!button.isBordered)
        #expect(button.layer?.borderWidth == 1)
        let border = try #require(button.layer?.borderColor).flatMap { NSColor(cgColor: $0) }?
            .usingColorSpace(.sRGB)
        #expect(try #require(border).redComponent > 0.9)
        #expect(button.layer?.cornerRadius == 6)
    }

    /// `variant` is not a prop any more. A tree that still sends one gets a plain
    /// native button — never a design the renderer invented.
    @Test func variantIsNotAThing() throws {
        let node = ShadowNode.from(
            UINode(
                id: "b", type: "Button",
                props: ["title": .string("Save"), "variant": .string("primary")]))
        let button = try #require(mount(ButtonComponent(), node) as? NSButton)
        #expect(button.isBordered)
    }

    @Test func viewWithGradientBecomesGradientView() throws {
        let node = ShadowNode.from(
            UINode(
                id: "v", type: "View",
                props: [
                    "style": .object([
                        "backgroundGradient": .object([
                            "direction": .string("to-br"),
                            "colors": .array([.string("#2e91c7"), .string("#4f6bf2")]),
                        ])
                    ])
                ]))
        let view = mount(ViewComponent(), node)
        #expect(view is GradientView)
    }

    @Test func iconRendersSymbolImage() throws {
        let node = ShadowNode.from(
            UINode(
                id: "i", type: "Icon",
                props: [
                    "symbol": .string("house.fill"),
                    "style": .object(["color": .string("accent")]),
                ]))
        let imageView = try #require(mount(IconComponent(), node) as? NSImageView)
        #expect(imageView.image != nil)
        // `accent` is the color the USER picked in System Settings — not a blue
        // the framework decided on.
        #expect(imageView.contentTintColor == NSColor.controlAccentColor)
    }

    @Test func registryResolvesBuiltinsAndFallback() {
        let registry = ComponentRegistry.standard()
        #expect(registry.isRegistered("Button"))
        #expect(registry.isRegistered("Text"))
        #expect(registry.isRegistered("TextInput"))
        #expect(registry.isRegistered("Icon"))
        #expect(registry.isRegistered("View"))
        #expect(!registry.isRegistered("Nonexistent"))
        #expect(registry.component(for: "Nonexistent") is UnknownComponent)
    }
}
