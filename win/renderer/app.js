const $ = (selector) => document.querySelector(selector);

let latest = null;
let selectedId = null;
let recording = null;
const saveTimers = new Map();

const SHORTCUTS = [
	['toggleEnabled', 'Toggle enabled'],
	['toggleBrowsingMode', 'Toggle browsing mode'],
	['reload', 'Reload'],
	['next', 'Next website'],
	['previous', 'Previous website'],
	['random', 'Random website']
];

function text(value) {
	return value == null ? '' : String(value);
}

function siteTitle(site) {
	return site.title?.trim() || site.url;
}

function showError(message) {
	const node = $('#form-error');
	node.hidden = !message;
	node.textContent = message || '';
}

async function act(payload) {
	const result = await window.webpaper.action(payload);
	if (!result.ok && result.error && payload.type === 'add') {
		showError(result.error);
	} else if (result.ok && payload.type === 'add') {
		showError('');
		$('#url').value = '';
		$('#title').value = '';
		selectedId = result.state.settings.currentId;
	}
	return result;
}

function renderStatus() {
	const { settings, runtime, platform } = latest;
	if (runtime.error) {
		$('#status').textContent = runtime.error;
		return;
	}
	if (!settings.enabled && settings.deactivateOnBattery && runtime.onBattery) {
		$('#status').textContent = 'Paused while this PC is on battery.';
		return;
	}
	if (!settings.enabled) {
		$('#status').textContent = 'Webpaper is off.';
		return;
	}
	if (settings.browsingMode) {
		$('#status').textContent = 'Browsing mode is on. You can click the page.';
		return;
	}
	$('#status').textContent = platform === 'win32'
		? 'The current page stays behind your desktop icons.'
		: 'Desktop pinning runs on Windows. Preview opens the page in a window here.';
}

function renderList() {
	const list = $('#site-list');
	list.replaceChildren();
	if (!latest.websites.length) {
		const item = document.createElement('li');
		item.className = 'empty';
		item.textContent = 'No websites yet.';
		list.append(item);
		return;
	}

	for (const site of latest.websites) {
		const item = document.createElement('li');
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'site';
		if (site.id === selectedId) button.classList.add('selected');
		if (site.id === latest.settings.currentId) button.classList.add('current');
		const name = document.createElement('strong');
		name.textContent = siteTitle(site);
		const url = document.createElement('small');
		url.textContent = site.url;
		button.append(name, url);
		button.addEventListener('click', () => {
			selectedId = site.id;
			renderList();
			renderEditor();
		});
		item.append(button);
		list.append(item);
	}
}

function field(labelText, control) {
	const label = document.createElement('label');
	label.append(document.createTextNode(labelText), control);
	return label;
}

function setValue(input, value) {
	if (document.activeElement !== input) {
		input.value = value;
	}
}

function renderEditor() {
	const editor = $('#editor');
	const site = latest.websites.find((item) => item.id === selectedId);
	if (!site) {
		editor.replaceChildren();
		const empty = document.createElement('p');
		empty.className = 'empty';
		empty.textContent = 'Add a page — a calendar, a dashboard, a photo of the day — and it stays behind your windows.';
		editor.append(empty);
		return;
	}

	if (editor.dataset.site === site.id && editor.contains(document.activeElement)) {
		return;
	}
	editor.dataset.site = site.id;
	editor.replaceChildren();

	const title = document.createElement('input');
	title.value = site.title || '';
	const url = document.createElement('input');
	url.value = site.url;
	const css = document.createElement('textarea');
	css.value = site.css || '';
	const javaScript = document.createElement('textarea');
	javaScript.value = site.javaScript || '';
	const invert = document.createElement('select');
	for (const [value, name] of [['never', 'Never'], ['always', 'Always'], ['dark', 'In dark mode']]) {
		const option = document.createElement('option');
		option.value = value;
		option.textContent = name;
		invert.append(option);
	}
	invert.value = site.invertColors || 'never';

	const bindText = (input, key) => {
		input.addEventListener('input', () => {
			clearTimeout(saveTimers.get(key));
			saveTimers.set(key, setTimeout(() => {
				act({ type: 'update', id: site.id, patch: { [key]: input.value } });
			}, 350));
		});
	};
	bindText(title, 'title');
	bindText(url, 'url');
	bindText(css, 'css');
	bindText(javaScript, 'javaScript');
	invert.addEventListener('change', () => act({ type: 'update', id: site.id, patch: { invertColors: invert.value } }));

	const checks = [
		['usePrintStyles', 'Use print styles'],
		['allowSelfSignedCertificate', 'Allow self-signed certificate'],
		['transparentBackground', 'Transparent page background']
	].map(([key, name]) => {
		const input = document.createElement('input');
		input.type = 'checkbox';
		input.checked = Boolean(site[key]);
		input.addEventListener('change', () => act({ type: 'update', id: site.id, patch: { [key]: input.checked } }));
		const label = document.createElement('label');
		label.className = 'switch';
		const span = document.createElement('span');
		span.textContent = name;
		label.append(input, span);
		return label;
	});

	const show = document.createElement('button');
	show.type = 'button';
	show.textContent = 'Show this site';
	show.addEventListener('click', () => act({ type: 'set-current', id: site.id }));

	const remove = document.createElement('button');
	remove.type = 'button';
	remove.className = 'danger';
	remove.textContent = 'Remove';
	remove.addEventListener('click', () => act({ type: 'remove', id: site.id }));

	const actions = document.createElement('div');
	actions.className = 'row';
	actions.append(show, remove);

	editor.append(
		field('Title', title),
		field('Address', url),
		field('Custom CSS', css),
		field('Custom JavaScript', javaScript),
		field('Invert colors', invert),
		...checks,
		actions
	);
	setValue(title, site.title || '');
}

