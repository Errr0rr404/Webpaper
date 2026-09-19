const { pathToFileURL } = require('url');
const { randomUUID } = require('crypto');

const SHORTCUT_NAMES = [
	'toggleEnabled',
	'toggleBrowsingMode',
	'reload',
	'next',
	'previous',
	'random'
];

function defaultState() {
	return {
		websites: [],
		settings: {
			currentId: null,
			enabled: true,
			browsingMode: false,
			opacity: 1,
			reloadIntervalMinutes: null,
			muteAudio: true,
			deactivateOnBattery: false,
			reloadOnWake: true,
			showOnAllDisplays: true,
			displayId: null,
			displayWebsites: {},
			launchAtLogin: false,
			bringBrowsingModeToFront: false,
			openExternalLinksInBrowser: false,
			hideTrayIcon: false,
			shortcuts: {
				toggleEnabled: '',
				toggleBrowsingMode: '',
				reload: '',
				next: '',
				previous: '',
				random: ''
			}
		}
	};
}

function normalizeState(raw) {
	const base = defaultState();
	if (!raw || typeof raw !== 'object') {
		return base;
	}

	const settings = {
		...base.settings,
		...(raw.settings && typeof raw.settings === 'object' ? raw.settings : {})
	};
	settings.shortcuts = {
		...base.settings.shortcuts,
		...(settings.shortcuts && typeof settings.shortcuts === 'object' ? settings.shortcuts : {})
	};
	settings.displayWebsites = settings.displayWebsites && typeof settings.displayWebsites === 'object'
		? settings.displayWebsites
		: {};
	settings.opacity = clamp(Number(settings.opacity) || 1, 0.1, 1);

	const websites = Array.isArray(raw.websites)
		? raw.websites.filter((site) => site && typeof site.id === 'string' && typeof site.url === 'string')
		: [];

	if (!websites.some((site) => site.id === settings.currentId)) {
		settings.currentId = websites[0]?.id ?? null;
	}

	return { websites, settings };
}

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

function normalizeUrl(input) {
	const trimmed = String(input || '').trim();
	if (!trimmed) {
		return null;
	}

	if (/^(https?|file):/i.test(trimmed)) {
		try {
			return new URL(trimmed).href;
		} catch {
			return null;
		}
	}

	if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith('\\\\') || trimmed.startsWith('/')) {
		try {
			return pathToFileURL(trimmed).href;
		} catch {
			return null;
		}
	}

	try {
		return new URL(`https://${trimmed}`).href;
	} catch {
		return null;
	}
}

function applyPlaceholders(url, width, height) {
	return String(url)
		.replaceAll('[[screenWidth]]', String(Math.round(width)))
		.replaceAll('[[screenHeight]]', String(Math.round(height)));
}

function parseCommand(raw) {
	if (!raw) {
		return null;
	}

	const match = String(raw).trim().match(/^webpaper:(?:\/\/)?(.*)$/i);
	if (!match) {
		return null;
	}

	const rest = match[1].replace(/^\/+/, '');
	const queryAt = rest.indexOf('?');
	const pathPart = (queryAt === -1 ? rest : rest.slice(0, queryAt)).replace(/\/+$/, '');
	const query = queryAt === -1 ? '' : rest.slice(queryAt + 1);
	const params = {};
	for (const [key, value] of new URLSearchParams(query)) {
		params[key] = value;
	}

	const command = decodeURIComponent(pathPart).toLowerCase();
	if (!command) {
		return null;
	}

	return { command, params };
}

function createWebsite({ url, title = '' }) {
	const normalized = normalizeUrl(url);
	if (!normalized) {
		return null;
	}

	return {
		id: randomUUID(),
		title: String(title || '').trim(),
		url: normalized,
		css: '',
		javaScript: '',
		invertColors: 'never',
		usePrintStyles: false,
		allowSelfSignedCertificate: false,
		transparentBackground: false
	};
}

function pickNext(ids, currentId, direction) {
	if (!ids.length) {
		return null;
	}

	const index = ids.indexOf(currentId);
	const start = index < 0 ? 0 : index;
	return ids[(start + direction + ids.length) % ids.length];
}

function pickRandom(ids, currentId, random = Math.random) {
	if (!ids.length) {
		return null;
	}
	if (ids.length === 1) {
		return ids[0];
	}

	const pool = ids.filter((id) => id !== currentId);
	return pool[Math.floor(random() * pool.length)];
}

function menuTitle(site) {
	return site.title?.trim() || site.url;
}

module.exports = {
	SHORTCUT_NAMES,
	defaultState,
	normalizeState,
	normalizeUrl,
	applyPlaceholders,
	parseCommand,
	createWebsite,
	pickNext,
	pickRandom,
	menuTitle
};
