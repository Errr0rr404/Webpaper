const { app, BrowserWindow, ipcMain, dialog, globalShortcut, powerMonitor, screen, nativeTheme, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const store = require('./store');
const {
	SHORTCUT_NAMES,
	createWebsite,
	menuTitle,
	normalizeUrl,
	parseCommand,
	pickNext,
	pickRandom
} = require('./logic');
const { createWallpaperController } = require('./wallpaper');
const { createTrayController, defaultIconPath } = require('./tray');

app.setName('Webpaper');
app.setAppUserModelId('com.worldofz.Webpaper');

if (process.env.WEBPAPER_USER_DATA) {
	app.setPath('userData', process.env.WEBPAPER_USER_DATA);
} else {
	app.setPath('userData', path.join(app.getPath('appData'), 'Webpaper-Windows'));
}
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
	app.quit();
	process.exit(0);
}

let state;
let runtime = { error: null, onBattery: false };
let manager = null;
let preview = null;
let quitting = false;
let trayGrace = false;
let reloadTimer = null;
let wallpaper;
let tray;

const storeFile = () => path.join(app.getPath('userData'), 'state.json');

function publicState() {
	return {
		...state,
		runtime,
		displays: screen.getAllDisplays().map((display) => ({
			id: String(display.id),
			label: display.label || `Display ${display.id}`,
			primary: display.id === screen.getPrimaryDisplay().id,
			bounds: display.bounds,
			workArea: display.workArea
		})),
		version: app.getVersion(),
		platform: process.platform
	};
}

function broadcast() {
	const payload = publicState();
	for (const win of BrowserWindow.getAllWindows()) {
		if (!win.isDestroyed()) {
			win.webContents.send('state', payload);
		}
	}
	tray?.refresh();
}

function persist() {
	store.save(storeFile(), state);
}

function snapshot() {
	const displays = screen.getAllDisplays();
	const primaryId = screen.getPrimaryDisplay().id;
	return {
		state,
		displays: displays.map((display) => ({ ...display, primary: display.id === primaryId })),
		onBattery: runtime.onBattery
	};
}

function applyLoginItem() {
	if (process.platform !== 'win32') {
		return;
	}
	app.setLoginItemSettings({
		openAtLogin: Boolean(state.settings.launchAtLogin),
		args: process.defaultApp ? [path.resolve(process.argv[1])] : []
	});
}

function applyShortcuts() {
	globalShortcut.unregisterAll();
	const map = {
		toggleEnabled: () => dispatch({ type: 'toggle-enabled' }),
		toggleBrowsingMode: () => dispatch({ type: 'toggle-browsing' }),
		reload: () => dispatch({ type: 'reload' }),
		next: () => dispatch({ type: 'next' }),
		previous: () => dispatch({ type: 'previous' }),
		random: () => dispatch({ type: 'random' })
	};
	for (const name of SHORTCUT_NAMES) {
		const accelerator = state.settings.shortcuts[name];
		if (!accelerator) {
			continue;
		}
		try {
			globalShortcut.register(accelerator, map[name]);
		} catch {
			// Ignore accelerators Electron does not understand.
		}
	}
}

function applyReloadTimer() {
	clearInterval(reloadTimer);
	reloadTimer = null;
	const minutes = Number(state.settings.reloadIntervalMinutes);
	if (!minutes || minutes <= 0) {
		return;
	}
	reloadTimer = setInterval(() => {
		if (state.settings.enabled) {
			wallpaper.reload();
		}
	}, minutes * 60 * 1000);
}

function showManager({ focusAdd = false, tab = 'sites' } = {}) {
	if (!manager || manager.isDestroyed()) {
		createManager();
	}
	manager.show();
	manager.focus();
	manager.webContents.send('show', { focusAdd, tab });
}

function createManager() {
	manager = new BrowserWindow({
		width: 880,
		height: 640,
		minWidth: 720,
		minHeight: 520,
		show: false,
		title: 'Webpaper',
		backgroundColor: '#f6f1ea',
		icon: path.join(__dirname, '..', 'assets', 'icon.png'),
		autoHideMenuBar: true,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true
		}
	});
	manager.setMenuBarVisibility(false);
	manager.on('close', (event) => {
		if (!quitting) {
			event.preventDefault();
			manager.hide();
		}
	});
	manager.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
	manager.once('ready-to-show', () => manager.show());
}

function openPreview(site) {
	if (!site) {
		return;
	}
	if (preview && !preview.isDestroyed()) {
		preview.close();
	}
	preview = new BrowserWindow({
		width: 960,
		height: 600,
		title: `Preview — ${menuTitle(site)}`,
		backgroundColor: '#111111',
		autoHideMenuBar: true,
		webPreferences: {
			sandbox: true,
			contextIsolation: true,
			nodeIntegration: false
		}
	});
	preview.setMenuBarVisibility(false);
	preview.loadURL(site.url).catch(() => {});
}

