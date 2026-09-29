const { contextBridge, ipcRenderer } = require('electron');

// Each onXxx() registration REPLACES any previous handler for that channel, so
// listeners never stack across overlay reloads (e.g. the GPU-crash auto-recovery
// in main.js calls win.reload(), which re-runs the renderer's registrations).
const sub = (channel, transform) => (cb) => {
  ipcRenderer.removeAllListeners(channel);
  ipcRenderer.on(channel, (_e, ...args) => cb(transform ? transform(...args) : undefined));
};

contextBridge.exposeInMainWorld('cat', {
  onCursor: sub('cursor', (d) => d),
  onKey: sub('keydown'),
  onAgent: sub('agent', (s) => s),
  onScroll: sub('scroll', (dir) => dir),
  onConfig: sub('config', (cfg) => cfg),
  onPower: sub('power', (p) => p),
  onThemes: sub('themes', (list) => list),
  onMood: sub('mood', (c) => c),
  onSetArea: sub('setarea:start'),
  onBreak: sub('break', (d) => d),   // carries { sound } - a bare sub() would drop it
  onTreat: sub('treat'),
  onBall: sub('ball'),
  onAction: sub('action', (id) => id),
  onPomo: sub('pomo', (d) => d),
  onGeom: sub('geom', (g) => g),
  onNotify: sub('notify', (d) => d),
  onFocus: sub('focus', (d) => d),
  setHot: (o) => ipcRenderer.send('hot', o),
  openSettings: () => ipcRenderer.send('settings:open'),
  setPattern: (i) => ipcRenderer.send('settings:save-pattern', i),
  quit: () => ipcRenderer.send('quit'),
  sheetImage: (dataUrl) => ipcRenderer.send('sheet:image', dataUrl),
  setAreaDone: (area) => ipcRenderer.send('setarea:done', area),
  openLauncher: () => ipcRenderer.send('launcher:open'),
});

// Battery level for the Quick Tools low-battery alert. Electron's powerMonitor
// knows WHETHER you are on battery but not how full it is; the web Battery API
// does, and it lives here rather than in the 3000-line renderer. Desktops with no
// battery report level 1 and charging, which never alerts. Main applies the rule
// (tools/battery.js); this only reports changes.
(async () => {
  try {
    if (!navigator.getBattery) return;
    const b = await navigator.getBattery();
    const report = () => ipcRenderer.send('battery', { level: b.level, charging: b.charging });
    b.addEventListener('levelchange', report);
    b.addEventListener('chargingchange', report);
    report();
  } catch (e) { /* no battery API: the alert simply never fires */ }
})();
