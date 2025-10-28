/* preload.js */
// Minimal IPC between renderer and main so renderer can display extension status
const { contextBridge, ipcRenderer } = require('electron')


contextBridge.exposeInMainWorld('electronAPI', {
onExtensionLoaded: (cb) => ipcRenderer.on('extension-loaded', (e, data) => cb(data)),
onExtensionsCleared: (cb) => ipcRenderer.on('extensions-cleared', cb)
})

window.addEventListener('DOMContentLoaded', () => {
  console.log('Preload loaded successfully.');
});
