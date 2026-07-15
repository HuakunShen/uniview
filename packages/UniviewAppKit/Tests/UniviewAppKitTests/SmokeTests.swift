import Testing

@testable import UniviewAppKit

@Suite struct UniviewAppKitSmokeTests {
    @Test func exposesVersion() {
        #expect(UniviewAppKit.version == "0.0.1")
    }
}
