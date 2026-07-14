import UniviewNativeCore

// UI fixtures for the demo. In a real app this tree arrives from a plugin over
// the transport as CommitBatches; here it's authored inline to prove native
// rendering. (Text/Button use explicit heights until Yoga measure functions
// land, so they self-size to content.)

func styled(
    _ id: String, _ type: String,
    style: [String: JSONValue],
    props: [String: JSONValue] = [:],
    children: [UINode] = []
) -> UINode {
    var merged = props
    merged["style"] = .object(style)
    return UINode(id: id, type: type, props: merged, children: children)
}

func label(_ id: String, _ string: String, style: [String: JSONValue] = [:]) -> UINode {
    styled(id, "Text", style: style, children: [UINode.text(string, id: id + ".t")])
}

func button(_ id: String, _ title: String, style: [String: JSONValue] = [:]) -> UINode {
    styled(id, "Button", style: style, props: ["title": .string(title)])
}

/// A sidebar + content shell, laid out with flexbox.
func demoTree() -> UINode {
    styled(
        "root", "View",
        style: [
            "flexDirection": .string("row"),
            "width": .string("100%"), "height": .string("100%"),
            "backgroundColor": .string("#ffffff"),
        ],
        children: [sidebar(), content()])
}

private func sidebar() -> UINode {
    styled(
        "sidebar", "View",
        style: [
            "width": .number(210), "height": .string("100%"),
            "backgroundColor": .string("#f2f2f7"),
            "flexDirection": .string("column"),
            "paddingTop": .number(18), "paddingLeft": .number(14),
            "paddingRight": .number(14), "paddingBottom": .number(18),
            "gap": .number(6),
        ],
        children: [
            label(
                "brand", "Uniview",
                style: [
                    "fontSize": .number(20), "fontWeight": .string("bold"),
                    "color": .string("#111111"), "height": .number(26),
                ]),
            label(
                "brandSub", "Desktop Studio",
                style: ["fontSize": .number(12), "color": .string("#6b7280"), "height": .number(16)]),
            button("navHome", "Home", style: ["height": .number(30), "marginTop": .number(14)]),
            button("navPlugins", "Plugins", style: ["height": .number(30)]),
            button("navSettings", "Settings", style: ["height": .number(30)]),
            button("navAbout", "About", style: ["height": .number(30)]),
        ])
}

private func content() -> UINode {
    styled(
        "content", "View",
        style: [
            "flexGrow": .number(1), "height": .string("100%"),
            "flexDirection": .string("column"),
            "paddingTop": .number(24), "paddingLeft": .number(24),
            "paddingRight": .number(24), "paddingBottom": .number(24),
            "gap": .number(14),
        ],
        children: [
            label(
                "title", "Welcome to Uniview",
                style: [
                    "fontSize": .number(26), "fontWeight": .string("bold"),
                    "color": .string("#111111"), "height": .number(34),
                ]),
            label(
                "desc",
                "A real native macOS window rendered from a React-style tree through the Uniview Style IR and Yoga flexbox — no web view.",
                style: ["fontSize": .number(13), "color": .string("#6b7280"), "height": .number(20)]),
            card(),
        ])
}

private func card() -> UINode {
    styled(
        "card", "View",
        style: [
            "flexDirection": .string("column"), "gap": .number(10),
            "backgroundColor": .string("#f2f2f7"), "borderRadius": .number(10),
            "paddingTop": .number(16), "paddingLeft": .number(16),
            "paddingRight": .number(16), "paddingBottom": .number(16),
            "width": .number(360),
        ],
        children: [
            label(
                "formLabel", "Your name",
                style: [
                    "fontSize": .number(12), "fontWeight": .string("semibold"),
                    "color": .string("#111111"), "height": .number(16),
                ]),
            styled(
                "name", "TextInput",
                style: ["height": .number(24)],
                props: ["placeholder": .string("Type your name…")]),
            styled(
                "actions", "View",
                style: ["flexDirection": .string("row"), "gap": .number(8), "marginTop": .number(4)],
                children: [
                    button("save", "Save", style: ["width": .number(90), "height": .number(30)]),
                    button("cancel", "Cancel", style: ["width": .number(90), "height": .number(30)]),
                ]),
        ])
}
