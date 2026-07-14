import AppKit
import Testing

@testable import UniviewAppKit
@testable import UniviewNativeCore
@testable import UniviewYoga

/// Keyboard input on the declare-interest model: a node names the keys it wants,
/// the host matches them locally, and everything else reaches AppKit untouched.
/// Streaming every keystroke to the plugin instead would put a process boundary
/// (in bridge mode, a network) between the key and the letter — and would steal
/// ⌘C, the arrow keys inside a field, and IME composition on the way.
@MainActor
@Suite struct KeyboardTests {

    private func key(
        _ code: UInt16, characters: String = "", _ modifiers: NSEvent.ModifierFlags = []
    ) -> NSEvent {
        NSEvent.keyEvent(
            with: .keyDown, location: .zero, modifierFlags: modifiers, timestamp: 0,
            windowNumber: 0, context: nil, characters: characters,
            charactersIgnoringModifiers: characters, isARepeat: false, keyCode: code)!
    }

    private let escape: UInt16 = 53
    private let arrowDown: UInt16 = 125
    private let letterK: UInt16 = 40

    // MARK: - Chords

    /// One key, several spellings: React writes `ArrowDown`, a shortcut string
    /// says `down`. Both name the same key, and the plugin sees one name back.
    @Test func aKeyIsNamedTheSameWhicheverWayItIsSpelled() {
        #expect(KeyChord("ArrowDown")?.key == "ArrowDown")
        #expect(KeyChord("down")?.key == "ArrowDown")
        #expect(KeyChord("esc")?.key == "Escape")
        #expect(KeyChord("Escape")?.key == "Escape")
        #expect(KeyChord("k")?.key == "k")
    }

    @Test func aChordCarriesItsModifiers() throws {
        let chord = try #require(KeyChord("cmd+shift+k"))
        #expect(chord.key == "k")
        #expect(chord.modifiers == [.command, .shift])
        #expect(chord.isKeyEquivalent)
        #expect(KeyChord("Escape")?.isKeyEquivalent == false)
    }

    /// A chord means exactly what it says. `Escape` is not ⌘Escape — matching a
    /// subset would fire handlers on chords the plugin never asked for.
    @Test func modifiersMustMatchExactly() throws {
        let plain = try #require(KeyChord("Escape"))
        #expect(plain.matches(key(escape)))
        #expect(!plain.matches(key(escape, characters: "", .command)))

        let chord = try #require(KeyChord("cmd+k"))
        #expect(chord.matches(key(letterK, characters: "k", .command)))
        #expect(!chord.matches(key(letterK, characters: "k")))
        #expect(!chord.matches(key(letterK, characters: "k", [.command, .shift])))
    }

    /// Escape and Delete produce control characters, and there is more than one
    /// spelling of each in circulation. The key code is the key.
    @Test func specialKeysAreReadFromTheKeyCodeNotTheCharacter() {
        #expect(KeyChord.key(for: key(escape, characters: "\u{1b}")) == "Escape")
        #expect(KeyChord.key(for: key(arrowDown, characters: "\u{f701}")) == "ArrowDown")
        // Shift is the one modifier `charactersIgnoringModifiers` keeps, so a
        // shifted letter arrives uppercase. The chord names the key, not the glyph.
        #expect(KeyChord.key(for: key(letterK, characters: "K", .shift)) == "k")
    }

    // MARK: - Views

    private func host(
        _ props: [String: JSONValue], onKey: @escaping @MainActor (String, [JSONValue]) -> Void = {
            _, _ in
        }
    ) -> UniviewHost {
        let host = UniviewHost(
            registry: .standard(), layoutEngine: YogaLayoutEngine(),
            containerSize: Size(width: 200, height: 200), executeHandler: onKey)
        host.apply(
            CommitBatch(
                revision: 0,
                mutations: [.setRoot(node: UINode(id: "box", type: "View", props: props))]))
        return host
    }

    /// Focus is not decoration: without first responder the responder chain never
    /// reaches the view, and the declaration would be silently inert. A view that
    /// asked for nothing stays unfocusable, as it was.
    @Test func onlyAViewThatWantsKeysCanTakeFocus() throws {
        let none = host([:])
        #expect(try #require(none.view(for: "box")).acceptsFirstResponder == false)

        let listening = host([
            "keyDownEvents": .array([.string("Escape")]),
            "_onKeyDownHandlerId": .string("h1"),
        ])
        #expect(try #require(listening.view(for: "box")).acceptsFirstResponder)
    }