const pendingCommands = [];

function handleCommand(raw) {
	if (!state) {
		pendingCommands.push(raw);
		return;
	}
	const parsed = parseCommand(raw);
	if (!parsed) {
		return;
	}
	if (parsed.command === 'reload') {
		dispatch({ type: 'reload' });
	} else if (parsed.command === 'next') {
		dispatch({ type: 'next' });
	} else if (parsed.command === 'previous') {
		dispatch({ type: 'previous' });
	} else if (parsed.command === 'random') {
		dispatch({ type: 'random' });
	} else if (parsed.command === 'toggle-browsing-mode') {
		dispatch({ type: 'toggle-browsing' });
	} else if (parsed.command === 'add' && parsed.params.url) {
		dispatch({ type: 'add', url: parsed.params.url, title: parsed.params.title || '' });
	}
}

function dispatch(action) {
	const ids = () => state.websites.map((site) => site.id);
	if (action.type === 'add') {
		const site = createWebsite({ url: action.url, title: action.title });
		if (!site) {
			return { ok: false, error: 'Enter a valid website address.', state: publicState() };
		}
		state.websites.push(site);
		state.settings.currentId = site.id;
	} else if (action.type === 'update') {
		const patch = { ...action.patch };
		delete patch.id;
		if (Object.prototype.hasOwnProperty.call(patch, 'url')) {
			const normalized = normalizeUrl(patch.url);
			if (!normalized) {
				return { ok: false, error: 'Enter a valid website address.', state: publicState() };
			}
			patch.url = normalized;
		}
		state.websites = state.websites.map((site) => (
			site.id === action.id ? { ...site, ...patch, id: site.id } : site
		));
	} else if (action.type === 'remove') {
		state.websites = state.websites.filter((site) => site.id !== action.id);
		if (state.settings.currentId === action.id) {
			state.settings.currentId = state.websites[0]?.id ?? null;
		}
		for (const [displayId, websiteId] of Object.entries(state.settings.displayWebsites)) {
			if (websiteId === action.id) {
				delete state.settings.displayWebsites[displayId];
			}
		}
	} else if (action.type === 'set-current') {
		if (state.websites.some((site) => site.id === action.id)) {
			state.settings.currentId = action.id;
		}
	} else if (action.type === 'set-setting') {
		let value = action.value;
		if (action.key === 'opacity') {
			value = Math.min(1, Math.max(0.1, Number(value) || 1));
		}
		state.settings = { ...state.settings, [action.key]: value };
	} else if (action.type === 'set-display-website') {
		if (action.websiteId) {
			state.settings.displayWebsites[action.displayId] = action.websiteId;
		} else {
			delete state.settings.displayWebsites[action.displayId];
		}
	} else if (action.type === 'toggle-enabled') {
		state.settings.enabled = !state.settings.enabled;
	} else if (action.type === 'toggle-browsing') {
		state.settings.browsingMode = !state.settings.browsingMode;
	} else if (action.type === 'next') {
		state.settings.currentId = pickNext(ids(), state.settings.currentId, 1);
	} else if (action.type === 'previous') {
		state.settings.currentId = pickNext(ids(), state.settings.currentId, -1);
	} else if (action.type === 'random') {
		state.settings.currentId = pickRandom(ids(), state.settings.currentId);
	} else if (action.type === 'clear-data') {
		const { session } = require('electron');
		session.fromPartition('persist:webpaper').clearStorageData();
	}

	runtime.error = null;
	persist();
	applyLoginItem();
	applyShortcuts();
	if (action.type === 'set-setting' && action.key === 'reloadIntervalMinutes') {
		applyReloadTimer();
	}
	applyTray();
	broadcast();
	wallpaper.sync();
	if (action.type === 'reload' || action.type === 'clear-data') {
		wallpaper.reload();
	}
	return { ok: true, state: publicState() };
}

function refreshBattery() {
	runtime.onBattery = powerMonitor.isOnBatteryPower();
	broadcast();
	wallpaper.sync();
}

function applyTray() {
	if (state.settings.hideTrayIcon && !trayGrace) {
		tray.hide();
	} else {
		tray.show();
	}
}

async function pickLocalFolder() {
	const parent = manager && !manager.isDestroyed() ? manager : undefined;
	const result = await dialog.showOpenDialog(parent, {
		title: 'Choose a folder with index.html',
		properties: ['openDirectory']
	});
	if (result.canceled || !result.filePaths[0]) {
		return { ok: false, state: publicState() };
	}
	const index = path.join(result.filePaths[0], 'index.html');
	if (!fs.existsSync(index)) {
		return { ok: false, error: 'That folder has no index.html.', state: publicState() };
	}
	return dispatch({ type: 'add', url: pathToFileURL(index).href, title: path.basename(result.filePaths[0]) });
}

