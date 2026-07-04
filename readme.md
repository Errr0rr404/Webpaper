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

Webpaper lets you have a highly dynamic desktop wallpaper. Display your favorite news site, a calendar, a dashboard, a random scenery photo, or even an animated page. You can add multiple websites and switch between them, and show a different one on each display.

## Features

- Show a remote or local website as your wallpaper
- **Show it on one display, or on every display — with a different website per display**
- Interact with the website (“Browsing Mode”)
- Automatically reload at a custom interval
- Fade the website in on load
- Invert website colors (fake dark mode)
- Add custom CSS and JavaScript per website
- Lower the opacity
- Transparent background support
- Keep the scroll position across reloads
- Optionally keep page state across sleep
- Automatically deactivate while on battery
- Global keyboard shortcuts
- [Scriptable](#scripting) via a URL scheme
- Share extension

## Install

Webpaper is open source. Build it yourself with a full **Xcode** install (16 or newer):

```sh
git clone https://github.com/Errr0rr404/Webpaper.git
cd Webpaper
./build.sh run        # build and launch
```

Other commands:

```sh
./build.sh            # build only (Debug)
./build.sh release    # build (Release)
./build.sh clean      # remove build artifacts
```

`build.sh` auto-detects your Xcode and shims SwiftLint when it isn't installed. To install into `/Applications`, produce a signed Release build and copy `Webpaper.app` over — the script header documents the exact steps.

Requires **macOS 15.2 (Sequoia) or later**.

## Use-cases

- A calendar (Google Calendar, Outlook)
- Personal or team dashboards / stats
- A photo-of-the-day or random scenery page
- An animated page or GIF
- A custom page you build and host on [GitHub Pages](https://pages.github.com), [CodePen](https://codepen.io), etc.

## Tips

### Browsing mode

Enable “Browsing Mode” to interact with the website. Right-click to go back/forward, reload, or zoom (the zoom level is saved). You can pinch to magnify.

Webpaper injects a CSS class named `webpaper-is-browsing-mode` on the `<html>` element while browsing mode is active, so you can style for it.

If clicking a link opens a new window, hold <kbd>Option</kbd> while clicking to open it in the main Webpaper window.

### URL placeholders for screen size

Use `[[screenWidth]]` and `[[screenHeight]]` in any URL and Webpaper substitutes the values for that display. Example: `https://example.com/photo/[[screenWidth]]x[[screenHeight]]`.

### Scroll to a position

Put this in the website's “JavaScript” field to scroll on each load:

```js
window.scrollTo(0, 500);
```

Or scroll to an element:

```js
document.querySelector('.title')?.scrollIntoView();
```

### Occupy only half the screen

Use the “CSS” field:

```css
:root {
	margin-left: 50% !important;
}
```

### Detect Webpaper

Webpaper injects a CSS class named `is-webpaper-app` on the `<html>` element, so you can customize a page when it runs inside Webpaper.

## Scripting

Control Webpaper with anything that can open a custom-scheme URL.

Reload the current website:

```console
$ open -g webpaper:reload
```

### Commands

- `webpaper:add?url=<url>&title=<title>` — add a website (URL-encode the parameters; local file URLs are not supported)
- `webpaper:reload` — reload the current website
- `webpaper:next` / `webpaper:previous` / `webpaper:random` — switch website
- `webpaper:toggle-browsing-mode` — toggle browsing mode

Example (Node.js):

```js
import {execFileSync} from 'node:child_process';

execFileSync('open', ['--background', 'webpaper:reload']);
```

## FAQ

#### Does it support multiple displays?

Yes. Enable “Show on all displays” in the settings to render the website on every connected display. You can also assign each display its own website from the “Website per display” section.

#### The app does not show up in the menu bar

macOS hides menu bar apps when there's no space left (common on notched MacBooks). Free up space by quitting some menu bar apps.

#### Why does it use so much memory?

The app itself uses very little; the websites you display can use a lot, and some have memory leaks.

#### Can it block ads?

Not built-in, but you can block ads system-wide with a DNS ad-blocker.

## Built with

- [Defaults](https://github.com/sindresorhus/Defaults) — Swifty and modern `UserDefaults`
- [KeyboardShortcuts](https://github.com/sindresorhus/KeyboardShortcuts) — user-customizable global keyboard shortcuts
- [LaunchAtLogin](https://github.com/sindresorhus/LaunchAtLogin-Modern) — launch-at-login for sandboxed apps

## Credits & license

Webpaper is a derivative of [Plash](https://sindresorhus.com/plash) by [Sindre Sorhus](https://sindresorhus.com), used under the [MIT license](license). All credit for the original app goes to him. Webpaper and its additional features are likewise released under the MIT license.
