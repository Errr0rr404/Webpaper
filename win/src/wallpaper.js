const { BrowserWindow, session, nativeTheme, shell } = require('electron');
const { applyPlaceholders } = require('./logic');
const desktop = require('./attach');

function physicalBounds(display) {
	const scale = display.scaleFactor || 1;
	const bounds = display.bounds;
	return {
		x: Math.round(bounds.x * scale),
		y: Math.round(bounds.y * scale),
		width: Math.round(bounds.width * scale),
		height: Math.round(bounds.height * scale)
	};
}

function pageCss(website, browsing, dark) {
	const parts = [];
	const invert = website.invertColors === 'always'
		|| (website.invertColors === 'dark' && dark);
	if (invert) {
		parts.push('html { filter: invert(1) hue-rotate(180deg); } img, video, picture, canvas { filter: invert(1) hue-rotate(180deg); }');
	}
	if (website.transparentBackground) {
		parts.push('html, body { background: transparent !important; }');
	}
	if (website.css) {
		parts.push(website.css);
	}
	return parts.join('\n');
}

function pageScript(website, browsing, runCustom) {
	const custom = JSON.stringify(runCustom ? website.javaScript || '' : '');
	return `(async () => {
		document.documentElement.classList.add('is-webpaper-app');
		document.documentElement.classList.toggle('webpaper-is-browsing-mode', ${browsing ? 'true' : 'false'});
		const custom = ${custom};
		if (!custom) return;
		const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
		await new AsyncFunction(custom)();
	})().catch((error) => console.error(error))`;
}

