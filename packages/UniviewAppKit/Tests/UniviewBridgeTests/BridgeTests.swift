import Foundation
import Testing
import kkrpc

@testable import UniviewBridge
@testable import UniviewNativeCore

/// The generic kkrpc wire protocol (bidirectional dispatch, callbacks, errors) is
/// covered by kkrpc's own `RPCChannelTests`. What matters *here* is the uniview
/// contract: that the JSON a real TS plugin puts on the wire decodes into the
/// exact `UINode` / `Mutation` models this host renders from.
@Suite struct BridgeTests {

    private func json(_ text: String) throws -> kkrpc.JSONValue {
        try JSONDecoder().decode(kkrpc.JSONValue.self, from: Data(text.utf8))
    }

    @Test func decodesTypeScriptTreeIncludingBareStringChildren() throws {
        // Exactly what react-renderer serializes: children is (UINode | string)[].
        let tree = try #require(
            PluginConnection.decodeTree(
                try json(
                    #"""
                    {"id":"root","type":"View","props":{"style":{"gap":8}},
                     "children":[{"id":"t","type":"Text","props":{},"children":["Hello"]}]}
                    """#)))

        #expect(tree.id == "root")
        let label = try #require(tree.children.first)
        // A bare string child must become a #text node.
        #expect(label.children.first?.type == TEXT_NODE_TYPE)
        #expect(label.children.first?.text == "Hello")
    }

    @Test func decodesTypeScriptMutations() throws {
        let mutations = try json(
            #"""
            [{"type":"setProps","nodeId":"n1","props":{"title":"Save"}},
             {"type":"setText","nodeId":"t1","text":"hi"},
             {"type":"removeChild","parentId":"p","nodeId":"c"},
             {"type":"setRoot","node":{"id":"r","type":"View","props":{},"children":[]}}]
            """#
        ).decode([Mutation].self)

        #expect(mutations.count == 4)
        #expect(mutations[0] == .setProps(nodeId: "n1", props: ["title": .string("Save")]))
        #expect(mutations[1] == .setText(nodeId: "t1", text: "hi"))
        #expect(mutations[2] == .removeChild(parentId: "p", nodeId: "c"))
        if case .setRoot(let node) = mutations[3] {
            #expect(node?.id == "r")
        } else {
            Issue.record("expected setRoot")
        }
    }

    /// Handler props cross the wire as ids, never as functions.
    @Test func decodesHandlerIdProps() throws {
        let tree = try #require(
            PluginConnection.decodeTree(
                try json(
                    #"""
                    {"id":"b","type":"Button","props":{"title":"Save","_onClickHandlerId":"h1"},
                     "children":[]}
                    """#)))
        let node = ShadowNode.from(tree)
        #expect(node.handlerId(for: "onClick") == "h1")
    }

    @Test func updateTreeNullMeansNoTree() {
        #expect(PluginConnection.decodeTree(.null) == nil)
        #expect(PluginConnection.decodeTree(nil) == nil)
    }
}
