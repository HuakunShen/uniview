import Foundation
import UniviewNativeCore
import yoga

/// A Yoga-backed `LayoutEngine`: builds a Yoga node tree from the shadow tree's
/// Style IR, runs flexbox layout, and writes the computed (parent-relative)
/// frames back into each `ShadowNode.layout`. All Yoga C calls are confined to
/// this file so the rest of the framework stays engine-agnostic.
/// Yoga's measure callback is a bare C function pointer — no captures — so the
/// node and its measurer travel through the Yoga node's `void *` context.
///
/// Layout is driven from the main actor (`UniviewHost`), and Yoga calls this
/// synchronously inside `YGNodeCalculateLayout`, so we are still on it here.
private let ygMeasure: YGMeasureFunc = { ygNode, width, widthMode, _, _ in
    guard let context = YGNodeGetContext(ygNode) else { return YGSize(width: 0, height: 0) }
    let box = Unmanaged<YogaLayoutEngine.MeasureBox>.fromOpaque(context).takeUnretainedValue()

    let maxWidth: Double =
        (widthMode == .undefined || width.isNaN) ? .infinity : Double(width)
    let size = MainActor.assumeIsolated { box.measurer.measure(box.node, maxWidth: maxWidth) }

    guard let size else { return YGSize(width: 0, height: 0) }
    return YGSize(width: Float(size.width), height: Float(size.height))
}

@MainActor
public final class YogaLayoutEngine: LayoutEngine {
    /// Yoga's node allocation and default-config state are process-global and not
    /// thread-safe. Real hosts drive layout from the main actor, but tests (and
    /// any future background layout) can invoke engines concurrently, which
    /// corrupts Yoga's heap. Serialize every Yoga interaction through one lock.
    private static let lock = NSLock()

    public var measurer: NodeMeasurer?

    /// Keeps each measured node reachable from Yoga's `void *` context for the
    /// duration of one `calculate` — Yoga's C callback can't capture anything.
    ///
    /// `@unchecked Sendable` because it crosses a C function pointer, which the
    /// compiler can't see through. It is safe: boxes are created, read, and
    /// dropped inside a single `calculate`, which is main-actor-only, and Yoga
    /// invokes the callback synchronously within it.
    fileprivate final class MeasureBox: @unchecked Sendable {
        let node: ShadowNode
        let measurer: NodeMeasurer

        init(node: ShadowNode, measurer: NodeMeasurer) {
            self.node = node
            self.measurer = measurer
        }
    }

    private var boxes: [MeasureBox] = []

    public init() {}

    public func calculate(root: ShadowNode, available: Size) {
        Self.lock.lock()
        defer {
            boxes.removeAll()
            Self.lock.unlock()
        }
        let ygRoot = build(root)
        YGNodeCalculateLayout(ygRoot, Float(available.width), Float(available.height), .LTR)
        readBack(root, from: ygRoot)
        YGNodeFreeRecursive(ygRoot)
    }

    // MARK: - Build

    private func build(_ node: ShadowNode) -> YGNodeRef {
        let yg = YGNodeNew()!  // never null in practice
        apply(node.style, to: yg)

        // A component that draws its own content (Text, Button) owns its element
        // children too — they're inline, not boxes. Laying them out separately
        // would reserve space for views the mounter never creates.
        let contentLeaf = measurer?.isContentLeaf(node) ?? false
        if !contentLeaf {
            var index = 0
            for child in node.children where !child.isTextNode {
                YGNodeInsertChild(yg, build(child), Int(index))
                index += 1
            }
            if index > 0 { return yg }
        }

        // A leaf: its size comes from its content, which only a measure function
        // can supply. Yoga rejects measure functions on nodes that have children.
        if let measurer {
            let box = MeasureBox(node: node, measurer: measurer)
            boxes.append(box)
            YGNodeSetContext(yg, Unmanaged.passUnretained(box).toOpaque())
            YGNodeSetMeasureFunc(yg, ygMeasure)
        }
        return yg
    }

    private func readBack(_ node: ShadowNode, from yg: YGNodeRef) {
        node.layout = LayoutRect(
            x: Double(YGNodeLayoutGetLeft(yg)),
            y: Double(YGNodeLayoutGetTop(yg)),
            width: Double(YGNodeLayoutGetWidth(yg)),
            height: Double(YGNodeLayoutGetHeight(yg))
        )
        var index = 0
        for child in node.children where !child.isTextNode {
            if let childYG = YGNodeGetChild(yg, Int(index)) {
                readBack(child, from: childYG)
            }
            index += 1
        }
    }

    // MARK: - Style IR → Yoga

