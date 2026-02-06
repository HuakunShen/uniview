import AppKit

/// Reconciles old view model tree against new one, applying minimal NSView mutations.
/// Uses UINode stable IDs for O(1) matching and only updates views whose props changed.
final class TreeReconciler {

    typealias HandlerExecutor = (String, [JSONValue]) -> Void

    /// Reconcile the root: given old and new view models plus the container view,
    /// update the NSView hierarchy in-place.
    func reconcile(
        oldModel: NodeViewModel,
        newModel: NodeViewModel,
        parentView: NSView,
        handlerExecutor: @escaping HandlerExecutor
    ) {
        // If the type changed, we must replace the entire subtree
        if oldModel.type != newModel.type {
            let newView = NodeViewFactory.createView(for: newModel, handlerExecutor: handlerExecutor)
            replaceRootView(in: parentView, oldView: oldModel.associatedView, newView: newView)
            newModel.associatedView = newView
            return
        }

        guard let existingView = oldModel.associatedView else {
            // No existing view - create fresh
            let newView = NodeViewFactory.createView(for: newModel, handlerExecutor: handlerExecutor)
            addRootView(in: parentView, view: newView)
            newModel.associatedView = newView
            return
        }

        // Same type: diff props and update in-place
        oldModel.diff(against: newModel)
        if !oldModel.dirtyFields.isEmpty {
            NodeViewFactory.updateView(
                existingView,
                from: oldModel,
                to: newModel,
                handlerExecutor: handlerExecutor
            )
        }

        // Transfer the associated view reference
        newModel.associatedView = existingView

        // Reconcile children
        if let containerView = existingView as? NSStackView {
            reconcileChildren(
                oldChildren: oldModel.children,
                newChildren: newModel.children,
                containerView: containerView,
                handlerExecutor: handlerExecutor
            )
        }
    }

    /// Reconcile a list of children against an NSStackView container.
    private func reconcileChildren(
        oldChildren: [NodeViewModel],
        newChildren: [NodeViewModel],
        containerView: NSStackView,
        handlerExecutor: @escaping HandlerExecutor
    ) {
        // Build lookup: old id -> (index, viewModel)
        var oldMap: [String: NodeViewModel] = [:]
        for child in oldChildren {
            oldMap[child.id] = child
        }

        var usedOldIds: Set<String> = []

        // Phase 1: Match, update, or insert
        for newChild in newChildren {
            if let oldChild = oldMap[newChild.id] {
                usedOldIds.insert(newChild.id)

                if oldChild.type != newChild.type {
                    // Type changed: replace view
                    let newView = NodeViewFactory.createView(for: newChild, handlerExecutor: handlerExecutor)
                    if let oldView = oldChild.associatedView {
                        replaceArrangedSubview(in: containerView, oldView: oldView, newView: newView)
                    } else {
                        containerView.addArrangedSubview(newView)
                    }
                    newChild.associatedView = newView
                } else {
                    // Same type: diff and update in-place
                    oldChild.diff(against: newChild)
                    if let existingView = oldChild.associatedView, !oldChild.dirtyFields.isEmpty {
                        NodeViewFactory.updateView(
                            existingView,
                            from: oldChild,
                            to: newChild,
                            handlerExecutor: handlerExecutor
                        )
                    }
                    newChild.associatedView = oldChild.associatedView

                    // Recurse into children
                    if let childContainer = oldChild.associatedView as? NSStackView {
                        reconcileChildren(
                            oldChildren: oldChild.children,
                            newChildren: newChild.children,
                            containerView: childContainer,
                            handlerExecutor: handlerExecutor
                        )
                    }
                }
            } else {
                // New node: create and add (will be reordered in phase 3)
                let newView = NodeViewFactory.createView(for: newChild, handlerExecutor: handlerExecutor)
                containerView.addArrangedSubview(newView)
                newChild.associatedView = newView
            }
        }

        // Phase 2: Remove old children not present in new list
        for oldChild in oldChildren where !usedOldIds.contains(oldChild.id) {
            if let view = oldChild.associatedView {
                containerView.removeArrangedSubview(view)
                view.removeFromSuperview()
            }
        }

        // Phase 3: Reorder to match new children order
        reorderArrangedSubviews(containerView, newChildren: newChildren)
    }

    /// Reorder arranged subviews to match the desired order.
    private func reorderArrangedSubviews(_ stackView: NSStackView, newChildren: [NodeViewModel]) {
        let desiredOrder: [NSView] = newChildren.compactMap { $0.associatedView }
        let currentViews = stackView.arrangedSubviews

        // Check if reorder is needed
        guard desiredOrder.count == currentViews.count else { return }

        var needsReorder = false
        for (i, view) in desiredOrder.enumerated() {
            if i >= currentViews.count || currentViews[i] !== view {
                needsReorder = true
                break
            }
        }
        guard needsReorder else { return }

        // Remove all arranged subviews and re-add in correct order
        for view in currentViews {
            stackView.removeArrangedSubview(view)
        }
        for view in desiredOrder {
            stackView.addArrangedSubview(view)
        }
    }

    // MARK: - Root view helpers

    private func replaceRootView(in parent: NSView, oldView: NSView?, newView: NSView) {
        oldView?.removeFromSuperview()
        addRootView(in: parent, view: newView)
    }

    private func addRootView(in parent: NSView, view: NSView) {
        parent.subviews.forEach { $0.removeFromSuperview() }
        parent.addSubview(view)
        view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            view.topAnchor.constraint(equalTo: parent.topAnchor),
            view.leadingAnchor.constraint(equalTo: parent.leadingAnchor),
            view.trailingAnchor.constraint(equalTo: parent.trailingAnchor),
            view.bottomAnchor.constraint(equalTo: parent.bottomAnchor),
        ])
    }

    private func replaceArrangedSubview(in stackView: NSStackView, oldView: NSView, newView: NSView) {
        if let index = stackView.arrangedSubviews.firstIndex(of: oldView) {
            stackView.removeArrangedSubview(oldView)
            oldView.removeFromSuperview()
            stackView.insertArrangedSubview(newView, at: index)
        } else {
            stackView.addArrangedSubview(newView)
        }
    }
}
