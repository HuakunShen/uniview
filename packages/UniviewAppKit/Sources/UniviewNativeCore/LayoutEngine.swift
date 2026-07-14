import Foundation

/// A width/height pair (points). Kept dependency-free so Core stays portable.
public struct Size: Equatable, Sendable {
    public var width: Double
    public var height: Double

    public init(width: Double, height: Double) {
        self.width = width
        self.height = height
    }

    public static let zero = Size(width: 0, height: 0)
}

/// Computes layout for a shadow tree from the Style IR, writing each node's
/// `layout` rect (parent-relative coordinates). Isolated behind a protocol so
/// the Yoga-backed engine — or any other — is swappable, per the design.
public protocol LayoutEngine {
    /// Lay out `root` (and its descendants) within `available`, writing each
    /// node's `layout`.
    func calculate(root: ShadowNode, available: Size)
}
