import Cocoa

final class DesktopWindow: NSWindow {
	override var canBecomeMain: Bool { isInteractive }
	override var canBecomeKey: Bool { isInteractive }
	override var acceptsFirstResponder: Bool { isInteractive }

	private var cancellables = Set<AnyCancellable>()

	var targetDisplay: Display? {
		didSet {
			setFrame()
		}
	}

	var isInteractive = false {
		didSet {
			if isInteractive {
				level = Defaults[.bringBrowsingModeToFront] ? .floating : (.desktopIcon + 1) // The `+ 1` fixes a weird issue where the window is sometimes not interactive. (macOS 11.2.1)
				makeKeyAndOrderFront(self)
				ignoresMouseEvents = false
			} else {
				level = .desktop
				orderBack(self)

				// Even though the window is on `.desktop` level, the user would be able to interact if they hide desktop icons.
				ignoresMouseEvents = true
			}
		}
	}

	convenience init(display: Display?) {
		self.init(
			contentRect: .zero,
			styleMask: [
				.borderless
			],
			backing: .buffered,
			defer: false
		)

		self.targetDisplay = display

		self.isOpaque = false
		self.backgroundColor = .clear
		self.level = .desktop
		self.isRestorable = false
		self.isReleasedWhenClosed = false // We manage the lifetime ourselves so tearing down instances (e.g. when a display is unplugged) cannot over-release.
		self.canHide = false
		self.displaysWhenScreenProfileChanges = true
		self.collectionBehavior = [
			.stationary,
			.ignoresCycle,
			.fullScreenNone // This ensures that if Plash is launched while an app is fullscreen (fullscreen is a separate space), it will not show behind that app and instead show in the primary space.
		]

		disableSnapshotRestoration()
		setFrame()

		NSScreen.publisher
			.sink { [weak self] in
				self?.setFrame()
			}
			.store(in: &cancellables)

		Defaults.publisher(.extendPlashBelowMenuBar)
			.sink { [weak self] _ in
				self?.setFrame()
			}
			.store(in: &cancellables)
	}

	private func setFrame() {
		// Ensure the screen still exists.
		guard let screen = targetDisplay?.screen ?? .main else {
			return
		}

		var frame = screen.frameWithoutStatusBar
		frame.size.height += 1 // Probably not needed, but just to ensure it covers all the way up to the menu bar on older Macs (I can only test on M1 Mac)

		if Defaults[.extendPlashBelowMenuBar] {
			frame = screen.frame
		}

		setFrame(frame, display: true)
	}
}


/**
A single desktop rendering surface: one `DesktopWindow` paired with its own `WebViewController`.

A `WKWebView` can only live in a single window at a time, so multi-display support requires one window *and* one web view per display. `AppState` owns a collection of these, one per target display.
*/
@MainActor
final class DesktopInstance {
	let webViewController = WebViewController()
	let window: DesktopWindow

	/**
	Subscriptions tied to this instance's lifetime (e.g. its web view load events). Released automatically when the instance is torn down, so we never re-subscribe a `WebViewController`'s load publisher — which can terminate on failure and would replay that stale terminal event to a new subscriber.
	*/
	var cancellables = Set<AnyCancellable>()

	/**
	The display this instance renders on. Setting it repositions the window.
	*/
	var targetDisplay: Display? {
		get { window.targetDisplay }
		set {
			window.targetDisplay = newValue
			webViewController.targetDisplay = newValue
		}
	}

	init(display: Display?) {
		window = DesktopWindow(display: display)
		// Set before the web view is first created (below), so it configures against the right per-display website.
		webViewController.targetDisplay = display
		window.contentView = webViewController.webView
		hideWebView()
	}

	/**
	Recreate the underlying web view (used when settings that require a fresh configuration change, e.g. mute audio) and reattach it to the window.
	*/
	func recreateWebView() {
		webViewController.recreateWebView()
		window.contentView = webViewController.webView
		hideWebView()
	}

	/**
	Hide the web view instantly, before its content has loaded.
	*/
	func hideWebView() {
		window.contentView?.alphaValue = 0
	}

	/**
	Fade the web view in once its content has loaded — a smooth reveal instead of an abrupt appearance (issue #9). A no-op if it's already visible, so routine reloads don't re-fade.
	*/
	func revealWebView() {
		guard
			let contentView = window.contentView,
			contentView.alphaValue < 1
		else {
			return
		}

		NSAnimationContext.runAnimationGroup {
			$0.duration = 0.6
			$0.allowsImplicitAnimation = true
			contentView.animator().alphaValue = 1
		}
	}
}