async function runSmoke() {
	const deadline = Date.now() + 15000;
	while ((!manager || manager.webContents.isLoading()) && Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	await manager.webContents.executeJavaScript(`
		document.querySelector('#url').value = 'https://example.com';
		document.querySelector('#title').value = 'Example';
		document.querySelector('#add-form').requestSubmit();
	`);
	let body = '';
	const until = Date.now() + 5000;
	while (Date.now() < until) {
		body = await manager.webContents.executeJavaScript('document.body.innerText');
		if (body.includes('Example')) {
			break;
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	if (!body.includes('Example')) {
		console.error('SMOKE_FAIL', body);
		app.exit(1);
		return;
	}
	const shot = process.env.WEBPAPER_SHOT || path.join(app.getPath('temp'), 'webpaper-win-ui.png');
	fs.writeFileSync(shot, (await manager.capturePage()).toPNG());
	await manager.webContents.executeJavaScript(`document.querySelector('[data-tab="settings"]').click()`);
	await new Promise((resolve) => setTimeout(resolve, 200));
	const settingsShot = shot.replace(/\.png$/, '-settings.png');
	fs.writeFileSync(settingsShot, (await manager.capturePage()).toPNG());
	console.log('SMOKE_OK', shot);
	quitting = true;
	app.exit(0);
}

app.on('second-instance', (_event, argv) => {
	const command = argv.find((arg) => /^webpaper:/i.test(arg));
	if (command) {
		handleCommand(command);
	}
	if (state.settings.hideTrayIcon) {
		trayGrace = true;
		applyTray();
		setTimeout(() => {
			trayGrace = false;
			applyTray();
		}, 5000);
	}
	showManager();
});

if (process.defaultApp) {
	if (process.argv.length >= 2) {
		app.setAsDefaultProtocolClient('webpaper', process.execPath, [path.resolve(process.argv[1])]);
	}
} else {
	app.setAsDefaultProtocolClient('webpaper');
}

app.on('open-url', (event, url) => {
	event.preventDefault();
	handleCommand(url);
});

app.whenReady().then(() => {
	state = store.load(storeFile());
	runtime.onBattery = powerMonitor.isOnBatteryPower();
	wallpaper = createWallpaperController({
		getSnapshot: snapshot,
		onError: (message) => {
			runtime.error = message;
			broadcast();
		}
	});
	tray = createTrayController({
		iconPath: defaultIconPath(),
		getSnapshot: () => ({ state }),
		actions: {
			toggleEnabled: () => dispatch({ type: 'toggle-enabled' }),
			toggleBrowsing: () => dispatch({ type: 'toggle-browsing' }),
			reload: () => dispatch({ type: 'reload' }),
			next: () => dispatch({ type: 'next' }),
			previous: () => dispatch({ type: 'previous' }),
			random: () => dispatch({ type: 'random' }),
			setCurrent: (id) => dispatch({ type: 'set-current', id }),
			show: showManager,
			quit: () => {
				quitting = true;
				app.quit();
			}
		}
	});

	ipcMain.handle('get-state', () => publicState());
	ipcMain.handle('action', async (_event, action) => {
		if (action?.type === 'pick-local') {
			return pickLocalFolder();
		}
		if (action?.type === 'preview') {
			const site = state.websites.find((item) => item.id === (action.id || state.settings.currentId));
			openPreview(site);
			return { ok: Boolean(site), error: site ? null : 'Add a website first.', state: publicState() };
		}
		if (action?.type === 'open-external') {
			await shell.openExternal(action.url);
			return { ok: true, state: publicState() };
		}
		return dispatch(action);
	});

	createManager();
	applyTray();
	applyLoginItem();
	applyShortcuts();
	applyReloadTimer();
	wallpaper.sync();

	powerMonitor.on('on-battery', refreshBattery);
	powerMonitor.on('on-ac', refreshBattery);
	powerMonitor.on('resume', () => {
		if (state.settings.reloadOnWake) {
			dispatch({ type: 'reload' });
		}
	});
	screen.on('display-added', () => wallpaper.sync());
	screen.on('display-removed', () => wallpaper.sync());
	screen.on('display-metrics-changed', () => wallpaper.sync());
	nativeTheme.on('updated', () => wallpaper.sync());

	const launched = process.argv.find((arg) => /^webpaper:/i.test(arg));
	if (launched) {
		handleCommand(launched);
	}
	for (const command of pendingCommands.splice(0)) {
		handleCommand(command);
	}
	if (process.env.WEBPAPER_SMOKE === '1') {
		runSmoke().catch((error) => {
			console.error('SMOKE_FAIL', error);
			app.exit(1);
		});
	}
});

app.on('window-all-closed', () => {
	// The tray keeps Webpaper running after the window is closed.
});

app.on('before-quit', () => {
	quitting = true;
	globalShortcut.unregisterAll();
	wallpaper?.close();
});
