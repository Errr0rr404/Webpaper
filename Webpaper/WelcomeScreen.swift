import Cocoa

extension AppState {
	func showWelcomeScreenIfNeeded() {
		guard SSApp.isFirstLaunch else {
			return
		}

		SSApp.forceActivate()

		NSAlert.showModal(
			title: "Welcome to Webpaper",
			message:
				"""
				Webpaper lives in the menu bar. Click its icon, then choose “Add Website…” to put a page on the desktop.

				Use “Browsing Mode” to log in or interact with the page. Settings → General can show a different website on each display.

				Questions and bug reports go to the project’s GitHub issues, linked from More → Send Feedback…
				""",
			buttonTitles: [
				"Get Started"
			],
			defaultButtonIndex: -1
		)

		delay(.seconds(1)) { [self] in
			statusItemButton.performClick(nil)
		}
	}
}
