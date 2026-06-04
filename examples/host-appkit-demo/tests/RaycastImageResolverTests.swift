import AppKit
import Foundation

func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() {
        fputs("FAIL: \(message)\n", stderr)
        exit(1)
    }
}

@main
struct RaycastImageResolverTests {
    static func main() {
        let transparentPixel =
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lP9u0wAAAABJRU5ErkJggg=="

        let dataURLImage = RaycastImageResolver.image(
            from: transparentPixel,
            accessibilityDescription: "Transparent pixel"
        )
        expect(dataURLImage != nil, "base64 data URL image is decoded")
        expect(dataURLImage?.accessibilityDescription == "Transparent pixel", "accessibility description is applied")

        let symbolImage = RaycastImageResolver.image(from: "photo", accessibilityDescription: "Photo")
        expect(symbolImage != nil, "SF Symbol images are resolved")

        let emptyImage = RaycastImageResolver.image(from: "   ", accessibilityDescription: nil)
        expect(emptyImage == nil, "empty image sources are ignored")

        print("RaycastImageResolverTests passed")
    }
}
