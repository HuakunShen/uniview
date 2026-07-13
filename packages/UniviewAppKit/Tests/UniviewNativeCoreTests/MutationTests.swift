import Foundation
import Testing

@testable import UniviewNativeCore

@Suite struct MutationDecodingTests {
    @Test func decodesCommitBatchWithMixedMutations() throws {
        let json = """
        {
          "revision": 5,
          "mutations": [
            { "type": "setProps", "nodeId": "b1", "props": { "title": "Save" } },
            { "type": "setText", "nodeId": "t1", "text": "Hello" },
            { "type": "removeChild", "parentId": "root", "nodeId": "x1" },
            { "type": "appendChild", "parentId": "root",
              "node": { "id": "n2", "type": "View", "props": {}, "children": [] } },
            { "type": "insertBefore", "parentId": "root", "beforeId": "n2",
              "node": { "id": "n3", "type": "Button", "props": {}, "children": [] } },
            { "type": "setRoot",
              "node": { "id": "r", "type": "View", "props": {}, "children": [] } }
          ]
        }
        """
        let batch = try JSONDecoder().decode(CommitBatch.self, from: Data(json.utf8))
        #expect(batch.revision == 5)
        #expect(batch.mutations.count == 6)
        #expect(
            batch.mutations[0] == .setProps(nodeId: "b1", props: ["title": .string("Save")]))
        #expect(batch.mutations[1] == .setText(nodeId: "t1", text: "Hello"))
        #expect(batch.mutations[2] == .removeChild(parentId: "root", nodeId: "x1"))
        guard case .appendChild(let ap, let an) = batch.mutations[3] else {
            Issue.record("expected appendChild")
            return
        }
        #expect(ap == "root")
        #expect(an.id == "n2")
        guard case .insertBefore(_, let inode, let beforeId) = batch.mutations[4] else {
            Issue.record("expected insertBefore")
            return
        }
        #expect(beforeId == "n2")
        #expect(inode.type == "Button")
        guard case .setRoot(let rnode) = batch.mutations[5] else {
            Issue.record("expected setRoot")
            return
        }
        #expect(rnode?.id == "r")
    }

    @Test func setRootAcceptsNull() throws {
        let json = """
        { "revision": 0, "mutations": [ { "type": "setRoot", "node": null } ] }
        """
        let batch = try JSONDecoder().decode(CommitBatch.self, from: Data(json.utf8))
        #expect(batch.mutations[0] == .setRoot(node: nil))
    }

    @Test func rejectsUnknownMutationType() {
        let json = """
        { "revision": 1, "mutations": [ { "type": "bogus", "nodeId": "x" } ] }
        """
        #expect(throws: DecodingError.self) {
            try JSONDecoder().decode(CommitBatch.self, from: Data(json.utf8))
        }
    }

    @Test func roundTrips() throws {
        let batch = CommitBatch(
            revision: 2,
            mutations: [
                .setText(nodeId: "t", text: "hi"),
                .appendChild(parentId: "p", node: UINode(id: "c", type: "View")),
                .setRoot(node: nil),
            ]
        )
        let data = try JSONEncoder().encode(batch)
        let decoded = try JSONDecoder().decode(CommitBatch.self, from: data)
        #expect(decoded == batch)
    }
}
