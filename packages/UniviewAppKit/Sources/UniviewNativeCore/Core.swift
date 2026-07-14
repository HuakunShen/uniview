/// UniviewNativeCore — the portable engine layer.
///
/// Contains the protocol models, shadow tree, reconciler interfaces, Style IR,
/// and transport abstractions shared by every native host. No AppKit / UIKit /
/// platform UI imports belong here.
/// Named `UniviewCore`, not `UniviewNativeCore`: a type with the same name as its
/// module shadows the module, so `UniviewNativeCore.JSONValue` would resolve to
/// this enum instead of the module — leaving no way to disambiguate `JSONValue`
/// when a dependency (kkrpc) also defines one.
public enum UniviewCore {
    public static let version = "0.0.1"
}
