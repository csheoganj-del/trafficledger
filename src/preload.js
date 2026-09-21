'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ledger', {
  license: () => ipcRenderer.invoke('license:get'),
  activate: (key) => ipcRenderer.invoke('license:activate', key),
  buy: (payload) => ipcRenderer.invoke('license:buy', payload),
  traffic: () => ipcRenderer.invoke('traffic:get'),
  history: () => ipcRenderer.invoke('history:get'),
  setBudget: (bytes) => ipcRenderer.invoke('history:budget', bytes),
  exportCsv: () => ipcRenderer.invoke('history:export'),
  openBuy: () => ipcRenderer.invoke('open:buy'),
  onTraffic: (cb) => {
    const fn = (_e, snap) => cb(snap);
    ipcRenderer.on('traffic', fn);
    return () => ipcRenderer.removeListener('traffic', fn);
  },
  onLicense: (cb) => {
    const fn = (_e, snap) => cb(snap);
    ipcRenderer.on('license', fn);
    return () => ipcRenderer.removeListener('license', fn);
  },
});
