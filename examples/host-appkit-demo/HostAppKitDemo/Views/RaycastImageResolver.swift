import AppKit
import Foundation

enum RaycastImageResolver {
    static func image(from source: String, accessibilityDescription: String?) -> NSImage? {
        let trimmedSource = source.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedSource.isEmpty else {
            return nil
        }

        if let image = dataURLImage(from: trimmedSource) {
            image.accessibilityDescription = accessibilityDescription
            return image
        }

        if let image = fileImage(from: trimmedSource) {
            image.accessibilityDescription = accessibilityDescription
            return image
        }

        return NSImage(systemSymbolName: trimmedSource, accessibilityDescription: accessibilityDescription)
    }

    private static func dataURLImage(from source: String) -> NSImage? {
        guard source.hasPrefix("data:image/"),
              let commaIndex = source.firstIndex(of: ",") else {
            return nil
        }

        let metadata = source[..<commaIndex]
        guard metadata.contains(";base64") else {
            return nil
        }

        let payload = source[source.index(after: commaIndex)...]
        guard let data = Data(base64Encoded: String(payload), options: [.ignoreUnknownCharacters]) else {
            return nil
        }

        return NSImage(data: data)
    }

    private static func fileImage(from source: String) -> NSImage? {
        if source.hasPrefix("file://"),
           let url = URL(string: source),
           url.isFileURL {
            return NSImage(contentsOf: url)
        }

        guard source.hasPrefix("/") || source.hasPrefix("~") else {
            return nil
        }

        let path = (source as NSString).expandingTildeInPath
        return NSImage(contentsOfFile: path)
    }
}
