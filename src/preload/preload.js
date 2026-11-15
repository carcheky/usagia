'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('usagia', {
  onState: (callback) => ipcRenderer.on('state', (_event, payload) => callback(payload)),
  reportSize: (size) => ipcRenderer.send('card:size', size),
  refresh: () => ipcRenderer.send('card:refresh'),
  open: (url) => ipcRenderer.send('card:open', url),
  settings: () => ipcRenderer.send('card:settings'),
  ready: () => ipcRenderer.send('card:ready'),
});