function checkRow(key, label) {
	const row = document.createElement('label');
	row.className = 'setting';
	const span = document.createElement('span');
	span.textContent = label;
	const input = document.createElement('input');
	input.type = 'checkbox';
	input.checked = Boolean(latest.settings[key]);
	input.addEventListener('change', () => act({ type: 'set-setting', key, value: input.checked }));
	row.append(span, input);
	return row;
}

function renderSettings() {
	const root = $('#settings');
	if (!recording && root.contains(document.activeElement)) {
		return;
	}
	root.replaceChildren();

	root.append(checkRow('launchAtLogin', 'Launch at login'));
	root.append(checkRow('showOnAllDisplays', 'Show on all displays'));
	root.append(checkRow('deactivateOnBattery', 'Deactivate while on battery'));
	root.append(checkRow('muteAudio', 'Mute audio'));
	root.append(checkRow('reloadOnWake', 'Reload when the computer wakes'));
	root.append(checkRow('bringBrowsingModeToFront', 'Bring browsing mode to the front'));
	root.append(checkRow('openExternalLinksInBrowser', 'Open external links in the default browser'));
	root.append(checkRow('hideTrayIcon', 'Hide tray icon'));

	const opacity = document.createElement('input');
	opacity.type = 'range';
	opacity.min = '0.1';
	opacity.max = '1';
	opacity.step = '0.1';
	opacity.value = String(latest.settings.opacity);
	opacity.addEventListener('input', () => act({ type: 'set-setting', key: 'opacity', value: Number(opacity.value) }));
	root.append(field('Opacity', opacity));

	const reloadRow = document.createElement('label');
	reloadRow.className = 'setting';
	const reloadLabel = document.createElement('span');
	reloadLabel.textContent = 'Reload every (minutes)';
	const reload = document.createElement('input');
	reload.type = 'number';
	reload.min = '0.1';
	reload.step = '1';
	reload.placeholder = 'Off';
	reload.value = latest.settings.reloadIntervalMinutes ?? '';
	reload.addEventListener('change', () => {
		const value = reload.value.trim();
		act({ type: 'set-setting', key: 'reloadIntervalMinutes', value: value ? Number(value) : null });
	});
	reloadRow.append(reloadLabel, reload);
	root.append(reloadRow);

	if (!latest.settings.showOnAllDisplays) {
		const select = document.createElement('select');
		for (const display of latest.displays) {
			const option = document.createElement('option');
			option.value = display.id;
			option.textContent = display.label + (display.primary ? ' (primary)' : '');
			select.append(option);
		}
		select.value = latest.settings.displayId || latest.displays.find((display) => display.primary)?.id || '';
		select.addEventListener('change', () => act({ type: 'set-setting', key: 'displayId', value: select.value }));
		root.append(field('Show on', select));
	}

	if (latest.settings.showOnAllDisplays && latest.websites.length > 1) {
		const heading = document.createElement('h2');
		heading.textContent = 'Website per display';
		root.append(heading);
		for (const display of latest.displays) {
			const select = document.createElement('select');
			const follow = document.createElement('option');
			follow.value = '';
			follow.textContent = 'Current website';
			select.append(follow);
			for (const site of latest.websites) {
				const option = document.createElement('option');
				option.value = site.id;
				option.textContent = siteTitle(site);
				select.append(option);
			}
			select.value = latest.settings.displayWebsites[display.id] || '';
			select.addEventListener('change', () => act({
				type: 'set-display-website',
				displayId: display.id,
				websiteId: select.value || null
			}));
			root.append(field(display.label, select));
		}
	}

	const shortcutHeading = document.createElement('h2');
	shortcutHeading.textContent = 'Shortcuts';
	root.append(shortcutHeading);
	const hint = document.createElement('p');
	hint.className = 'hint';
	hint.textContent = 'Click Record, then press a shortcut that includes Ctrl, Alt, or Shift.';
	root.append(hint);

	for (const [name, label] of SHORTCUTS) {
		const row = document.createElement('div');
		row.className = 'shortcut';
		const nameNode = document.createElement('span');
		nameNode.textContent = label;
		const value = document.createElement('code');
		value.textContent = latest.settings.shortcuts[name] || 'None';
		const record = document.createElement('button');
		record.type = 'button';
		record.className = 'ghost';
		record.textContent = recording === name ? 'Press keys…' : 'Record';
		record.addEventListener('click', () => {
			recording = name;
			renderSettings();
		});
		const clear = document.createElement('button');
		clear.type = 'button';
		clear.className = 'ghost';
		clear.textContent = 'Clear';
		clear.addEventListener('click', () => act({
			type: 'set-setting',
			key: 'shortcuts',
			value: { ...latest.settings.shortcuts, [name]: '' }
		}));
		row.append(nameNode, value, record, clear);
		root.append(row);
	}

	const clearData = document.createElement('button');
	clearData.type = 'button';
	clearData.className = 'danger';
	clearData.textContent = 'Clear all website data';
	clearData.addEventListener('click', () => act({ type: 'clear-data' }));
	root.append(clearData);
}

