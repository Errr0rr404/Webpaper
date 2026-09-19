const { Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const { menuTitle } = require('./logic');

function createTrayController({ iconPath, getSnapshot, actions }) {
	let tray = null;

	function buildMenu() {
		const { state } = getSnapshot();
		const current = state.websites.find((site) => site.id === state.settings.currentId) || null;
		const items = [];

		items.push({
			label: state.settings.enabled ? 'Disable' : 'Enable',
			click: () => actions.toggleEnabled()
		});
		items.push({ type: 'separator' });

		if (state.settings.enabled) {
			if (current) {
				items.push({ label: menuTitle(current), enabled: false });
				items.push({ type: 'separator' });
				items.push({ label: 'Reload', click: () => actions.reload() });
				items.push({
					label: 'Browsing Mode',
					type: 'checkbox',
					checked: state.settings.browsingMode,
					click: () => actions.toggleBrowsing()
				});
			}

			if (state.websites.length > 1) {
				items.push({ label: 'Next', click: () => actions.next() });
				items.push({ label: 'Previous', click: () => actions.previous() });
				items.push({ label: 'Random', click: () => actions.random() });
				items.push({
					label: 'Switch',
					submenu: state.websites.map((site) => ({
						label: menuTitle(site),
						type: 'checkbox',
						checked: site.id === state.settings.currentId,
						click: () => actions.setCurrent(site.id)
					}))
				});
			}

			items.push({ type: 'separator' });
			items.push({ label: 'Add Website…', click: () => actions.show({ focusAdd: true }) });
			items.push({ label: 'Websites…', click: () => actions.show() });
		} else if (state.settings.deactivateOnBattery) {
			items.push({ label: 'Deactivated while on battery', enabled: false });
		}

		items.push({ type: 'separator' });
		items.push({ label: 'Settings…', click: () => actions.show({ tab: 'settings' }) });
		items.push({
			label: 'More',
			submenu: [
				{
					label: 'Send Feedback…',
					click: () => shell.openExternal('https://github.com/Errr0rr404/Webpaper/issues')
				},
				{
					label: 'Source Code',
					click: () => shell.openExternal('https://github.com/Errr0rr404/Webpaper')
				}
			]
		});
		items.push({ type: 'separator' });
		items.push({ label: 'Quit Webpaper', click: () => actions.quit() });
		return Menu.buildFromTemplate(items);
	}

	function refresh() {
		if (!tray) {
			return;
		}
		tray.setContextMenu(buildMenu());
		const { state } = getSnapshot();
		const current = state.websites.find((site) => site.id === state.settings.currentId);
		tray.setToolTip(current ? `Webpaper — ${menuTitle(current)}` : 'Webpaper');
	}

	function show() {
		if (tray) {
			refresh();
			return;
		}
		const image = nativeImage.createFromPath(iconPath);
		tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image.resize({ width: 16, height: 16 }));
		tray.on('click', () => actions.show());
		refresh();
	}

	function hide() {
		if (!tray) {
			return;
		}
		tray.destroy();
		tray = null;
	}

	return { show, hide, refresh, get tray() { return tray; } };
}

function defaultIconPath() {
	return path.join(__dirname, '..', 'assets', 'tray.png');
}

module.exports = { createTrayController, defaultIconPath };
