import AppKit
import UniviewNativeCore

/// Maps node `type` strings to the `Component` that renders them. Replaces the
/// POC's hardcoded `switch`; product-specific primitives register here rather
/// than editing a central factory.
@MainActor
public final class ComponentRegistry {
    private var components: [String: Component] = [:]
    private let fallback: Component

    public init(fallback: Component = UnknownComponent()) {
        self.fallback = fallback
    }

    public func register(_ type: String, _ component: Component) {
        components[type] = component
    }

    public func register(_ types: [String], _ component: Component) {
        for type in types { components[type] = component }
    }

    /// The component for a type, or the fallback (visible placeholder) when
    /// unregistered — nodes are never silently dropped.
    public func component(for type: String) -> Component {
        components[type] ?? fallback
    }

    public func isRegistered(_ type: String) -> Bool {
        components[type] != nil
    }

    /// A registry preloaded with the built-in portable primitives.
    public static func standard() -> ComponentRegistry {
        let registry = ComponentRegistry()
        registry.register(["View", "div", "section", "main", "nav", "header", "footer"], ViewComponent())
        registry.register(["Text", "p", "span", "label", "strong", "em"], TextComponent())
        registry.register(["Icon", "Image", "img", "symbol"], IconComponent())
        registry.register(["Button", "button"], ButtonComponent())
        registry.register(["TextInput", "input"], TextInputComponent())
        return registry
    }
}
