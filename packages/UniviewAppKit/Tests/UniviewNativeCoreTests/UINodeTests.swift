import Foundation
import Testing

@testable import UniviewNativeCore

@Suite struct UINodeDecodingTests {
    @Test func decodesElementWithPropsAndChildren() throws {
        let json = """
        {
          "id": "root",
          "type": "View",
          "props": {
            "title": "Hi",
            "count": 3,
            "disabled": false,
            "ratio": 1.5,
            "nothing": null
          },
          "children": [
            { "id": "t1", "type": "#text", "props": {}, "children": [], "text": "Hello" },
            { "id": "b1", "type": "Button", "props": {}, "children": [] }
          ]
        }
        """
        let node = try JSONDecoder().decode(UINode.self, from: Data(json.utf8))
        #expect(node.id == "root")
        #expect(node.type == "View")
        #expect(node.props["title"] == .string("Hi"))
        #expect(node.props["count"] == .number(3))
        #expect(node.props["disabled"] == .bool(false))
        #expect(node.props["ratio"] == .number(1.5))
        #expect(node.props["nothing"] == .null)
        #expect(node.children.count == 2)
        #expect(node.children[0].type == "#text")
        #expect(node.children[0].text == "Hello")
        #expect(node.children[0].isTextNode)
        #expect(node.children[1].type == "Button")
    }

    @Test func decodesBareStringChildAsTextNode() throws {
        // Back-compat: bare-string children normalize into #text nodes.
        let json = """
        { "id": "p", "type": "p", "props": {}, "children": ["just text"] }
        """
        let node = try JSONDecoder().decode(UINode.self, from: Data(json.utf8))
        #expect(node.children.count == 1)
        #expect(node.children[0].isTextNode)
        #expect(node.children[0].textContent == "just text")
    }

    @Test func textFactoryAndHelpers() {
        let text = UINode.text("hi", id: "t")
        #expect(text.isTextNode)
        #expect(text.textContent == "hi")
        let element = UINode(id: "v", type: "View")
        #expect(!element.isTextNode)
        #expect(element.textContent == nil)
    }

    @Test func roundTripsThroughEncoding() throws {
        let original = UINode(
            id: "root",
            type: "View",
            props: ["title": .string("Save"), "n": .number(2)],
            children: [UINode.text("hi", id: "t1")]
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(UINode.self, from: data)
        #expect(decoded == original)
    }
}
