import UniviewNativeCore

// UI fixtures for the demo shell. In a real app these trees arrive from a
// plugin over the transport as CommitBatches; here they're authored inline to
// show the framework rendering native content in a native shell. Colors use
// semantic tokens (label / secondaryLabel / clear) so they adapt to light/dark
// and read correctly over the frosted background. (Text/Button use explicit
// heights until Yoga measure functions land.)

func demoSections() -> [DemoSection] {
    [
        DemoSection(title: "Home", symbol: "house", tree: homeTree),
        DemoSection(title: "Components", symbol: "square.grid.2x2", tree: componentsTree),
        DemoSection(title: "Forms", symbol: "textformat", tree: formsTree),
        DemoSection(title: "About", symbol: "info.circle", tree: aboutTree),
    ]
}

// MARK: - Builders

private func styled(
    _ id: String, _ type: String,
    style: [String: JSONValue],
    props: [String: JSONValue] = [:],
    children: [UINode] = []
) -> UINode {
    var merged = props
    merged["style"] = .object(style)
    return UINode(id: id, type: type, props: merged, children: children)
}

private func label(_ id: String, _ string: String, style: [String: JSONValue]) -> UINode {
    styled(id, "Text", style: style, children: [UINode.text(string, id: id + ".t")])
}

private func button(
    _ id: String, _ title: String, variant: String? = nil, style: [String: JSONValue] = [:]
) -> UINode {
    var props: [String: JSONValue] = ["title": .string(title)]
    if let variant { props["variant"] = .string(variant) }
    var s = style
    s["height"] = s["height"] ?? .number(30)
    return styled(id, "Button", style: s, props: props)
}

private func heading(_ id: String, _ text: String) -> UINode {
    label(
        id, text,
        style: [
            "fontSize": .number(28), "fontWeight": .string("bold"),
            "color": .string("label"), "height": .number(36),
        ])
}

private func subtitle(_ id: String, _ text: String) -> UINode {
    label(
        id, text,
        style: ["fontSize": .number(13), "color": .string("secondaryLabel"), "height": .number(20)])
}

private func page(_ id: String, _ children: [UINode]) -> UINode {
    styled(
        id, "View",
        style: [
            "flexDirection": .string("column"),
            "width": .string("100%"), "height": .string("100%"),
            "backgroundColor": .string("clear"),
            "paddingTop": .number(30), "paddingLeft": .number(34),
            "paddingRight": .number(34), "paddingBottom": .number(30),
            "gap": .number(16),
        ],
        children: children)
}

/// A translucent glass card (native popover material → Liquid Glass on macOS 26).
private func card(_ id: String, width: Double = 440, _ children: [UINode]) -> UINode {
    styled(
        id, "View",
        style: [
            "flexDirection": .string("column"), "gap": .number(12),
            "borderRadius": .number(14), "width": .number(width),
            "borderWidth": .number(1), "borderColor": .string("separator"),
            "paddingTop": .number(18), "paddingLeft": .number(18),
            "paddingRight": .number(18), "paddingBottom": .number(18),
        ],
        props: ["material": .string("popover")],
        children: children)
}

private func fieldLabel(_ id: String, _ text: String) -> UINode {
    label(
        id, text,
        style: [
            "fontSize": .number(12), "fontWeight": .string("semibold"),
            "color": .string("label"), "height": .number(16),
        ])
}

private func input(_ id: String, placeholder: String) -> UINode {
    styled(
        id, "TextInput",
        style: ["height": .number(24)],
        props: ["placeholder": .string(placeholder)])
}

private func row(_ id: String, gap: Double = 8, _ children: [UINode]) -> UINode {
    styled(
        id, "View",
        style: ["flexDirection": .string("row"), "gap": .number(gap), "marginTop": .number(4)],
        children: children)
}

// MARK: - Pages

private func homeTree() -> UINode {
    page("home", [
        heading("home.h", "Welcome to Uniview"),
        subtitle(
            "home.s",
            "A real native macOS window rendered from a React-style tree — Style IR + Yoga flexbox, no web view."),
        card("home.card", [
            fieldLabel("home.fl", "Your name"),
            input("home.in", placeholder: "Type your name…"),
            row("home.actions", [
                button("home.save", "Save", variant: "primary", style: ["width": .number(96)]),
                button("home.cancel", "Cancel", style: ["width": .number(96)]),
            ]),
        ]),
    ])
}

private func componentsTree() -> UINode {
    page("cmp", [
        heading("cmp.h", "Components"),
        subtitle("cmp.s", "Native primitives, driven by the Uniview protocol."),
        card("cmp.card", width: 460, [
            fieldLabel("cmp.b", "Buttons"),
            row("cmp.brow", [
                button("cmp.primary", "Primary", variant: "primary", style: ["width": .number(104)]),
                button("cmp.default", "Default", style: ["width": .number(104)]),
                button("cmp.disabled", "Disabled", style: ["width": .number(104)]),
            ]),
            fieldLabel("cmp.t", "Text"),
            label(
                "cmp.body",
                "Text supports size, weight, color and alignment from the Style IR.",
                style: ["fontSize": .number(13), "color": .string("secondaryLabel"), "height": .number(20)]),
        ]),
    ])
}

private func formsTree() -> UINode {
    page("form", [
        heading("form.h", "Forms"),
        subtitle("form.s", "Native text fields with two-way binding over the bridge."),
        card("form.card", [
            fieldLabel("form.nl", "Full name"),
            input("form.name", placeholder: "Ada Lovelace"),
            fieldLabel("form.el", "Email"),
            input("form.email", placeholder: "ada@example.com"),
            row("form.actions", [
                button("form.submit", "Submit", variant: "primary", style: ["width": .number(110)]),
            ]),
        ]),
    ])
}

private func aboutTree() -> UINode {
    page("about", [
        heading("about.h", "About Uniview"),
        subtitle(
            "about.s",
            "Write a plugin UI once with web-like ergonomics; render it as a real native application."),
        card("about.card", width: 480, [
            label(
                "about.body",
                "Uniview compiles a Tailwind-inspired Style IR and drives a Fabric-style shadow tree, laid out by Yoga and mounted onto native AppKit views — the same protocol will target Windows and HarmonyOS.",
                style: ["fontSize": .number(13), "color": .string("label"), "height": .number(72)]),
        ]),
    ])
}
