'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, safeStorage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { LicenseGuard } = require('./license/guard');
const cfg = require('./license/config');
const { TrafficMonitor } = require('./monitor');
const { HistoryStore } = require('./history');

app.setName('TrafficLedger');
app.setAppUserModelId('com.falakmeter.app');

let mainWindow = null;
let tray = null;
let guard = null;
let monitor = null;
let history = null;
let lastTraffic = null;

function iconImage() {
  const p = path.join(__dirname, '..', 'build', 'icon.png');
  if (fs.existsSync(p)) return nativeImage.createFromPath(p).resize({ width: 16, height: 16 });
  return nativeImage.createEmpty();
}

function formatRate(n) {
  if (n < 1000) return Math.round(n) + ' B/s';
  if (n < 1_000_000) return (n / 1000).toFixed(1) + ' KB/s';
  if (n < 1_000_000_000) return (n / 1_000_000).toFixed(1) + ' MB/s';
  return (n / 1_000_000_000).toFixed(2) + ' GB/s';
}

function pageForState() {
  const locked = guard && guard.decision && guard.decision.locked;
  return path.join(__dirname, 'renderer', locked ? 'lock.html' : 'index.html');
}

function createWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }
  mainWindow = new BrowserWindow({
    width: 980,
    height: 680,
    minWidth: 760,
    minHeight: 520,
    title: 'TrafficLedger',
    backgroundColor: '#0c0d0b',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: !app.isPackaged,
    },
  });
  mainWindow.loadFile(pageForState());
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  return mainWindow;
}

function reloadForLicense() {
  if (!mainWindow) return;
  mainWindow.loadFile(pageForState());
  mainWindow.webContents.send('license', guard.snapshot());
}

function updateTray() {
  if (!tray) return;
  const t = lastTraffic;
  const title = t
    ? `↓ ${formatRate(t.downBps)}  ↑ ${formatRate(t.upBps)}`
    : 'TrafficLedger';
  if (process.platform === 'darwin') tray.setTitle(' ' + title);
  tray.setToolTip(title);
  const locked = guard && guard.decision && guard.decision.locked;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: title, enabled: false },
    { type: 'separator' },
    { label: locked ? 'Activate license…' : 'Open dashboard', click: () => createWindow() },
    { label: 'Buy a license', click: () => shell.openExternal(cfg.SOFTWARE_URL) },
    { type: 'separator' },
    { label: 'Quit TrafficLedger', click: () => app.quit() },
  ]));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function bootLicense() {
  guard = new LicenseGuard({ userData: app.getPath('userData'), safeStorage });
  guard.evaluate();
  for (let i = 0; i < 20; i++) {
    try {
      await guard.refresh();
      break;
    } catch (e) { /* desk still coming up */ }
    await sleep(400);
  }
  guard.evaluate();
  setInterval(() => { guard.refresh().then(reloadForLicense).catch(() => {}); }, cfg.REFRESH_INTERVAL_MS);
}

function bootTraffic() {
  history = new HistoryStore(app.getPath('userData'));
  monitor = new TrafficMonitor();
  let sinceSave = 0;
  monitor.start((snap) => {
    lastTraffic = snap;
    if (guard && guard.decision && !guard.decision.locked && snap.delta) {
      history.add(snap.delta.down, snap.delta.up, snap.delta.at);
      sinceSave += 1;
      if (sinceSave >= 30) { history.checkpoint(); sinceSave = 0; }
    }
    updateTray();
    if (mainWindow) mainWindow.webContents.send('traffic', snap);
  });
}

app.whenReady().then(async () => {
  const got = app.requestSingleInstanceLock();
  if (!got) { app.quit(); return; }
  await bootLicense();
  bootTraffic();
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  tray = new Tray(iconImage());
  updateTray();
  tray.on('click', () => createWindow());
  const locked = guard && guard.decision && guard.decision.locked;
  if (process.platform !== 'darwin' || locked) createWindow();
  app.setLoginItemSettings({ openAtLogin: true });
});

app.on('second-instance', () => createWindow());
app.on('window-all-closed', () => {});
app.on('before-quit', () => {
  app.isQuitting = true;
  if (history) history.checkpoint();
  if (monitor) monitor.stop();
});

ipcMain.handle('license:get', () => guard.snapshot());
ipcMain.handle('license:activate', async (_e, key) => {
  try {
    const snap = await guard.activate(key);
    reloadForLicense();
    return snap;
  } catch (err) {
    return { locked: true, reason: err.message || 'activate_failed', error: err.message };
  }
});
ipcMain.handle('license:buy', async (_e, payload) => {
  try {
    const snap = await guard.buy(payload || {});
    reloadForLicense();
    return snap;
  } catch (err) {
    return { locked: true, reason: err.message || 'buy_failed', error: err.message };
  }
});
ipcMain.handle('traffic:get', () => {
  if (guard.decision.locked) return { locked: true };
  return monitor ? monitor.snapshot() : null;
});
ipcMain.handle('history:get', () => {
  if (guard.decision.locked) return { locked: true };
  return history.snapshot();
});
ipcMain.handle('history:budget', (_e, bytes) => {
  if (guard.decision.locked) return { locked: true };
  history.setBudget(bytes);
  return history.snapshot();
});
ipcMain.handle('history:export', async () => {
  if (guard.decision.locked) return { locked: true };
  const csv = history.exportCsv();
  const file = await dialog.showSaveDialog({
    title: 'Export your ledger',
    defaultPath: 'trafficledger.csv',
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
  if (file.canceled || !file.filePath) return { canceled: true };
  fs.writeFileSync(file.filePath, csv);
  return { ok: true, path: file.filePath };
});
ipcMain.handle('open:buy', () => {
  shell.openExternal(cfg.SOFTWARE_URL);
  return true;
});
