import UniviewNativeCore

// UI fixtures for the demo shell. In a real app these trees arrive from a
// plugin over the transport as CommitBatches; here they're authored inline to
// show the framework rendering native, reference-quality content in a native
// shell: gradient hero chips, glass cards, inset fields with leading glyphs, and
// brand-gradient buttons — all real AppKit views driven by the Style IR + Yoga.
// (Text/Icon/Button use explicit heights until Yoga measure functions land.)

func demoSections() -> [DemoSection] {
    [
        // The real thing: a React plugin renders, and we mount native AppKit views.
        // Everything below it is a Swift-authored fixture — useful for exercising
        // primitives, but NOT proof that the framework works end to end.
        DemoSection(title: "Live React", symbol: "bolt", source: .plugin(id: "simple-demo")),
        DemoSection(title: "Home", symbol: "house", source: .fixture(homeTree)),
        DemoSection(
            title: "Components", symbol: "square.grid.2x2", source: .fixture(componentsTree)),
        DemoSection(title: "Forms", symbol: "square.and.pencil", source: .fixture(formsTree)),
        DemoSection(title: "About", symbol: "info.circle", source: .fixture(aboutTree)),
    ]
}

// MARK: - Primitive builders

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

private func text(_ id: String, _ string: String, style: [String: JSONValue]) -> UINode {
    styled(id, "Text", style: style, children: [UINode.text(string, id: id + ".t")])
}

private func icon(
    _ id: String, _ symbol: String, size: Double, color: String, weight: String = "regular"
) -> UINode {
    styled(
        id, "Icon",
        style: [
            "fontSize": .number(size), "fontWeight": .string(weight), "color": .string(color),
            "width": .number(size + 6), "height": .number(size + 6),
        ],
        props: ["symbol": .string(symbol)])
}

private func vstack(
    _ id: String, gap: Double = 0, grow: Double? = nil, _ children: [UINode]
) -> UINode {
    var style: [String: JSONValue] = ["flexDirection": .string("column"), "gap": .number(gap)]
    if let grow { style["flexGrow"] = .number(grow); style["flexShrink"] = .number(1) }
    return styled(id, "View", style: style, children: children)
}

private func hstack(
    _ id: String, gap: Double = 8, align: String = "center", _ children: [UINode]
) -> UINode {
    styled(
        id, "View",
        style: [
            "flexDirection": .string("row"), "gap": .number(gap), "alignItems": .string(align),
        ],
        children: children)
}

// MARK: - Composite building blocks

/// A 46×46 rounded brand-gradient chip with a centered white glyph — the hero
/// accent from the reference's `PageHeader`.
private func iconChip(_ id: String, _ symbol: String) -> UINode {
    styled(
        id, "View",
        style: [
            "width": .number(46), "height": .number(46), "borderRadius": .number(12),
            "alignItems": .string("center"), "justifyContent": .string("center"),
            "backgroundGradient": .array([.string("brand"), .string("brand-violet")]),
            "shadow": .string("brand"),
        ],
        children: [icon(id + ".g", symbol, size: 20, color: "white", weight: "semibold")])
}

/// A large page header: gradient chip + bold title + secondary subtitle.
private func pageHeader(_ id: String, symbol: String, title: String, subtitle: String) -> UINode {
    hstack(id, gap: 14, [
        iconChip(id + ".chip", symbol),
        vstack(id + ".txt", gap: 3, grow: 1, [
            text(
                id + ".title", title,
                style: [
                    "fontSize": .number(26), "fontWeight": .string("bold"),
                    "color": .string("label"), "height": .number(32),
                ]),
            text(
                id + ".sub", subtitle,
                style: [
                    "fontSize": .number(13), "color": .string("secondaryLabel"),
                    "height": .number(20),
                ]),
        ]),
    ])
}

/// A translucent glass card (native popover material → Liquid Glass on macOS 26)
/// with a hairline outline and rounded corners.
private func card(_ id: String, gap: Double = 14, _ children: [UINode]) -> UINode {
    styled(
        id, "View",
        style: [
            "flexDirection": .string("column"), "gap": .number(gap),
            "borderRadius": .number(18), "width": .string("100%"),
            "borderWidth": .number(1), "borderColor": .string("separator"),
            "paddingTop": .number(20), "paddingLeft": .number(20),
            "paddingRight": .number(20), "paddingBottom": .number(20),
        ],
        props: ["material": .string("popover")],
        children: children)
}

/// A card/section title: brand glyph + headline (mirrors the reference `formTitle`).
/// The label grows to fill the row's main axis so it resolves a real width
/// without a text-measure function.
private func sectionTitle(_ id: String, symbol: String, _ title: String) -> UINode {
    hstack(id, gap: 8, [
        icon(id + ".i", symbol, size: 14, color: "brand", weight: "semibold"),
        text(
            id + ".t", title,
            style: [
                "fontSize": .number(15), "fontWeight": .string("semibold"),
                "color": .string("label"), "height": .number(20), "flexGrow": .number(1),
            ]),
    ])
}

