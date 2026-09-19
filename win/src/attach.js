const { execFile } = require('child_process');
const path = require('path');

function scriptPath() {
	return path.join(__dirname, 'attach.ps1').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
}

function hwndOf(win) {
	return win.getNativeWindowHandle().readBigUInt64LE(0).toString();
}

function run(args) {
	return new Promise((resolve, reject) => {
		execFile('powershell.exe', [
			'-NoProfile',
			'-NonInteractive',
			'-ExecutionPolicy',
			'Bypass',
			'-File',
			scriptPath(),
			...args
		], { windowsHide: true }, (error, stdout, stderr) => {
			if (error) {
				reject(new Error((stderr || error.message || '').trim()));
				return;
			}
			resolve(String(stdout).trim());
		});
	});
}

function attach(win, bounds) {
	return run([
		hwndOf(win),
		'attach',
		String(bounds.x),
		String(bounds.y),
		String(bounds.width),
		String(bounds.height)
	]);
}

function detach(win) {
	return run([hwndOf(win), 'detach']);
}

module.exports = { attach, detach };
