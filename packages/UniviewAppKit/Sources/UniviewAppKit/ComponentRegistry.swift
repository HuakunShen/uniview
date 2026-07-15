import AppKit
import UniviewNativeCore

/// Maps node `type` strings to the `Component` that renders them. Replaces the
/// POC's hardcoded `switch`; product-specific primitives register here rather
/// than editing a central factory.
@MainActor
public final class ComponentRegistry {
    private var components: [String: Component] = [:]
    private var surfaces: [String: NativeSurface] = [:]
    private let fallback: Component

    public init(fallback: Component = UnknownComponent()) {
        self.fallback = fallback
    }

    /// Register a node type that is native but *not a view* — a menu bar, a
    /// window, a notification. The mounter hands the whole subtree to the
    /// surface instead of building views, and the layout engine skips it.
    public func registerSurface(_ type: String, _ surface: NativeSurface) {
        surfaces[type] = surface
    }

    public func surface(for type: String) -> NativeSurface? {
        surfaces[type]
    }

    /// True when this node type renders somewhere other than the view tree.
    public func isSurface(_ type: String) -> Bool {
        surfaces[type] != nil
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
        registry.register(
            [
                "Text", "p", "span", "label", "strong", "em",
                "h1", "h2", "h3", "h4", "h5", "h6",
            ], TextComponent())
        registry.register(["Icon", "Image", "img", "symbol"], IconComponent())
        registry.register(["Button", "button"], ButtonComponent())
        // "Input" (capitalised) is what `@uniview/example-plugin-api` emits.
        registry.register(["TextInput", "Input", "input"], TextInputComponent())
        return registry
    }
}
