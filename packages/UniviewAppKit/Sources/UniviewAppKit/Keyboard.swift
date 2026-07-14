import AppKit
import UniviewNativeCore

/// Keyboard input, on the **declare-interest** model.
///
/// A node says which keys it wants and only those cross the wire:
///
/// ```tsx
/// <div keyDownEvents={["Escape", "ArrowDown", "ArrowUp", "cmd+k"]}
///      onKeyDown={(e) => …} />
/// ```
///
/// The alternative — stream every `keyDown` to the plugin and let it decide — is
/// the one thing this framework cannot do. A keystroke would cross a process
/// boundary (and, in bridge mode, a *network*) before the letter appears; and
/// every key the plugin ignored would have been stolen from the responder chain
/// on the way, so ⌘C, the arrow keys inside a text field, and IME composition
/// would all quietly stop working. Interest is declared, the host matches
/// locally, and anything undeclared is never seen by the plugin and never taken
/// from AppKit.
///
/// It needs no new protocol: `keyDownEvents` is an ordinary JSON prop and
/// `onKeyDown` an ordinary handler prop, so both already cross the bridge.

// MARK: - Chords

/// One declared key: a normalized key name plus the modifiers that must be held
/// — `"Escape"`, `"cmd+k"`, `"shift+Tab"`.
public struct KeyChord: Equatable, Sendable {
    /// The canonical name (`"Escape"`, `"ArrowDown"`, `"k"`).
    public let key: String
    /// Exactly the modifiers that must be down — no more, no less. `"Escape"`
    /// does not fire on ⌘Escape; a declared chord means what it says.
    public let modifiers: NSEvent.ModifierFlags

    public init?(_ declaration: String) {
        var modifiers: NSEvent.ModifierFlags = []
        var key: String?

        for part in declaration.split(separator: "+").map(String.init) {
            switch part.lowercased() {
            case "cmd", "command", "meta", "super": modifiers.insert(.command)
            case "shift": modifiers.insert(.shift)
            case "alt", "opt", "option": modifiers.insert(.option)
            case "ctrl", "control": modifiers.insert(.control)
            default: key = Self.canonical(part)
            }
        }
        guard let key else { return nil }
        self.key = key
        self.modifiers = modifiers
    }

    /// Whether this chord holds a modifier — which decides *where* it is matched.
    /// A modified chord is a key equivalent (window-wide, focus-independent); an
    /// unmodified one is a key press, and belongs to whoever has focus.
    public var isKeyEquivalent: Bool { !modifiers.isEmpty }

    public func matches(_ event: NSEvent) -> Bool {
        KeyChord.key(for: event) == key && KeyChord.modifiers(of: event) == modifiers
    }

    /// The canonical name of the key an event carries, or nil if it has none.
    ///
    /// Read from the *key code* for everything that has no printable character:
    /// the character Escape or Delete produces is a control code, and there are
    /// several spellings of each in circulation. The key code is the key.
    public static func key(for event: NSEvent) -> String? {
        if let named = byKeyCode[event.keyCode] { return named }
        // `charactersIgnoringModifiers` still honours Shift, so `shift+k` arrives
        // as "K". The chord `"shift+k"` names the *key*, not the character.
        guard let characters = event.charactersIgnoringModifiers, !characters.isEmpty else {
            return nil
        }
        return characters.lowercased()
    }

    /// Only the modifiers a plugin can reason about. Caps Lock, Fn and the
    /// numeric-keypad flag are device state, not intent, and comparing them would
    /// make a chord fail for a reason nobody could see.
    static func modifiers(of event: NSEvent) -> NSEvent.ModifierFlags {
        event.modifierFlags.intersection([.command, .shift, .option, .control])
    }

    /// Accepts what a React author would write (`ArrowDown`, `Escape`) and what a
    /// shortcut string usually says (`down`, `esc`), and returns one name for both
    /// — the one the plugin will see in the event payload.
    private static func canonical(_ name: String) -> String {
        let lowered = name.lowercased()
        if let alias = aliases[lowered] { return alias }
        return lowered
    }

    private static let aliases: [String: String] = [
        "escape": "Escape", "esc": "Escape",
        "enter": "Enter", "return": "Enter",
        "tab": "Tab",
        "space": "Space", " ": "Space",
        "backspace": "Backspace",
        "delete": "Delete", "forwarddelete": "Delete",
        "up": "ArrowUp", "arrowup": "ArrowUp",
        "down": "ArrowDown", "arrowdown": "ArrowDown",
        "left": "ArrowLeft", "arrowleft": "ArrowLeft",
        "right": "ArrowRight", "arrowright": "ArrowRight",
        "home": "Home", "end": "End",
        "pageup": "PageUp", "pagedown": "PageDown",
    ]

    private static let byKeyCode: [UInt16: String] = [
        53: "Escape",
        36: "Enter", 76: "Enter",  // Return and the keypad's Enter
        48: "Tab",
        49: "Space",
        51: "Backspace",
        117: "Delete",
        126: "ArrowUp", 125: "ArrowDown", 123: "ArrowLeft", 124: "ArrowRight",
        115: "Home", 119: "End", 116: "PageUp", 121: "PageDown",
    ]
}

// MARK: - Interest

/// The keys a view has declared, and where to send them.
///
/// Empty by default, which is the important part: a view that declared nothing
/// takes nothing, and every keystroke reaches AppKit untouched.
@MainActor
public struct KeyInterest {
    public private(set) var chords: [KeyChord] = []
    private var handlerId: String?
    private var executor: HandlerExecutor?

