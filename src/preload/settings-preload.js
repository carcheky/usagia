'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('usagiaSettings', {
  get: () => ipcRenderer.invoke('settings:get'),
  save: (payload) => ipcRenderer.invoke('settings:save', payload),
  test: (payload) => ipcRenderer.invoke('settings:test', payload),
  reveal: () => ipcRenderer.invoke('settings:reveal'),
  checkUpdates: () => ipcRenderer.invoke('settings:checkUpdates'),
  close: () => ipcRenderer.send('settings:close'),
});