    /// A declaration without a handler is not interest — and must not make the
    /// view start eating keys that nobody is listening for.
    @Test func aDeclarationWithNoHandlerTakesNothing() throws {
        let host = self.host(["keyDownEvents": .array([.string("Escape")])])
        #expect(try #require(host.view(for: "box")).acceptsFirstResponder == false)
    }

    @Test func aDeclaredKeyReachesThePluginWithItsModifiers() throws {
        var fired: [(String, [JSONValue])] = []
        let host = self.host(
            [
                "keyDownEvents": .array([.string("ArrowDown"), .string("Escape")]),
                "_onKeyDownHandlerId": .string("h1"),
            ], onKey: { fired.append(($0, $1)) })

        let view = try #require(host.view(for: "box") as? FlippedView)
        view.keyDown(with: key(arrowDown, characters: "\u{f701}"))

        #expect(fired.count == 1)
        let (handlerId, args) = try #require(fired.first)
        #expect(handlerId == "h1")
        let payload = try #require(args.first?.objectValue)
        // A DOM `KeyboardEvent`, field for field — the same tree renders on a web
        // host, where `onKeyDown` is handed the real thing.
        #expect(payload["key"]?.stringValue == "ArrowDown")
        #expect(payload["metaKey"]?.boolValue == false)
        #expect(payload["shiftKey"]?.boolValue == false)
        #expect(payload["repeat"]?.boolValue == false)
    }

    /// The whole point of declaring: an undeclared key is never sent to the plugin
    /// AND is never taken from AppKit. `super.keyDown` passes it on — a view that
    /// swallowed it would break every key the plugin didn't ask for.
    @Test func anUndeclaredKeyIsNeverSentAndNeverStolen() throws {
        var fired = 0
        let host = self.host(
            [
                "keyDownEvents": .array([.string("Escape")]),
                "_onKeyDownHandlerId": .string("h1"),
            ], onKey: { _, _ in fired += 1 })

        let view = try #require(host.view(for: "box") as? FlippedView)
        #expect(view.claim(key(arrowDown, characters: "\u{f701}")) == false)
        #expect(view.claim(key(escape)) == true)
        #expect(fired == 1)
    }

    /// A modified chord is a key equivalent: it fires wherever focus happens to be
    /// (including inside a text field), which is what ⌘K in a palette means. An
    /// *unmodified* key must never be claimed that way — a `"k"` claimed
    /// window-wide would eat every `k` typed into every field in the window.
    @Test func onlyModifiedChordsActWindowWide() throws {
        let host = self.host([
            "keyDownEvents": .array([.string("cmd+k"), .string("Escape")]),
            "_onKeyDownHandlerId": .string("h1"),
        ])
        let view = try #require(host.view(for: "box") as? FlippedView)

        #expect(view.performKeyEquivalent(with: key(letterK, characters: "k", .command)))
        #expect(view.performKeyEquivalent(with: key(escape)) == false)
        // …but Escape still arrives the ordinary way, at whoever has focus.
        #expect(view.claim(key(escape)))
    }

    // MARK: - Text fields

    /// The case that makes a launcher possible. A focused field never sees a raw
    /// `keyDown`: the field editor has already turned the press into an editing
    /// command. A field that declared `ArrowDown` moves the *selection*; one that
    /// declared nothing moves the caret, like every other field on the machine.
    @Test func aFocusedFieldForwardsOnlyTheKeysItDeclared() throws {
        var fired: [JSONValue] = []
        let host = UniviewHost(
            registry: .standard(), layoutEngine: YogaLayoutEngine(),
            containerSize: Size(width: 200, height: 200),
            executeHandler: { _, args in fired.append(contentsOf: args) })
        host.apply(
            CommitBatch(
                revision: 0,
                mutations: [
                    .setRoot(
                        node: UINode(
                            id: "field", type: "TextInput",
                            props: [
                                "keyDownEvents": .array([.string("ArrowDown")]),
                                "_onKeyDownHandlerId": .string("h1"),
                            ]))
                ]))

        let field = try #require(host.view(for: "field") as? StyledFieldView).field
        let editor = NSTextView()

        // Declared: consumed, and the plugin hears about it.
        #expect(
            field.control(field, textView: editor, doCommandBy: #selector(NSResponder.moveDown(_:)))
        )
        #expect(fired.first?.objectValue?["key"]?.stringValue == "ArrowDown")

        // Undeclared: NOT consumed — the caret still moves, the text still deletes.
        #expect(
            field.control(field, textView: editor, doCommandBy: #selector(NSResponder.moveUp(_:)))
                == false)
        #expect(
            field.control(
                field, textView: editor, doCommandBy: #selector(NSResponder.deleteBackward(_:)))
                == false)
        #expect(fired.count == 1)
    }

