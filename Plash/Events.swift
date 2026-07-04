import Cocoa
import KeyboardShortcuts

extension AppState {
	func setUpEvents() {
		menu.onUpdate = { [self] in
			updateMenu()
		}

		// Web view load/zoom handling is wired per desktop instance in `wireEvents(for:)` (once per instance, at creation), since there is one web view per display.

		powerSourceWatcher?.didChangePublisher
			.sink { [self] _ in
				guard Defaults[.deactivateOnBattery] else {
					return
				}

				setEnabledStatus()
			}
			.store(in: &cancellables)

		SSEvents.deviceDidWake
			.sink { [self] in
				// The display setup may have changed during sleep, so reconcile first — without loading the new instances, since the reload below already covers every instance exactly once.
				updateDesktopInstances(reloadNewInstances: false)
				reloadWebsite()
			}
			.store(in: &cancellables)

		SSEvents.isScreenLocked
			.sink { [self] in
				isScreenLocked = $0
				setEnabledStatus()
			}
			.store(in: &cancellables)

		Defaults.publisher(.websites, options: [])
			.receive(on: DispatchQueue.main)
			.sink { [self] in
				resetTimer()
				recreateWebViewAndReload()

				// We never destroy the webview, so we have to make sure it's not in browsing mode when there are no websites.
				if $0.newValue.isEmpty {
					Defaults[.isBrowsingMode] = false
				}
			}
			.store(in: &cancellables)

		Defaults.publisher(.isBrowsingMode)
			.receive(on: DispatchQueue.main)
			.sink { [self] change in
				isBrowsingMode = change.newValue
			}
			.store(in: &cancellables)

		Defaults.publisher(.hideMenuBarIcon)
			.sink { [self] _ in
				handleMenuBarIcon()
			}
			.store(in: &cancellables)

		Defaults.publisher(.opacity)
			.sink { [self] change in
				for instance in desktopInstances {
					instance.window.alphaValue = isBrowsingMode ? 1 : change.newValue
				}
			}
			.store(in: &cancellables)

		Defaults.publisher(.reloadInterval)
			.sink { [self] _ in
				resetTimer()
			}
			.store(in: &cancellables)

		Defaults.publisher(.display, options: [])
			.sink { [self] change in
				// In single-display mode, just move the existing window to avoid a reload. In all-displays mode the chosen display is irrelevant.
				guard !Defaults[.showOnAllDisplays] else {
					return
				}

				if desktopInstances.count == 1 {
					desktopInstances[0].targetDisplay = change.newValue
				} else {
					updateDesktopInstances()
				}
			}
			.store(in: &cancellables)

		Defaults.publisher(.showOnAllDisplays, options: [])
			.sink { [self] _ in
				updateDesktopInstances()
			}
			.store(in: &cancellables)

		Defaults.publisher(.deactivateOnBattery)
			.sink { [self] _ in
				setEnabledStatus()
			}
			.store(in: &cancellables)

		Defaults.publisher(.showOnAllSpaces)
			.sink { [self] change in
				for instance in desktopInstances {
					instance.window.collectionBehavior.toggleExistence(.canJoinAllSpaces, shouldExist: change.newValue)
				}
			}
			.store(in: &cancellables)

		Defaults.publisher(.bringBrowsingModeToFront, options: [])
			.sink { [self] _ in
				for instance in desktopInstances {
					instance.window.isInteractive = instance.window.isInteractive
				}
			}
			.store(in: &cancellables)

		Defaults.publisher(.muteAudio, options: [])
			.receive(on: DispatchQueue.main)
			.sink { [self] _ in
				recreateWebViewAndReload()
			}
			.store(in: &cancellables)

		// Reconcile the desktop instances when displays are connected/disconnected while awake (relevant in "Show on all displays" mode, and to follow the main display if the chosen one is unplugged). Wake is handled by the `deviceDidWake` sink above, so we subscribe to screen-parameter changes only (not the merged `NSScreen.publisher`, which also fires on wake) to avoid a duplicate reconcile+reload. `updateDesktopInstances()` preserves unaffected displays, so this is cheap.
		SSEvents.screenParametersDidChange
			.sink { [self] in
				updateDesktopInstances()
			}
			.store(in: &cancellables)

		KeyboardShortcuts.onKeyUp(for: .toggleBrowsingMode) {
			Defaults[.isBrowsingMode].toggle()
		}

		KeyboardShortcuts.onKeyUp(for: .toggleEnabled) { [self] in
			isManuallyDisabled.toggle()
		}

		KeyboardShortcuts.onKeyUp(for: .reload) { [self] in
			reloadWebsite()
		}

		KeyboardShortcuts.onKeyUp(for: .nextWebsite) {
			WebsitesController.shared.makeNextCurrent()
		}

		KeyboardShortcuts.onKeyUp(for: .previousWebsite) {
			WebsitesController.shared.makePreviousCurrent()
		}

		KeyboardShortcuts.onKeyUp(for: .randomWebsite) {
			WebsitesController.shared.makeRandomCurrent()
		}
	}
}
