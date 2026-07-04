import SwiftUI

@MainActor
final class AppState: ObservableObject {
	static let shared = AppState()

	var cancellables = Set<AnyCancellable>()

	let menu = SSMenu()
	let powerSourceWatcher = PowerSourceWatcher()

	private(set) lazy var statusItem = with(NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)) {
		$0.isVisible = true
		$0.behavior = [.removalAllowed, .terminationOnRemoval]
		$0.menu = menu
		$0.button!.image = .menuBarIcon
		$0.button!.setAccessibilityTitle(SSApp.name)
	}

	private(set) lazy var statusItemButton = statusItem.button!

	/**
	One rendering surface per target display. In single-display mode this holds one instance; with "Show on all displays" enabled it holds one per connected screen.
	*/
	private(set) var desktopInstances = [DesktopInstance]()

	/**
	The primary instance. Used for operations that only make sense once (menu state, reading the current URL, clearing shared website data).
	*/
	var primaryInstance: DesktopInstance? { desktopInstances.first }

	var isBrowsingMode = false {
		didSet {
			guard isEnabled else {
				return
			}

			for instance in desktopInstances {
				instance.window.isInteractive = isBrowsingMode
				instance.window.alphaValue = isBrowsingMode ? 1 : Defaults[.opacity]
			}

			resetTimer()
		}
	}

	var isEnabled = true {
		didSet {
			resetTimer()
			statusItemButton.appearsDisabled = !isEnabled

			if isEnabled {
				loadUserURL()

				for instance in desktopInstances {
					instance.window.makeKeyAndOrderFront(self)
				}
			} else {
				// TODO: Properly unload the web view instead of just clearing and hiding it.
				for instance in desktopInstances {
					instance.window.orderOut(self)
				}

				loadURL("about:blank")
			}
		}
	}

	var isScreenLocked = false

	var isManuallyDisabled = false {
		didSet {
			setEnabledStatus()
		}
	}

	var reloadTimer: Timer?

	var webViewError: Error? {
		didSet {
			if let webViewError {
				statusItemButton.toolTip = "Error: \(webViewError.localizedDescription)"

				// TODO: There's a macOS bug that makes it black instead of a color.
//				statusItemButton.contentTintColor = .systemRed

				// TODO: Also present the error when the user just added it from the input box as then it's also "interactive".
				if
					oldValue == nil, // Only present once per load cycle. With multiple displays each web view fails independently and sets this, and `loadURL` resets it to `nil` before each cycle, so this keeps a single failure from stacking N modal dialogs.
					isBrowsingMode,
					!webViewError.localizedDescription.contains("No internet connection")
				{
					webViewError.presentAsModal()
				}

				return
			}

			statusItemButton.contentTintColor = nil
		}
	}

	private init() {
		DispatchQueue.main.async { [self] in
			didLaunch()
		}
	}

	private func didLaunch() {
		_ = statusItemButton
		updateDesktopInstances()
		setUpEvents()
		showWelcomeScreenIfNeeded()

		#if DEBUG
//		SSApp.showSettingsWindow()
//		Constants.openWebsitesWindow()
		#endif
	}

	func handleMenuBarIcon() {
		statusItem.isVisible = true

		delay(.seconds(5)) { [self] in
			guard Defaults[.hideMenuBarIcon] else {
				return
			}

			statusItem.isVisible = false
		}
	}

	func handleAppReopen() {
		handleMenuBarIcon()
	}

	func setEnabledStatus() {
		isEnabled = !isManuallyDisabled && !isScreenLocked && !(Defaults[.deactivateOnBattery] && powerSourceWatcher?.powerSource.isUsingBattery == true)
	}

	func resetTimer() {
		reloadTimer?.invalidate()
		reloadTimer = nil

		guard
			isEnabled,
			!isBrowsingMode,
			let reloadInterval = Defaults[.reloadInterval]
		else {
			return
		}

		reloadTimer = Timer.scheduledTimer(withTimeInterval: reloadInterval, repeats: true) { [self] _ in
			Task { @MainActor in
				reloadWebsite()
			}
		}
	}

	func recreateWebView() {
		for instance in desktopInstances {
			instance.recreateWebView()
		}
	}

	func recreateWebViewAndReload() {
		recreateWebView()
		loadUserURL()
	}

	func reloadWebsite() {
		// We always load the website the user specified in case it's a redirect that may change on each call.
		loadUserURL()

//		webViewController.reloadCurrentPageFromOrigin()
	}

	func loadUserURL() {
		loadURL(WebsitesController.shared.current?.url)
	}

	func toggleBrowsingMode() {
		Defaults[.isBrowsingMode].toggle()
	}

	func loadURL(_ url: URL?) {
		webViewError = nil

		guard
			let url,
			url.isValid
		else {
			return
		}

		// Each display gets its own web view, and the `[[screenWidth]]`/`[[screenHeight]]` placeholders resolve to that display's dimensions.
		for instance in desktopInstances {
			load(url, into: instance)
		}

		// TODO: Add a callback to `loadURL` when it's done loading instead.
		// TODO: Fade in the web view.
		delay(.seconds(1)) { [self] in
			for instance in desktopInstances {
				instance.window.contentView?.isHidden = false
			}
		}
	}

	/**
	Load a URL into a single instance, resolving the `[[screenWidth]]`/`[[screenHeight]]` placeholders against that instance's own display.
	*/
	private func load(_ url: URL, into instance: DesktopInstance) {
		let instanceURL: URL
		do {
			instanceURL = try replacePlaceholders(of: url, for: instance.targetDisplay) ?? url
		} catch {
			error.presentAsModal()
			return
		}

		instance.webViewController.loadURL(instanceURL)
	}

	/**
	Replaces app-specific placeholder strings in the given URL with a corresponding value.

	If `display` is `nil`, the primary instance's display is used.
	*/
	func replacePlaceholders(of url: URL, for display: Display? = nil) throws -> URL? {
		// Here we swap out `[[screenWidth]]` and `[[screenHeight]]` for their actual values.
		// We proceed only if we have an `NSScreen` to work with.
		guard let screen = (display ?? primaryInstance?.targetDisplay)?.screen ?? .main else {
			return nil
		}

		return try url
			.replacingPlaceholder("[[screenWidth]]", with: String(format: "%.0f", screen.frameWithoutStatusBar.width))
			.replacingPlaceholder("[[screenHeight]]", with: String(format: "%.0f", screen.frameWithoutStatusBar.height))
	}

	/**
	The display targets Plash should currently render on, one per instance.

	A `nil` target means "follow the live main display" — the same behavior the original single window had. With "Show on all displays" enabled, this is every connected display; otherwise it's the single chosen display, or `nil` when none is explicitly chosen.
	*/
	private var desiredTargets: [Display?] {
		if Defaults[.showOnAllDisplays] {
			let all = Display.all
			return all.isEmpty ? [nil] : all.map { Optional($0) }
		}

		return [Defaults[.display]?.withFallbackToMain]
	}

	/**
	Reconcile the set of `desktopInstances` with the displays we should currently render on.

	Instances for displays that are still wanted are preserved (keeping their web view's scroll position, playback, and in-memory state); only instances for removed displays are torn down, and only newly-added displays get a fresh web view. Does nothing when the set of targets is unchanged, so routine screen-parameter changes (dock/menu-bar toggles, resolution changes) are cheap — `DesktopWindow` repositions itself for those.

	- Parameter reloadNewInstances: When `true`, newly-created instances load the current website. Pass `false` when the caller triggers a full reload afterwards (e.g. on wake) so the new instances don't load twice.
	*/
	func updateDesktopInstances(reloadNewInstances: Bool = true) {
		let desired = desiredTargets
		let desiredKeys = desired.map(Self.instanceKey)

		guard desiredKeys != desktopInstances.map({ Self.instanceKey($0.targetDisplay) }) else {
			return
		}

		// Preserve instances whose target is still wanted; tear down the rest.
		let desiredKeySet = Set(desiredKeys)
		var preserved = [String: DesktopInstance]()
		for instance in desktopInstances {
			let key = Self.instanceKey(instance.targetDisplay)
			if desiredKeySet.contains(key), preserved[key] == nil {
				preserved[key] = instance
			} else {
				instance.window.orderOut(nil)
				instance.window.contentView = nil
			}
		}

		var created = [DesktopInstance]()
		desktopInstances = desired.map { target in
			let key = Self.instanceKey(target)
			if let existing = preserved[key] {
				return existing
			}

			let instance = DesktopInstance(display: target)
			wireEvents(for: instance)
			created.append(instance)
			return instance
		}

		applyStateToDesktopInstances()

		if
			reloadNewInstances,
			isEnabled,
			let url = WebsitesController.shared.current?.url
		{
			for instance in created {
				load(url, into: instance)
			}
		}
	}

	/**
	A stable identity for an instance's target display, used to reconcile instances. A `nil` target (follow the live main display) maps to a fixed sentinel so it isn't churned on every screen change.
	*/
	private static func instanceKey(_ display: Display?) -> String {
		display?.id.uuidString ?? "__followsMainDisplay__"
	}

	/**
	Apply the current visual state (browsing mode, opacity, spaces behavior, visibility) to every instance. Used right after (re)building instances.
	*/
	private func applyStateToDesktopInstances() {
		for instance in desktopInstances {
			instance.window.collectionBehavior.toggleExistence(.canJoinAllSpaces, shouldExist: Defaults[.showOnAllSpaces])
			instance.window.alphaValue = isBrowsingMode ? 1 : Defaults[.opacity]
			instance.window.isInteractive = isBrowsingMode

			if isEnabled {
				instance.window.makeKeyAndOrderFront(self)
			} else {
				instance.window.orderOut(self)
			}
		}
	}

	/**
	Wire up a single instance's web view events (load success/failure and zoom restoration).

	Called exactly once, when the instance is created. The subscription lives on the instance and is released when the instance is torn down. We deliberately do NOT re-subscribe existing instances on reconcile: `WebViewController`'s load publisher can terminate on a load failure, and a fresh subscription would immediately replay that stale terminal event and resurrect the error state.
	*/
	private func wireEvents(for instance: DesktopInstance) {
		let webViewController = instance.webViewController

		webViewController.didLoadPublisher
			.convertToResult()
			.sink { [self] result in
				switch result {
				case .success:
					// Set the persisted zoom level.
					// This must be here as `webView.url` needs to have been set.
					let zoomLevel = webViewController.webView.zoomLevelWrapper
					if zoomLevel != 1 {
						webViewController.webView.zoomLevelWrapper = zoomLevel
					}

					statusItemButton.toolTip = WebsitesController.shared.current?.tooltip
				case .failure(let error):
					webViewError = error
				}
			}
			.store(in: &instance.cancellables)
	}
}
