import SwiftUI

// MARK: - UINodeView

/// SwiftUI view that recursively renders a UINode tree
/// Supports: div, p, span, h1-h6, ul, li, button, input
struct UINodeView: View {
    let node: UINode
    let onExecuteHandler: (String, [JSONValue]) -> Void
    
    var body: some View {
        renderNode(node)
    }
    
    // MARK: - Node Rendering
    
    @ViewBuilder
    private func renderNode(_ node: UINode) -> some View {
        switch node.type {
        case "div":
            renderDiv(node)
        case "p", "span":
            renderText(node)
        case "h1", "h2", "h3", "h4", "h5", "h6":
            renderHeading(node)
        case "ul":
            renderList(node)
        case "li":
            renderListItem(node)
        case "button", "Button":
            renderButton(node)
        case "input", "Input":
            renderInput(node)
        default:
            renderUnknown(node)
        }
    }
    
    // MARK: - Component Renderers
    
    @ViewBuilder
    private func renderDiv(_ node: UINode) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(0..<node.children.count, id: \.self) { index in
                renderChild(node.children[index])
            }
        }
        .padding(8)
    }
    
    @ViewBuilder
    private func renderText(_ node: UINode) -> some View {
        Text(extractTextContent(node))
            .frame(maxWidth: .infinity, alignment: .leading)
    }
    
    @ViewBuilder
    private func renderHeading(_ node: UINode) -> some View {
        let level = Int(node.type.dropFirst()) ?? 1
        let fontSize: Font = switch level {
        case 1: .largeTitle
        case 2: .title
        case 3: .title2
        case 4: .title3
        case 5: .headline
        case 6: .subheadline
        default: .body
        }
        
        Text(extractTextContent(node))
            .font(fontSize)
            .fontWeight(.bold)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
    
    @ViewBuilder
    private func renderList(_ node: UINode) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(0..<node.children.count, id: \.self) { index in
                renderChild(node.children[index])
            }
        }
        .padding(.leading, 16)
    }
    
    @ViewBuilder
    private func renderListItem(_ node: UINode) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text("•")
            Text(extractTextContent(node))
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
    
    @ViewBuilder
    private func renderButton(_ node: UINode) -> some View {
        let titleFromProp = node.props["title"]?.stringValue
        let titleFromChildren = extractTextContent(node)
        let title = titleFromProp ?? (titleFromChildren.isEmpty ? "Button" : titleFromChildren)
        let handlerId = node.handlerId(for: "onClick")
        
        Button(action: {
            if let handlerId = handlerId {
                onExecuteHandler(handlerId, [])
            }
        }) {
            Text(title)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
        }
        .buttonStyle(.borderedProminent)
    }
    
    @ViewBuilder
    private func renderInput(_ node: UINode) -> some View {
        let handlerId = node.handlerId(for: "onChange")
        let placeholder = node.props["placeholder"]?.stringValue ?? ""
        let label = node.props["label"]?.stringValue ?? ""
        let value = node.props["value"]?.stringValue ?? ""
        let defaultValue = node.props["defaultValue"]?.stringValue ?? ""
        let disabled = node.props["disabled"]?.boolValue ?? false
        let initialValue = value.isEmpty ? defaultValue : value
        
        InputField(
            value: value,
            initialValue: initialValue,
            placeholder: placeholder,
            label: label,
            disabled: disabled,
            handlerId: handlerId,
            onExecuteHandler: onExecuteHandler
        )
    }
    
    @ViewBuilder
    private func renderUnknown(_ node: UINode) -> some View {
        VStack(alignment: .leading) {
            Text("Unknown: \(node.type)")
                .foregroundColor(.red)
                .font(.caption)
            ForEach(0..<node.children.count, id: \.self) { index in
                renderChild(node.children[index])
            }
        }
    }
    
    // MARK: - Child Rendering
    
    @ViewBuilder
    private func renderChild(_ child: UINodeChild) -> some View {
        switch child {
        case .text(let text):
            Text(text)
                .frame(maxWidth: .infinity, alignment: .leading)
        case .node(let node):
            UINodeView(node: node, onExecuteHandler: onExecuteHandler)
        }
    }
    
    // MARK: - Text Content Extraction
    
    /// Extract text content from a node by concatenating all text children recursively
    private func extractTextContent(_ node: UINode) -> String {
        var result = ""
        for child in node.children {
            switch child {
            case .text(let text):
                result.append(text)
            case .node(let nested):
                result.append(extractTextContent(nested))
            }
        }
        return result
    }
}

// MARK: - Input Field Component

/// Separate view for input fields to handle local state
private struct InputField: View {
    let value: String
    let initialValue: String
    let placeholder: String
    let label: String
    let disabled: Bool
    let handlerId: String?
    let onExecuteHandler: (String, [JSONValue]) -> Void
    
    @State private var text: String
    
    init(
        value: String,
        initialValue: String,
        placeholder: String,
        label: String,
        disabled: Bool,
        handlerId: String?,
        onExecuteHandler: @escaping (String, [JSONValue]) -> Void
    ) {
        self.value = value
        self.initialValue = initialValue
        self.placeholder = placeholder
        self.label = label
        self.disabled = disabled
        self.handlerId = handlerId
        self.onExecuteHandler = onExecuteHandler
        _text = State(initialValue: initialValue)
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if !label.isEmpty {
                Text(label)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            TextField(placeholder, text: $text)
                .textFieldStyle(.roundedBorder)
                .disabled(disabled)
                .onChange(of: text) { newValue in
                    if let handlerId = handlerId {
                        onExecuteHandler(handlerId, [.string(newValue)])
                    }
                }
                .onChange(of: value) { newValue in
                    if newValue != text {
                        text = newValue
                    }
                }
        }
    }
}

// MARK: - Preview

#Preview {
    let sampleNode = UINode(
        id: "root",
        type: "div",
        props: [:],
        children: [
            .node(UINode(
                id: "h1",
                type: "h1",
                props: [:],
                children: [.text("Hello macOS")]
            )),
            .node(UINode(
                id: "p",
                type: "p",
                props: [:],
                children: [.text("This is a test paragraph.")]
            )),
            .node(UINode(
                id: "btn",
                type: "button",
                props: ["_onClickHandlerId": .string("btn-123")],
                children: [.text("Click Me")]
            ))
        ]
    )
    
    UINodeView(node: sampleNode) { handlerId, args in
        print("Handler: \(handlerId), args: \(args)")
    }
    .padding()
    .frame(width: 400, height: 300)
}
