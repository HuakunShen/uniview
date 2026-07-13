// swift-tools-version: 6.0
import PackageDescription

// Uniview native framework.
//
// Engine/host separation (Fabric/Flutter-style):
//   UniviewNativeCore  — portable, Foundation-only: protocol models (UINode,
//                        Mutation, CommitBatch), ShadowNode, reconciler
//                        interfaces, Style IR, component spec, transport.
//   UniviewAppKit      — AppKit host: NSView mounting, ComponentRegistry,
//                        native factories, event dispatch, lifecycle.
//
// The demo app is a separate thin target that imports UniviewAppKit; no
// framework logic lives in demos.
let package = Package(
    name: "Uniview",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "UniviewNativeCore", targets: ["UniviewNativeCore"]),
        .library(name: "UniviewAppKit", targets: ["UniviewAppKit"]),
    ],
    targets: [
        .target(name: "UniviewNativeCore"),
        .target(
            name: "UniviewAppKit",
            dependencies: ["UniviewNativeCore"]
        ),
        .testTarget(
            name: "UniviewNativeCoreTests",
            dependencies: ["UniviewNativeCore"]
        ),
        .testTarget(
            name: "UniviewAppKitTests",
            dependencies: ["UniviewAppKit"]
        ),
    ]
)
