const fs = require('fs');
const path = require('path');
const { normalizeState } = require('./logic');

function load(file) {
	try {
		return normalizeState(JSON.parse(fs.readFileSync(file, 'utf8')));
	} catch (error) {
		if (error.code !== 'ENOENT') {
			const broken = `${file}.broken`;
			try {
				fs.copyFileSync(file, broken);
			} catch {
				// The original file may already be unreadable.
			}
		}
		return normalizeState(null);
	}
}

function save(file, state) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const tmp = `${file}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(normalizeState(state), null, 2));
	fs.renameSync(tmp, file);
}

module.exports = { load, save };