/// A labeled inset field: a small caption above a rounded field with a leading glyph.
private func labeledField(
    _ id: String, label: String, symbol: String, placeholder: String
) -> UINode {
    vstack(id, gap: 6, [
        text(
            id + ".l", label,
            style: [
                "fontSize": .number(12), "fontWeight": .string("medium"),
                "color": .string("secondaryLabel"), "height": .number(15),
            ]),
        styled(
            id + ".f", "TextInput",
            style: ["height": .number(38), "width": .string("100%")],
            props: ["placeholder": .string(placeholder), "icon": .string(symbol)]),
    ])
}

private func primaryButton(_ id: String, _ title: String, symbol: String? = nil) -> UINode {
    var props: [String: JSONValue] = ["title": .string(title), "variant": .string("primary")]
    if let symbol { props["icon"] = .string(symbol) }
    return styled(
        id, "Button",
        style: ["height": .number(40), "width": .string("100%")],
        props: props)
}

private func bodyText(_ id: String, _ string: String, height: Double, color: String = "secondaryLabel")
    -> UINode
{
    text(
        id, string,
        style: [
            "fontSize": .number(13), "color": .string(color), "height": .number(height),
            "lineHeight": .number(19),
        ])
}

private func page(_ id: String, _ children: [UINode]) -> UINode {
    styled(
        id, "View",
        style: [
            "flexDirection": .string("column"),
            "width": .string("100%"), "height": .string("100%"),
            "backgroundColor": .string("clear"),
            "paddingTop": .number(26), "paddingLeft": .number(30),
            "paddingRight": .number(30), "paddingBottom": .number(24),
            "gap": .number(20),
        ],
        children: children)
}

// MARK: - Pages

private func homeTree() -> UINode {
    page("home", [
        pageHeader(
            "home.hdr", symbol: "sparkles", title: "Welcome to Uniview",
            subtitle: "A real native macOS window rendered from a React-style tree."),
        card("home.create", [
            sectionTitle("home.create.h", symbol: "plus.circle.fill", "Create Workspace"),
            labeledField(
                "home.name", label: "Workspace name", symbol: "square.grid.2x2",
                placeholder: "My Workspace"),
            labeledField(
                "home.device", label: "Device name", symbol: "laptopcomputer",
                placeholder: "This device"),
            primaryButton("home.go", "Create Workspace", symbol: "plus.circle"),
        ]),
        card("home.about", [
            sectionTitle("home.about.h", symbol: "cube.transparent", "Native, not a web view"),
            bodyText(
                "home.about.b",
                "Every control here is a real AppKit view — NSButton, NSTextField, NSVisualEffectView — laid out by Yoga flexbox from a platform-neutral Style IR.",
                height: 42),
        ]),
    ])
}

private func componentsTree() -> UINode {
    page("cmp", [
        pageHeader(
            "cmp.hdr", symbol: "square.grid.2x2", title: "Components",
            subtitle: "Native primitives, driven by the Uniview protocol."),
        card("cmp.card", [
            sectionTitle("cmp.b", symbol: "rectangle.and.hand.point.up.left", "Buttons"),
            hstack("cmp.brow", gap: 10, [
                styled(
                    "cmp.primary", "Button",
                    style: ["height": .number(40), "width": .number(150)],
                    props: [
                        "title": .string("Primary"), "variant": .string("primary"),
                        "icon": .string("bolt.fill"),
                    ]),
                styled(
                    "cmp.default", "Button",
                    style: ["height": .number(40), "width": .number(120)],
                    props: ["title": .string("Default")]),
            ]),
            sectionTitle("cmp.t", symbol: "textformat", "Typography"),
            bodyText(
                "cmp.body",
                "Text nodes carry size, weight, color and alignment from the Style IR and render as native NSTextField labels.",
                height: 40),
        ]),
    ])
}

private func formsTree() -> UINode {
    page("form", [
        pageHeader(
            "form.hdr", symbol: "square.and.pencil", title: "Forms",
            subtitle: "Native text fields with two-way binding over the bridge."),
        card("form.card", [
            sectionTitle("form.h", symbol: "person.crop.circle", "Your details"),
            labeledField(
                "form.name", label: "Full name", symbol: "person", placeholder: "Ada Lovelace"),
            labeledField(
                "form.email", label: "Email", symbol: "envelope", placeholder: "ada@example.com"),
            labeledField(
                "form.pass", label: "Passcode (optional)", symbol: "lock.fill",
                placeholder: "••••••"),
            primaryButton("form.submit", "Submit", symbol: "arrow.right.circle"),
        ]),
    ])
}

private func aboutTree() -> UINode {
    page("about", [
        pageHeader(
            "about.hdr", symbol: "info.circle", title: "About Uniview",
            subtitle: "Write a plugin UI once; render it as a real native app."),
        card("about.card", [
            sectionTitle("about.h", symbol: "cube.transparent", "One protocol, many platforms"),
            bodyText(
                "about.b",
                "Uniview compiles a Tailwind-inspired Style IR and drives a Fabric-style shadow tree, laid out by Yoga and mounted onto native AppKit views. The same protocol will target Windows (WinUI) and HarmonyOS.",
                height: 60, color: "label"),
        ]),
    ])
}