function render() {
	$('#enabled').checked = latest.settings.enabled;
	$('#browsing').checked = latest.settings.browsingMode;
	renderStatus();
	renderList();
	renderEditor();
	if (!$('#settings').hidden) {
		renderSettings();
	}
}

function acceleratorFromEvent(event) {
	const parts = [];
	if (event.ctrlKey || event.metaKey) parts.push('CommandOrControl');
	if (event.altKey) parts.push('Alt');
	if (event.shiftKey) parts.push('Shift');
	if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return null;
	const map = { ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Escape: 'Esc' };
	const key = map[event.key] || (event.key.length === 1 ? event.key.toUpperCase() : event.key);
	if (!parts.length) return null;
	parts.push(key);
	return parts.join('+');
}

document.addEventListener('keydown', (event) => {
	if (!recording) return;
	event.preventDefault();
	const accelerator = acceleratorFromEvent(event);
	if (!accelerator) return;
	const name = recording;
	recording = null;
	act({
		type: 'set-setting',
		key: 'shortcuts',
		value: { ...latest.settings.shortcuts, [name]: accelerator }
	});
});

$('#add-form').addEventListener('submit', (event) => {
	event.preventDefault();
	act({ type: 'add', url: $('#url').value, title: $('#title').value });
});

$('#local-folder').addEventListener('click', async () => {
	const result = await act({ type: 'pick-local' });
	if (!result.ok && result.error) showError(result.error);
});

$('#preview').addEventListener('click', () => act({ type: 'preview', id: selectedId }));
$('#reload').addEventListener('click', () => act({ type: 'reload' }));
$('#next').addEventListener('click', () => act({ type: 'next' }));
$('#previous').addEventListener('click', () => act({ type: 'previous' }));
$('#enabled').addEventListener('change', () => act({ type: 'set-setting', key: 'enabled', value: $('#enabled').checked }));
$('#browsing').addEventListener('change', () => act({ type: 'set-setting', key: 'browsingMode', value: $('#browsing').checked }));

for (const tab of document.querySelectorAll('.tabs button')) {
	tab.addEventListener('click', () => {
		for (const button of document.querySelectorAll('.tabs button')) {
			button.classList.toggle('on', button === tab);
		}
		const name = tab.dataset.tab;
		$('#sites').hidden = name !== 'sites';
		$('#settings').hidden = name !== 'settings';
		if (name === 'settings') renderSettings();
	});
}

window.webpaper.onShow(({ focusAdd, tab } = {}) => {
	if (tab === 'settings') {
		document.querySelector('[data-tab="settings"]').click();
	} else {
		document.querySelector('[data-tab="sites"]').click();
	}
	if (focusAdd) $('#url').focus();
});

window.webpaper.onState((state) => {
	latest = state;
	if (!selectedId || !state.websites.some((site) => site.id === selectedId)) {
		selectedId = state.settings.currentId;
	}
	render();
});

window.webpaper.getState().then((state) => {
	latest = state;
	selectedId = state.settings.currentId;
	render();
});
