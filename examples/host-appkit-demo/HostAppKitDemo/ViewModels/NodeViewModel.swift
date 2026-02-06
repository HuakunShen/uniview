import AppKit

/// Lightweight view model that sits between UINode (JSON data) and NSView (presentation).
/// Reference type so views can hold a reference and be updated in-place.
final class NodeViewModel {
    /// Stable ID from the React reconciler
    let id: String

    /// Element type (div, p, button, etc.)
    var type: String

    /// Current props dictionary
    var props: [String: JSONValue]

    /// Pre-computed text content (concatenated from all text children)
    var textContent: String

    /// Child view models (for node children only; text is folded into textContent)
    var children: [NodeViewModel]

    /// Tracks which properties changed since last reconcile
    var dirtyFields: DirtyFields = []

    struct DirtyFields: OptionSet {
        let rawValue: UInt8
        static let type     = DirtyFields(rawValue: 1 << 0)
        static let props    = DirtyFields(rawValue: 1 << 1)
        static let text     = DirtyFields(rawValue: 1 << 2)
        static let children = DirtyFields(rawValue: 1 << 3)
        static let all: DirtyFields = [.type, .props, .text, .children]
    }

    /// The NSView currently associated with this view model (weak to avoid retain cycles)
    weak var associatedView: NSView?

    init(from node: UINode) {
        self.id = node.id
        self.type = node.type
        self.props = node.props
        self.textContent = NodeViewModel.extractText(from: node.children)
        self.children = node.children.compactMap { child in
            switch child {
            case .node(let childNode):
                // br is folded into textContent as \n, not a child view
                if childNode.type == "br" { return nil }
                return NodeViewModel(from: childNode)
            case .text:
                return nil // Text is folded into textContent
            }
        }
    }

    /// Recursively extract all text content from children
    private static func extractText(from children: [UINodeChild]) -> String {
        var result = ""
        for child in children {
            switch child {
            case .text(let text):
                result += text
            case .node(let node):
                if node.type == "br" {
                    result += "\n"
                } else {
                    result += extractText(from: node.children)
                }
            }
        }
        return result
    }

    /// Compare with another view model and set dirty flags on self.
    /// Returns true if anything changed.
    @discardableResult
    func diff(against newModel: NodeViewModel) -> Bool {
        dirtyFields = []

        if type != newModel.type {
            dirtyFields.insert(.type)
        }
        if props != newModel.props {
            dirtyFields.insert(.props)
        }
        if textContent != newModel.textContent {
            dirtyFields.insert(.text)
        }
        if children.count != newModel.children.count {
            dirtyFields.insert(.children)
        } else {
            // Check if any child IDs changed (order matters)
            for (old, new) in zip(children, newModel.children) {
                if old.id != new.id {
                    dirtyFields.insert(.children)
                    break
                }
            }
        }

        return !dirtyFields.isEmpty
    }

    /// Extract a handler ID prop for a given event name.
    /// Convention: onClick -> _onClickHandlerId
    func handlerId(for eventName: String) -> String? {
        let propName = "_\(eventName)HandlerId"
        return props[propName]?.stringValue
    }
}
