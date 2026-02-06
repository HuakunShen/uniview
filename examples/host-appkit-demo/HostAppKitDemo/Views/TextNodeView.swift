import AppKit

/// NSTextField (label mode) for rendering text content.
/// Supports: p, span, h1-h6, strong, em, code, pre.
class TextNodeView: NSTextField, UpdatableNodeView {

    convenience init(model: NodeViewModel) {
        self.init(labelWithString: model.textContent)
        self.isEditable = false
        self.isSelectable = true
        self.isBordered = false
        self.drawsBackground = false
        self.lineBreakMode = .byWordWrapping
        self.maximumNumberOfLines = 0
        self.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        self.translatesAutoresizingMaskIntoConstraints = false

        applyTypography(for: model.type, props: model.props)
    }

    func update(
        from oldModel: NodeViewModel,
        to newModel: NodeViewModel,
        handlerExecutor: @escaping NodeViewFactory.HandlerExecutor
    ) {
        if oldModel.dirtyFields.contains(.text) {
            self.stringValue = newModel.textContent
        }
        if oldModel.dirtyFields.contains(.type) || oldModel.dirtyFields.contains(.props) {
            applyTypography(for: newModel.type, props: newModel.props)
        }
    }

    private func applyTypography(for type: String, props: [String: JSONValue]) {
        switch type {
        case "h1":
            self.font = NSFont.systemFont(ofSize: 28, weight: .bold)
        case "h2":
            self.font = NSFont.systemFont(ofSize: 22, weight: .bold)
        case "h3":
            self.font = NSFont.systemFont(ofSize: 18, weight: .semibold)
        case "h4":
            self.font = NSFont.systemFont(ofSize: 16, weight: .semibold)
        case "h5":
            self.font = NSFont.systemFont(ofSize: 14, weight: .medium)
        case "h6":
            self.font = NSFont.systemFont(ofSize: 12, weight: .medium)
        case "strong":
            self.font = NSFont.boldSystemFont(ofSize: NSFont.systemFontSize)
        case "em":
            let base = NSFont.systemFont(ofSize: NSFont.systemFontSize)
            if let italic = NSFontManager.shared.convert(base, toHaveTrait: .italicFontMask) as NSFont? {
                self.font = italic
            } else {
                self.font = base
            }
        case "code", "pre":
            self.font = NSFont.monospacedSystemFont(ofSize: NSFont.systemFontSize, weight: .regular)
        default:
            self.font = NSFont.systemFont(ofSize: NSFont.systemFontSize)
        }
    }
}