    /// Focus is a window-wide resource: a view that takes it takes it from whoever
    /// had it. So a view listens for keys and does *not* grab focus — only
    /// `autoFocus` grabs it, and only once.
    ///
    /// This is not hypothetical. A palette whose root declared `cmd+k` took first
    /// responder on the commit after mount, and every commit after that: the caret
    /// left the search field on the first keystroke. ⌘K kept working (a key
    /// equivalent needs no focus) while the arrow keys went dead — which reads as
    /// "arrow keys are broken" and is really "the field is no longer focused".
    @Test func listeningForKeysDoesNotStealFocusFromTheField() throws {
        let host = UniviewHost(
            registry: .standard(), layoutEngine: YogaLayoutEngine(),
            containerSize: Size(width: 300, height: 300), executeHandler: { _, _ in })

        func tree(rows: Int) -> UINode {
            UINode(
                id: "root", type: "View",
                props: [
                    "_style": .object(["flexDirection": .string("column")]),
                    "keyDownEvents": .array([.string("cmd+k")]),
                    "_onKeyDownHandlerId": .string("h1"),
                ],
                children: [
                    UINode(id: "field", type: "TextInput", props: ["placeholder": .string("…")])
                ]
                    + (0..<rows).map {
                        UINode(
                            id: "row\($0)", type: "View",
                            props: ["_style": .object(["height": .number(20)])])
                    })
        }

        host.apply(CommitBatch(revision: 0, mutations: [.setRoot(node: tree(rows: 5))]))

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 300, height: 300),
            styleMask: [.titled], backing: .buffered, defer: false)
        window.contentView?.addSubview(try #require(host.rootView))
        let root = try #require(host.view(for: "root") as? FlippedView)
        let field = try #require(host.view(for: "field") as? StyledFieldView).field
        #expect(window.makeFirstResponder(field))
        #expect(field.currentEditor() != nil, "the field is being edited")

        // Typing filters the list — i.e. a commit, on every keystroke.
        host.apply(CommitBatch(revision: 1, mutations: [.setRoot(node: tree(rows: 2))]))

        #expect(field.currentEditor() != nil, "the caret is still in the field")
        #expect(window.firstResponder !== root, "the root listens for keys; it does not take focus")
    }
    /// Does a REAL Escape, pushed through the real field editor, arrive as
    /// `cancelOperation:` at the delegate? (Automation can't deliver Escape to a
    /// live app, so the Cocoa text system is exercised directly here.)
    @Test func aRealEscapeReachesTheFieldAsCancelOperation() throws {
        var fired: [JSONValue] = []
        let host = UniviewHost(
            registry: .standard(), layoutEngine: YogaLayoutEngine(),
            containerSize: Size(width: 200, height: 200),
            executeHandler: { _, args in fired.append(contentsOf: args) })
        host.apply(
            CommitBatch(
                revision: 0,
                mutations: [
                    .setRoot(
                        node: UINode(
                            id: "field", type: "TextInput",
                            props: [
                                "keyDownEvents": .array([.string("Escape")]),
                                "_onKeyDownHandlerId": .string("h1"),
                            ]))
                ]))
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 200, height: 200),
            styleMask: [.titled], backing: .buffered, defer: false)
        window.contentView?.addSubview(try #require(host.rootView))
        let field = try #require(host.view(for: "field") as? StyledFieldView).field
        #expect(window.makeFirstResponder(field))
        let editor = try #require(field.currentEditor() as? NSTextView)

        editor.interpretKeyEvents([key(53, characters: "\u{1b}")])

        #expect(fired.first?.objectValue?["key"]?.stringValue == "Escape")
    }
}
