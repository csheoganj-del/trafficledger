'use strict';

const { execFile } = require('child_process');

const SKIP = /loopback|isatap|teredo|wintun|wireguard|tap-windows|vpn|bluetooth|vethernet|pseudo|awdl|llw|^lo\d*$|^utun|^ipsec|^ppp|^gif|^stf/i;

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, timeout: 4000, encoding: 'utf8' }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout || '');
    });
  });
}

async function sampleWindows() {
  const script = [
    'Get-NetAdapter | Where-Object {$_.Status -eq "Up"} | ForEach-Object {',
    '  $s = Get-NetAdapterStatistics -Name $_.Name -ErrorAction SilentlyContinue;',
    '  if ($s) { [pscustomobject]@{ n=$_.Name; r=[int64]$s.ReceivedBytes; t=[int64]$s.SentBytes } }',
    '} | ConvertTo-Json -Compress',
  ].join(' ');
  const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
  let rows = [];
  try { rows = JSON.parse(out); } catch (e) { rows = []; }
  if (!Array.isArray(rows)) rows = rows ? [rows] : [];
  let down = 0, up = 0;
  const adapters = [];
  for (const row of rows) {
    const name = String(row.n || '');
    if (!name || SKIP.test(name)) continue;
    const r = Number(row.r || 0);
    const t = Number(row.t || 0);
    down += r;
    up += t;
    adapters.push({ name, down: r, up: t });
  }
  return { down, up, adapters };
}

async function sampleDarwin() {
  const out = await run('netstat', ['-ib']);
  let down = 0, up = 0;
  const adapters = [];
  const seen = new Set();
  for (const line of out.split(/\r?\n/).slice(1)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 10) continue;
    const name = cols[0];
    if (seen.has(name) || SKIP.test(name)) continue;
    seen.add(name);
    const ibytes = Number(cols[cols.length - 5]);
    const obytes = Number(cols[cols.length - 2]);
    if (!Number.isFinite(ibytes) || !Number.isFinite(obytes)) continue;
    down += ibytes;
    up += obytes;
    adapters.push({ name, down: ibytes, up: obytes });
  }
  return { down, up, adapters };
}

async function sample() {
  try {
    if (process.platform === 'win32') return await sampleWindows();
    if (process.platform === 'darwin') return await sampleDarwin();
    return { down: 0, up: 0, adapters: [] };
  } catch (e) {
    return { down: 0, up: 0, adapters: [], error: String(e.message || e) };
  }
}

class TrafficMonitor {
  constructor() {
    this.prev = null;
    this.prevAt = 0;
    this.live = { downBps: 0, upBps: 0, adapters: [], sparkDown: [], sparkUp: [] };
    this.totals = { down: 0, up: 0, sessionDown: 0, sessionUp: 0 };
    this.timer = null;
  }

  start(onTick) {
    this.stop();
    const tick = async () => {
      const snap = await sample();
      const now = Date.now();
      if (this.prev && this.prevAt) {
        const dt = Math.max(0.2, (now - this.prevAt) / 1000);
        const dDown = Math.max(0, snap.down - this.prev.down);
        const dUp = Math.max(0, snap.up - this.prev.up);
        this.live.downBps = dDown / dt;
        this.live.upBps = dUp / dt;
        this.totals.down += dDown;
        this.totals.up += dUp;
        this.totals.sessionDown += dDown;
        this.totals.sessionUp += dUp;
        this.live.sparkDown.push(this.live.downBps);
        this.live.sparkUp.push(this.live.upBps);
        if (this.live.sparkDown.length > 120) this.live.sparkDown.shift();
        if (this.live.sparkUp.length > 120) this.live.sparkUp.shift();
        this.live.delta = { down: dDown, up: dUp, at: now };
      }
      this.live.adapters = snap.adapters;
      this.prev = snap;
      this.prevAt = now;
      if (onTick) onTick(this.snapshot());
    };
    tick();
    this.timer = setInterval(tick, 1000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  snapshot() {
    return {
      downBps: this.live.downBps,
      upBps: this.live.upBps,
      sparkDown: this.live.sparkDown.slice(),
      sparkUp: this.live.sparkUp.slice(),
      adapters: this.live.adapters,
      totals: Object.assign({}, this.totals),
      delta: this.live.delta || null,
    };
  }
}

module.exports = { TrafficMonitor, sample };
