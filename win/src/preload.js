const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('webpaper', {
	getState: () => ipcRenderer.invoke('get-state'),
	action: (payload) => ipcRenderer.invoke('action', payload),
	onState: (listener) => {
		const wrapped = (_event, state) => listener(state);
		ipcRenderer.on('state', wrapped);
		return () => ipcRenderer.removeListener('state', wrapped);
	},
	onShow: (listener) => {
		const wrapped = (_event, payload) => listener(payload || {});
		ipcRenderer.on('show', wrapped);
		return () => ipcRenderer.removeListener('show', wrapped);
	}
});
