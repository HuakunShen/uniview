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
        .library(name: "UniviewYoga", targets: ["UniviewYoga"]),
        .library(name: "UniviewBridge", targets: ["UniviewBridge"]),
    ],
    dependencies: [
        .package(url: "https://github.com/facebook/yoga.git", from: "3.0.0"),
        // kkrpc's Swift interop client (submodule) — the transport that lets a
        // real TS/React plugin drive this native host over the bridge server.
        .package(path: "../../vendors/kkrpc/interop/swift"),
    ],
    targets: [
        .target(name: "UniviewNativeCore"),
        .target(
            name: "UniviewAppKit",
            dependencies: ["UniviewNativeCore"]
        ),
        // kkrpc transport: connects to the bridge server, receives UINode trees /
        // mutations from a plugin, and calls handlers back on it.
        .target(
            name: "UniviewBridge",
            dependencies: [
                "UniviewNativeCore",
                .product(name: "kkrpc", package: "swift"),
            ]
        ),
        // Yoga-backed LayoutEngine — isolates the C++ Yoga dependency so
        // UniviewAppKit consumers only pull it in when they want real flexbox.
        .target(
            name: "UniviewYoga",
            dependencies: [
                "UniviewNativeCore",
                .product(name: "yoga", package: "yoga"),
            ]
        ),
        .testTarget(
            name: "UniviewNativeCoreTests",
            dependencies: ["UniviewNativeCore"]
        ),
        .testTarget(
            name: "UniviewAppKitTests",
            dependencies: ["UniviewAppKit", "UniviewYoga"]  // Yoga for end-to-end layout tests
        ),
        .testTarget(
            name: "UniviewYogaTests",
            dependencies: ["UniviewYoga"]
        ),
        .testTarget(
            name: "UniviewBridgeTests",
            dependencies: ["UniviewBridge"]
        ),
        // Thin demo — imports UniviewAppKit + UniviewYoga + UniviewBridge.
        .executableTarget(
            name: "UniviewDemoApp",
            dependencies: ["UniviewAppKit", "UniviewYoga", "UniviewBridge"]
        ),
    ]
)
