<div align="center">
	<img src="Stuff/icon.png" width="180" height="180">
	<h1>Webpaper</h1>
	<p>
		<b>Make any website your Mac desktop wallpaper</b>
	</p>
	<br>
	<br>
</div>

> [!NOTE]
> Webpaper is an open-source app derived from [Plash](https://sindresorhus.com/plash) by [Sindre Sorhus](https://sindresorhus.com), built on Plash's last open-source release (MIT-licensed) and extended with new features. It is an independent project — **not affiliated with or endorsed by** the original author. All credit for the original app goes to him; if you want his officially maintained version, get [Plash on the Mac App Store](https://apps.apple.com/app/id1494023538).

Webpaper is a **menu bar** (agent) app for people who want a live, highly dynamic Mac wallpaper: a news site, calendar, dashboard, photo-of-the-day, or a page you host yourself. It is a **source-only** community build — there is no App Store listing or release pipeline for this repo. You build it locally.

You can keep a list of websites, switch between them, and (optionally) show a **different website on each display**.

## Features

- Show a remote URL or a local site (a folder with `index.html`) as wallpaper
- Show it on one display, or on every display — with an optional website per display
- Interact with the website (“Browsing Mode”)
- Automatically reload at a custom interval
- Fade the wallpaper in the first time a display loads
- Invert website colors (never / always / when in dark mode)
- Per-website custom CSS and JavaScript (`await` is allowed at the top level)
- Force a site’s print styles (`@media print`)
- Allow a site’s self-signed TLS certificate
- Lower the opacity (browsing mode always uses full opacity)
- Transparent web-view background
- Keep the scroll position across same-page reloads
- Optionally skip reload on wake so the page state survives sleep
- Automatically deactivate while on battery
- Hide the wallpaper on lock screen
- Launch at login
- Mute page audio (on by default)
- Hide the menu bar icon (relaunch the app to reveal it for 5 seconds)
- Show on all Spaces, or only the Space that was active at launch
- Bring browsing mode in front of other windows
- Open cross-origin links in the default browser
- Global keyboard shortcuts
- [URL scheme](#scripting) and [Shortcuts / App Intents](#shortcuts)
- Share extension (share a web URL into Webpaper)
- Web Inspector (“Inspect Element”) in the browsing-mode context menu

Current marketing version: **2.16.0** (build **58**), from `Config.xcconfig`.

## Requirements

| | |
| --- | --- |
| OS | macOS **15.2** (Sequoia) or later |
| Machine | Apple Silicon for `./build.sh` (it always passes `arch=arm64`). Open the Xcode project to build for the host architecture. |
| Tools | Full **Xcode 16+** app (not only Command Line Tools). `build.sh` auto-detects Xcode; a no-op SwiftLint shim is used if `swiftlint` is missing. |
| Language | Swift **5.0** (`SWIFT_VERSION`) |
| Bundle IDs | `com.worldofz.Webpaper`, share extension `com.worldofz.Webpaper.ShareExtension` |
| Runtime | Sandboxed menu-bar app (`LSUIElement`), hardened runtime, network client + user-selected / Downloads file access |

Swift packages (resolved versions in `Webpaper.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved`):

| Package | Resolved |
| --- | --- |
| [Defaults](https://github.com/sindresorhus/Defaults) | 9.0.3 |
| [KeyboardShortcuts](https://github.com/sindresorhus/KeyboardShortcuts) | 2.3.0 |
| [LaunchAtLogin-Modern](https://github.com/sindresorhus/LaunchAtLogin-Modern) | 1.1.0 |
| [sentry-cocoa](https://github.com/getsentry/sentry-cocoa) | 8.49.1 (still linked; **crash reporting is not started** in this fork — the upstream DSN was removed so nothing is sent) |

`swift-syntax` 601.0.1 is pulled in transitively.

## Install and run

Clone and build with the repo script:

```sh
git clone https://github.com/Errr0rr404/Webpaper.git
cd Webpaper
./build.sh run        # Debug build, ad-hoc sign, launch
```

Other commands:

```sh
./build.sh            # Debug, code signing off — compile check
./build.sh release    # Release, code signing off
./build.sh clean      # delete ./.build-dd (or $DERIVED_DATA)
```

Debug/Release products land at:

```text
$DERIVED_DATA/Build/Products/<Debug|Release>/Webpaper.app
```

The default derived-data path is `./.build-dd` (gitignored).

From Xcode: open `Webpaper.xcodeproj`, scheme **Webpaper**, destination My Mac, Run. Automatic signing is configured in the project; use your own Apple Development team. The **Share Extension** scheme builds the `Share Extension.appex` that the app embeds.

## Test

There is **no test target** and no CI workflow. The Webpaper scheme’s Test action has an empty test list.

Practical checks:

1. `./build.sh` — compile Debug unsigned.
2. `./build.sh run` — launch and add a site from the menu bar.
3. Optional: install [SwiftLint](https://github.com/realm/SwiftLint) so the Xcode lint phase actually runs (`.swiftlint.yml`). Without it, the phase warns and continues.

## Deploy

This repo is **source-only**. There is no GitHub Actions workflow, notarization script, Sparkle feed, or App Store upload.

To put a build on this Mac:

1. Produce a **signed** app from Xcode (Product → Archive, or Run with your Development team). `./build.sh release` is unsigned and is not enough for a normal `/Applications` install of a sandboxed app.
2. Copy `Webpaper.app` to `/Applications`.
3. First launch may need a right-click → Open if Gatekeeper does not recognize the signature.

Do not commit signing identities, provisioning profiles, or DSNs.

## Environment variables

Names only — do not put secrets or machine-specific values in the repo.

| Name | Used by | Role |
| --- | --- | --- |
| `DEVELOPER_DIR` | `build.sh` | Xcode developer directory. If unset, the script uses `xcode-select -p` when it points at an Xcode.app, otherwise `/Applications/Xcode.app` or `/Applications/Xcode-beta.app`. |
| `DERIVED_DATA` | `build.sh` | `xcodebuild -derivedDataPath`. Defaults to `./.build-dd`. |

The app does not read API keys or DSNs at runtime. `SSApp.initSentry` exists but is never called.

## Repository layout

```text
Webpaper/                 macOS app (SwiftUI + AppKit + WKWebView)
  App.swift               @main, crash-reporting left disabled
  AppState.swift          menu-bar item, desktop instances, reload timer
  DesktopWindow.swift     per-display desktop window + fade-in
  WebViewController.swift WKWebView config, CSS/JS inject, downloads
  WebsitesController.swift website list and current / per-display mapping
  SettingsScreen.swift    General / Shortcuts / Advanced
  URLCommands.swift       webpaper: URL scheme
  Intents.swift           App Intents for Shortcuts
  Info.plist              URL scheme + ATS for web content
ShareExtension/           share a web URL → webpaper:add
Webpaper.xcodeproj/       Xcode project, schemes, Package.resolved
Config.xcconfig           MARKETING_VERSION / CURRENT_PROJECT_VERSION
build.sh                  command-line Debug/Release/run/clean
Stuff/icon.png            README artwork
.github/ISSUE_TEMPLATE/   bug report and feature request
license                   MIT (Plash + Webpaper contributors)
```

## Use-cases

- A calendar (Google Calendar, Outlook)
- Personal or team dashboards / stats
- A photo-of-the-day or random scenery page
- An animated page or GIF
- A custom page you build and host on [GitHub Pages](https://pages.github.com), [CodePen](https://codepen.io), etc.

## Tips

### Browsing mode

Enable “Browsing Mode” to interact with the website. Right-click to go back/forward, reload, zoom (the zoom level is saved per URL), or Inspect Element. You can pinch to magnify.

Webpaper injects a CSS class named `webpaper-is-browsing-mode` on the `<html>` element while browsing mode is active, so you can style for it.

If clicking a link opens a new window, hold <kbd>Option</kbd> while clicking to open it in the main Webpaper window.

### Local website

In the add/edit sheet, **Local Website…** picks a directory that contains `index.html`. Webpaper stores a security-scoped bookmark so the sandbox can read it again later.

### URL placeholders for screen size

Use `[[screenWidth]]` and `[[screenHeight]]` in any URL and Webpaper substitutes the values for **that display** (usable frame, excluding the menu bar). Example: `https://example.com/photo/[[screenWidth]]x[[screenHeight]]`.

### Scroll to a position

Put this in the website's “JavaScript” field to scroll on each load:

```js
window.scrollTo(0, 500);
```

Or scroll to an element:

```js
document.querySelector('.title')?.scrollIntoView();
```

Same-page reloads also restore `window.scrollY` from `sessionStorage` automatically.

### Occupy only half the screen

Use the “CSS” field:

```css
:root {
	margin-left: 50% !important;
}
```

### Detect Webpaper

Webpaper injects a CSS class named `is-webpaper-app` on the `<html>` element, so you can customize a page when it runs inside Webpaper.

### Per-website edit

Double-click a row in **Websites…** to invert colors, add CSS/JS, enable print styles, or allow a self-signed certificate.

## Scripting

Control Webpaper with anything that can open a custom-scheme URL (`CFBundleURLSchemes`: `webpaper`).

Reload the current website:

```console
$ open -g webpaper:reload
```

Use the `webpaper:command` form (not `webpaper://command`). The handler reads `URLComponents.path`.

### Commands

- `webpaper:add?url=<url>&title=<title>` — add a website (URL-encode the parameters). Local `file:` URLs are accepted by the parser but will not have a security-scoped bookmark; add local sites from the app instead.
- `webpaper:reload` — reload the current website (re-fetches the configured URL, including redirects)
- `webpaper:next` / `webpaper:previous` / `webpaper:random` — switch website
- `webpaper:toggle-browsing-mode` — toggle browsing mode

Example (Node.js):

```js
import {execFileSync} from 'node:child_process';

execFileSync('open', ['--background', 'webpaper:reload']);
```

The share extension builds the same `webpaper:add?url=` URL.

### Shortcuts

App Intents (Shortcuts app / App Intents API), implemented in `Webpaper/Intents.swift`:

- Add Website
- Remove Websites
- Set / Get Enabled State
- Get / Set Current Website
- Reload Website
- Switch to Next / Previous / Random Website
- Toggle Browsing Mode

## FAQ

#### Does it support multiple displays?

Yes. Enable “Show on all displays” in Settings → General to render on every connected display. Use **Website per display** to assign a specific site, or leave “Current website” to follow the menu bar selection.

#### The app does not show up in the menu bar

macOS hides menu bar apps when there is no space left (common on notched MacBooks). Quit other menu bar apps, or turn off **Hide menu bar icon** and relaunch Webpaper — the icon stays visible for 5 seconds after launch/reopen even when that setting is on.

#### Why does it use so much memory?

The app itself uses very little; the websites you display can use a lot, and some have memory leaks. Settings → Advanced → **Clear all website data** wipes cookies, caches, and thumbnails.

#### Can it block ads?

Not built-in, but you can block ads system-wide with a DNS ad-blocker.

#### Does it phone home?

Crash reporting is disabled. Feedback from the menu opens this GitHub issues page. The app needs outbound HTTPS to load the websites you configure.

## Built with

- [Defaults](https://github.com/sindresorhus/Defaults) — Swifty and modern `UserDefaults`
- [KeyboardShortcuts](https://github.com/sindresorhus/KeyboardShortcuts) — user-customizable global keyboard shortcuts
- [LaunchAtLogin](https://github.com/sindresorhus/LaunchAtLogin-Modern) — launch-at-login for sandboxed apps

## Credits & license

Webpaper is a derivative of [Plash](https://sindresorhus.com/plash) by [Sindre Sorhus](https://sindresorhus.com), used under the [MIT license](license). All credit for the original app goes to him. Webpaper and its additional features are likewise released under the MIT license.