    public init() {}

    public var isEmpty: Bool { chords.isEmpty || handlerId == nil }

    /// Read the declaration off a node: `keyDownEvents={["Escape", "cmd+k"]}`.
    public init(node: ShadowNode, executor: @escaping HandlerExecutor) {
        chords =
            (node.props["keyDownEvents"]?.arrayValue ?? [])
            .compactMap(\.stringValue)
            .compactMap(KeyChord.init)
        handlerId = node.handlerId(for: "onKeyDown")
        self.executor = executor
    }

    /// Handle a key press aimed at this view. Returns whether it was consumed —
    /// if not, the caller must pass it on, or the responder chain is broken.
    ///
    /// `keyEquivalentsOnly` distinguishes the two moments a key can arrive:
    /// `performKeyEquivalent` runs window-wide before anyone has focus, so only
    /// modified chords may claim it (an unmodified `"k"` claimed there would eat
    /// every `k` typed into every field in the window).
    public func handle(_ event: NSEvent, keyEquivalentsOnly: Bool = false) -> Bool {
        guard let handlerId, let executor else { return false }
        guard
            let chord = chords.first(where: {
                (!keyEquivalentsOnly || $0.isKeyEquivalent) && $0.matches(event)
            })
        else { return false }

        executor(handlerId, [Self.payload(for: event, key: chord.key)])
        return true
    }

    /// Handle a key the *field editor* turned into an editing command (see
    /// `HandlerTextField`), which arrives as a selector rather than an event.
    public func handle(command: Selector) -> Bool {
        guard let handlerId, let executor, let key = Self.commands[command] else { return false }
        guard chords.contains(where: { $0.key == key && $0.modifiers.isEmpty }) else { return false }

        executor(
            handlerId,
            [
                .object([
                    "key": .string(key), "repeat": .bool(false),
                    "metaKey": .bool(false), "shiftKey": .bool(false),
                    "altKey": .bool(false), "ctrlKey": .bool(false),
                ])
            ])
        return true
    }

    /// What the plugin's `onKeyDown` receives — field for field, a DOM
    /// `KeyboardEvent`.
    ///
    /// Not merely because React authors know those names, but because the *same
    /// plugin* renders on a web host, where `onKeyDown` is handed a real
    /// `KeyboardEvent`. Inventing `meta` and `alt` here would mean one tree that
    /// reads its keys two different ways depending on who is rendering it.
    private static func payload(for event: NSEvent, key: String) -> JSONValue {
        let modifiers = KeyChord.modifiers(of: event)
        return .object([
            "key": .string(key),
            "metaKey": .bool(modifiers.contains(.command)),
            "shiftKey": .bool(modifiers.contains(.shift)),
            "altKey": .bool(modifiers.contains(.option)),
            "ctrlKey": .bool(modifiers.contains(.control)),
            "repeat": .bool(event.isARepeat),
        ])
    }

    /// The editing commands a focused text field converts key presses into, mapped
    /// back to the keys that produced them.
    private static let commands: [Selector: String] = [
        #selector(NSResponder.cancelOperation(_:)): "Escape",
        #selector(NSResponder.insertNewline(_:)): "Enter",
        #selector(NSResponder.insertTab(_:)): "Tab",
        #selector(NSResponder.moveUp(_:)): "ArrowUp",
        #selector(NSResponder.moveDown(_:)): "ArrowDown",
        #selector(NSResponder.moveLeft(_:)): "ArrowLeft",
        #selector(NSResponder.moveRight(_:)): "ArrowRight",
        #selector(NSResponder.scrollPageUp(_:)): "PageUp",
        #selector(NSResponder.scrollPageDown(_:)): "PageDown",
        #selector(NSResponder.deleteBackward(_:)): "Backspace",
        #selector(NSResponder.deleteForward(_:)): "Delete",
    ]
}

// MARK: - Views

/// A view that can claim declared keys. The overrides themselves have to live in
/// each class (a protocol extension cannot override an `NSView` method), so this
/// carries the logic and the classes stay three lines each.
@MainActor
public protocol KeyResponder: NSView {
    var keyInterest: KeyInterest { get set }
    /// Take first responder on mount (the `autoFocus` prop).
    var autoFocuses: Bool { get set }
}

extension KeyResponder {
    /// A view is focusable exactly when it has asked for keys. Focus is not
    /// decoration: without it the responder chain never reaches this view and the
    /// declaration would be silently inert.
    public var wantsKeys: Bool { !keyInterest.isEmpty }

    /// Claim the event, or say so and let AppKit carry on.
    public func claim(_ event: NSEvent, keyEquivalentsOnly: Bool = false) -> Bool {
        keyInterest.handle(event, keyEquivalentsOnly: keyEquivalentsOnly)
    }

    /// Take focus, if the node asked for it with `autoFocus` — and only once.
    ///
    /// Both guards are load-bearing. Focus is a *window-wide* resource: a view
    /// that takes it takes it from whoever had it. A view that grabbed focus
    /// merely because it listens for keys would steal the caret out of the search
    /// field beside it — and grabbing it again on every commit would do so on
    /// every keystroke, which is exactly how the palette below broke: ⌘K still
    /// worked (a key equivalent needs no focus) while the arrow keys went dead,
    /// because the field had stopped being the first responder.
    public func focusIfNeeded(_ hasFocused: inout Bool) {
        guard autoFocuses, !hasFocused, wantsKeys, let window else { return }
        hasFocused = true
        window.makeFirstResponder(self)
    }
}
