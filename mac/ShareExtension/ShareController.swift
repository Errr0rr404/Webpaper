import Cocoa

final class ShareController: ExtensionController {
	override func run(_ context: NSExtensionContext) async throws -> [NSExtensionItem] {
		guard
			let url = try await (context.attachments.first { $0.hasItemConforming(to: .url) })?.loadTransferable(type: URL.self)
		else {
			context.cancel()
			return []
		}

		// `URLComponents.url` is nil when the path does not start with `/`, so `webpaper:add` cannot be built that way. Build the non-hierarchical URL directly.
		var components = URLComponents()
		components.queryItems = [
			.init(name: "url", value: url.absoluteString)
		]

		guard
			let query = components.percentEncodedQuery,
			let openURL = URL(string: "webpaper:add?\(query)")
		else {
			context.cancel()
			return []
		}

		NSWorkspace.shared.open(openURL)

		return []
	}
}

extension NSItemProvider: @retroactive @unchecked Sendable {}