function createWallpaperController({ getSnapshot, onError }) {
	const windows = new Map();
	const partition = 'persist:webpaper';
	let hooked = false;

	function siteFor(display, snapshot) {
		const { state } = snapshot;
		const websites = state.websites;
		const override = state.settings.displayWebsites[String(display.id)];
		const id = override || state.settings.currentId;
		return websites.find((site) => site.id === id) || null;
	}

	function targetDisplays(snapshot) {
		const { displays, state } = snapshot;
		if (!displays.length) {
			return [];
		}
		if (state.settings.showOnAllDisplays) {
			return displays;
		}
		const chosen = displays.find((display) => String(display.id) === String(state.settings.displayId));
		return [chosen || displays.find((display) => display.primary) || displays[0]];
	}

	function shouldShow(snapshot) {
		if (process.platform !== 'win32') {
			return false;
		}
		if (!snapshot.state.settings.enabled) {
			return false;
		}
		if (snapshot.onBattery && snapshot.state.settings.deactivateOnBattery) {
			return false;
		}
		return snapshot.state.websites.length > 0;
	}

	function ensureSession() {
		if (hooked) {
			return session.fromPartition(partition);
		}
		hooked = true;
		const ses = session.fromPartition(partition);
		ses.setPermissionRequestHandler((_contents, _permission, callback) => {
			callback(false);
		});
		ses.setCertificateVerifyProc((request, callback) => {
			const snapshot = getSnapshot();
			const host = request.hostname;
			const allowed = snapshot.state.websites.some((site) => {
				if (!site.allowSelfSignedCertificate) {
					return false;
				}
				try {
					return new URL(site.url).hostname === host;
				} catch {
					return false;
				}
			});
			callback(allowed ? 0 : -3);
		});
		return ses;
	}

	function createWindow(display) {
		const win = new BrowserWindow({
			x: display.bounds.x,
			y: display.bounds.y,
			width: display.bounds.width,
			height: display.bounds.height,
			frame: false,
			transparent: true,
			show: false,
			skipTaskbar: true,
			focusable: false,
			movable: false,
			resizable: false,
			hasShadow: false,
			enableLargerThanScreen: true,
			thickFrame: false,
			backgroundColor: '#00000000',
			webPreferences: {
				sandbox: true,
				contextIsolation: true,
				nodeIntegration: false,
				backgroundThrottling: false,
				partition
			}
		});
		win.setMenuBarVisibility(false);
		win.webContents.setWindowOpenHandler(({ url }) => {
			if (getSnapshot().state.settings.openExternalLinksInBrowser) {
				shell.openExternal(url);
				return { action: 'deny' };
			}
			return { action: 'allow' };
		});
		win.on('closed', () => windows.delete(String(display.id)));
		return win;
	}

	async function loadSite(win, display, website) {
		const width = display.workArea?.width || display.bounds.width;
		const height = display.workArea?.height || display.bounds.height;
		const url = applyPlaceholders(website.url, width, height);
		if (win.__url === url) {
			return;
		}
		win.__url = url;
		win.__cssKey = '';
		await win.loadURL(url).catch((error) => {
			win.__url = '';
			onError(error.message || 'Could not load the website.');
		});
	}

	async function tweak(win, website, browsing, runCustom) {
		if (win.isDestroyed() || win.webContents.isLoading()) {
			return;
		}
		const css = pageCss(website, browsing, nativeTheme.shouldUseDarkColors);
		if (win.__cssKey !== css) {
			if (win.__cssHandle) {
				await win.webContents.removeInsertedCSS(win.__cssHandle).catch(() => {});
			}
			win.__cssHandle = await win.webContents.insertCSS(css).catch(() => null);
			win.__cssKey = css;
		}
		await win.webContents.executeJavaScript(pageScript(website, browsing, runCustom)).catch(() => {});
		if (website.usePrintStyles !== win.__print) {
			win.__print = website.usePrintStyles;
			try {
				if (!win.webContents.debugger.isAttached()) {
					win.webContents.debugger.attach('1.3');
				}
				await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
					media: website.usePrintStyles ? 'print' : ''
				});
			} catch {
				// Print styles are optional. A failed debugger attach should not take the page down.
			}
		}
	}

	async function place(win, display, browsing, bringToFront) {
		if (win.isDestroyed()) {
			return;
		}
		const key = `${display.bounds.x},${display.bounds.y},${display.bounds.width},${display.bounds.height},${browsing},${bringToFront}`;
		if (win.__place === key) {
			return;
		}
		win.__place = key;
		win.setBounds(display.bounds);
		const interactive = browsing;
		win.setIgnoreMouseEvents(!interactive, { forward: true });
		win.setFocusable(interactive);
		if (!interactive) {
			win.setAlwaysOnTop(false);
			try {
				await desktop.attach(win, physicalBounds(display));
			} catch (error) {
				win.__place = '';
				onError(error.message || 'Could not attach to the desktop.');
			}
			return;
		}

		try {
			await desktop.detach(win);
		} catch {
			// Already detached is fine.
		}
		win.setAlwaysOnTop(Boolean(bringToFront));
	}

	async function sync() {
		ensureSession();
		const snapshot = getSnapshot();
		if (!shouldShow(snapshot)) {
			for (const win of windows.values()) {
				if (!win.isDestroyed()) {
					win.destroy();
				}
			}
			windows.clear();
			return;
		}

		const wanted = new Set(targetDisplays(snapshot).map((display) => String(display.id)));
		for (const [id, win] of windows) {
			if (!wanted.has(id) && !win.isDestroyed()) {
				win.destroy();
				windows.delete(id);
			}
		}

		const browsing = snapshot.state.settings.browsingMode;
		const opacity = browsing ? 1 : snapshot.state.settings.opacity;

		for (const display of targetDisplays(snapshot)) {
			const id = String(display.id);
			const website = siteFor(display, snapshot);
			if (!website) {
				const existing = windows.get(id);
				if (existing && !existing.isDestroyed()) {
					existing.destroy();
				}
				windows.delete(id);
				continue;
			}

			let win = windows.get(id);
			if (!win || win.isDestroyed()) {
				win = createWindow(display);
				windows.set(id, win);
				win.webContents.on('did-finish-load', () => {
					const fresh = getSnapshot();
					const current = siteFor(display, fresh);
					if (current) {
						tweak(win, current, fresh.state.settings.browsingMode, true);
					}
				});
				win.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
					if (isMainFrame && code !== -3) {
						onError(description || 'Could not load the website.');
					}
				});
				win.once('ready-to-show', () => {
					if (!win.isDestroyed()) {
						win.show();
					}
				});
			}

			win.webContents.setAudioMuted(snapshot.state.settings.muteAudio);
			win.setOpacity(opacity);
			await loadSite(win, display, website);
			await tweak(win, website, browsing, false);
			await place(win, display, browsing, snapshot.state.settings.bringBrowsingModeToFront);
		}
	}

	function reload() {
		for (const win of windows.values()) {
			if (!win.isDestroyed()) {
				win.webContents.reload();
			}
		}
	}

	function close() {
		for (const win of windows.values()) {
			if (!win.isDestroyed()) {
				win.destroy();
			}
		}
		windows.clear();
	}

	return { sync, reload, close };
}

module.exports = { createWallpaperController };
