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

/// Supplies what the Style IR can't: the *intrinsic* size of a leaf — a run of
/// text, a control's title, an icon glyph. Flexbox can only ask for it through a
/// callback, because measuring it means knowing about fonts.
///
/// Without a measurer every leaf is 0×0, so any box that sizes itself to its
/// content collapses. A tree that gives every node an explicit width/height
/// (hand-authored native fixtures) never needs one; a tree written in Tailwind,
/// where size comes from the content, is unreadable without one.
@MainActor
public protocol NodeMeasurer: AnyObject {
    /// True when the node is native but not a view — a menu bar, a window's
    /// chrome. It has no box: it must not appear in the layout at all, or a
    /// `<Menu>` written inside a `<div>` would reserve an empty row in it.
    func isExcludedFromLayout(_ node: ShadowNode) -> Bool

    /// True when the node draws its own content and its element children are not
    /// laid out as independent boxes — a `Text` with inline `span`s, a `Button`.
    /// Such a node is a layout leaf even though the tree gives it children.
    func isContentLeaf(_ node: ShadowNode) -> Bool

    /// The node's intrinsic size, or nil if it has none. `maxWidth` is
    /// `.infinity` when the engine imposes no width constraint (measure unwrapped).
    func measure(_ node: ShadowNode, maxWidth: Double) -> Size?
}

/// Computes layout for a shadow tree from the Style IR, writing each node's
/// `layout` rect (parent-relative coordinates). Isolated behind a protocol so
/// the Yoga-backed engine — or any other — is swappable, per the design.
/// Layout is main-actor work: measuring a leaf means asking its component, and
/// components are AppKit views. (It also means Yoga's process-global state is
/// only ever touched from one thread.)
@MainActor
public protocol LayoutEngine: AnyObject {
    /// Optional: set by the host so leaves can size to their content.
    var measurer: NodeMeasurer? { get set }

    /// Lay out `root` (and its descendants) within `available`, writing each
    /// node's `layout`.
    func calculate(root: ShadowNode, available: Size)
}
