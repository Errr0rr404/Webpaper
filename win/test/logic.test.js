const assert = require('assert');
const {
	parseCommand,
	normalizeUrl,
	applyPlaceholders,
	pickNext,
	pickRandom,
	createWebsite,
	normalizeState
} = require('../src/logic');

assert.deepEqual(parseCommand('webpaper:reload'), { command: 'reload', params: {} });
assert.deepEqual(parseCommand('webpaper://next'), { command: 'next', params: {} });
assert.equal(parseCommand('https://example.com'), null);
assert.deepEqual(
	parseCommand('webpaper:add?url=https%3A%2F%2Fexample.com&title=Hello'),
	{ command: 'add', params: { url: 'https://example.com', title: 'Hello' } }
);

assert.equal(normalizeUrl('example.com/path'), 'https://example.com/path');
assert.equal(normalizeUrl('http://example.com'), 'http://example.com/');
assert.equal(normalizeUrl('   '), null);
assert.match(
	normalizeUrl(process.platform === 'win32' ? 'C:\\Sites\\index.html' : '/tmp/index.html'),
	/^file:/
);

assert.equal(
	applyPlaceholders('https://example.com/[[screenWidth]]x[[screenHeight]]', 1920.2, 1080.8),
	'https://example.com/1920x1081'
);

assert.equal(pickNext(['a', 'b', 'c'], 'b', 1), 'c');
assert.equal(pickNext(['a', 'b', 'c'], 'a', -1), 'c');
assert.equal(pickRandom(['only'], 'only'), 'only');
assert.equal(pickRandom(['a', 'b'], 'a', () => 0), 'b');

const site = createWebsite({ url: 'example.com', title: ' Day ' });
assert.equal(site.title, 'Day');
assert.equal(site.url, 'https://example.com/');
assert.equal(createWebsite({ url: '' }), null);

const healed = normalizeState({ websites: [{ id: '1', url: 'https://example.com' }], settings: { opacity: 4 } });
assert.equal(healed.settings.opacity, 1);
assert.equal(healed.settings.currentId, '1');
assert.equal(healed.settings.muteAudio, true);

console.log('logic ok');