    private func apply(_ style: StyleIR, to yg: YGNodeRef) {
        if let value = style.flexDirection { YGNodeStyleSetFlexDirection(yg, ygFlexDirection(value)) }
        if let value = style.justifyContent { YGNodeStyleSetJustifyContent(yg, ygJustify(value)) }
        if let value = style.alignItems { YGNodeStyleSetAlignItems(yg, ygAlign(value)) }
        if let value = style.alignSelf { YGNodeStyleSetAlignSelf(yg, ygAlignSelf(value)) }
        if let value = style.flexWrap { YGNodeStyleSetFlexWrap(yg, ygWrap(value)) }
        if let value = style.flexGrow { YGNodeStyleSetFlexGrow(yg, Float(value)) }
        if let value = style.flexShrink { YGNodeStyleSetFlexShrink(yg, Float(value)) }
        applyDimension(
            style.flexBasis,
            points: { YGNodeStyleSetFlexBasis(yg, $0) },
            percent: { YGNodeStyleSetFlexBasisPercent(yg, $0) },
            auto: { YGNodeStyleSetFlexBasisAuto(yg) })
        if let value = style.gap { YGNodeStyleSetGap(yg, .all, Float(value)) }

        applyEdge(style.paddingTop, .top) { YGNodeStyleSetPadding(yg, $0, $1) }
        applyEdge(style.paddingRight, .right) { YGNodeStyleSetPadding(yg, $0, $1) }
        applyEdge(style.paddingBottom, .bottom) { YGNodeStyleSetPadding(yg, $0, $1) }
        applyEdge(style.paddingLeft, .left) { YGNodeStyleSetPadding(yg, $0, $1) }
        applyMargin(style.marginTop, .top, yg)
        applyMargin(style.marginRight, .right, yg)
        applyMargin(style.marginBottom, .bottom, yg)
        applyMargin(style.marginLeft, .left, yg)

        applyDimension(
            style.width,
            points: { YGNodeStyleSetWidth(yg, $0) },
            percent: { YGNodeStyleSetWidthPercent(yg, $0) },
            auto: { YGNodeStyleSetWidthAuto(yg) })
        applyDimension(
            style.height,
            points: { YGNodeStyleSetHeight(yg, $0) },
            percent: { YGNodeStyleSetHeightPercent(yg, $0) },
            auto: { YGNodeStyleSetHeightAuto(yg) })
        applyDimension(
            style.minWidth,
            points: { YGNodeStyleSetMinWidth(yg, $0) },
            percent: { YGNodeStyleSetMinWidthPercent(yg, $0) },
            auto: nil)
        applyDimension(
            style.minHeight,
            points: { YGNodeStyleSetMinHeight(yg, $0) },
            percent: { YGNodeStyleSetMinHeightPercent(yg, $0) },
            auto: nil)
        applyDimension(
            style.maxWidth,
            points: { YGNodeStyleSetMaxWidth(yg, $0) },
            percent: { YGNodeStyleSetMaxWidthPercent(yg, $0) },
            auto: nil)
        applyDimension(
            style.maxHeight,
            points: { YGNodeStyleSetMaxHeight(yg, $0) },
            percent: { YGNodeStyleSetMaxHeightPercent(yg, $0) },
            auto: nil)

        if let value = style.position {
            YGNodeStyleSetPositionType(yg, value == .absolute ? .absolute : .relative)
        }
        applyEdge(style.top, .top) { YGNodeStyleSetPosition(yg, $0, $1) }
        applyEdge(style.right, .right) { YGNodeStyleSetPosition(yg, $0, $1) }
        applyEdge(style.bottom, .bottom) { YGNodeStyleSetPosition(yg, $0, $1) }
        applyEdge(style.left, .left) { YGNodeStyleSetPosition(yg, $0, $1) }
    }

    private func applyEdge(_ value: Double?, _ edge: YGEdge, _ set: (YGEdge, Float) -> Void) {
        if let value { set(edge, Float(value)) }
    }

    /// An `auto` margin absorbs the free space on that edge — two of them center
    /// the box, which is what `mx-auto` means.
    private func applyMargin(_ value: StyleDimension?, _ edge: YGEdge, _ yg: YGNodeRef) {
        switch value {
        case .points(let points): YGNodeStyleSetMargin(yg, edge, Float(points))
        case .percent(let percent): YGNodeStyleSetMarginPercent(yg, edge, Float(percent))
        case .auto: YGNodeStyleSetMarginAuto(yg, edge)
        case .none: break
        }
    }

    private func applyDimension(
        _ dimension: StyleDimension?,
        points: (Float) -> Void,
        percent: (Float) -> Void,
        auto: (() -> Void)?
    ) {
        switch dimension {
        case .points(let value): points(Float(value))
        case .percent(let value): percent(Float(value))
        case .auto: auto?()
        case .none: break
        }
    }

    // MARK: - Enum mapping

    private func ygFlexDirection(_ value: FlexDirection) -> YGFlexDirection {
        switch value {
        case .row: return .row
        case .column: return .column
        case .rowReverse: return .rowReverse
        case .columnReverse: return .columnReverse
        }
    }

    private func ygJustify(_ value: JustifyContent) -> YGJustify {
        switch value {
        case .flexStart: return .flexStart
        case .center: return .center
        case .flexEnd: return .flexEnd
        case .spaceBetween: return .spaceBetween
        case .spaceAround: return .spaceAround
        case .spaceEvenly: return .spaceEvenly
        }
    }

    private func ygAlign(_ value: AlignItems) -> YGAlign {
        switch value {
        case .flexStart: return .flexStart
        case .center: return .center
        case .flexEnd: return .flexEnd
        case .stretch: return .stretch
        case .baseline: return .baseline
        }
    }

    private func ygAlignSelf(_ value: AlignSelf) -> YGAlign {
        switch value {
        case .auto: return .auto
        case .flexStart: return .flexStart
        case .center: return .center
        case .flexEnd: return .flexEnd
        case .stretch: return .stretch
        case .baseline: return .baseline
        }
    }

    private func ygWrap(_ value: FlexWrap) -> YGWrap {
        switch value {
        case .nowrap: return .noWrap
        case .wrap: return .wrap
        case .wrapReverse: return .wrapReverse
        }
    }
}
