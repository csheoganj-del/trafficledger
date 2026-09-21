'use strict';

const fs = require('fs');
const path = require('path');

function dayKey(ms) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

class HistoryStore {
  constructor(userData) {
    this.file = path.join(userData, 'ledger.json');
    this.data = { days: {}, sessions: [], budgetBytes: 0 };
    this.load();
    this.session = {
      id: Date.now().toString(36),
      start: Date.now(),
      end: Date.now(),
      down: 0,
      up: 0,
    };
  }

  load() {
    try {
      if (fs.existsSync(this.file)) {
        this.data = Object.assign({ days: {}, sessions: [], budgetBytes: 0 }, JSON.parse(fs.readFileSync(this.file, 'utf8')));
      }
    } catch (e) {
      this.data = { days: {}, sessions: [], budgetBytes: 0 };
    }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data));
    } catch (e) {}
  }

  add(down, up, at) {
    const key = dayKey(at || Date.now());
    if (!this.data.days[key]) this.data.days[key] = { down: 0, up: 0 };
    this.data.days[key].down += down;
    this.data.days[key].up += up;
    this.session.down += down;
    this.session.up += up;
    this.session.end = at || Date.now();
  }

  checkpoint() {
    const s = Object.assign({}, this.session);
    const idx = this.data.sessions.findIndex((x) => x.id === s.id);
    if (idx >= 0) this.data.sessions[idx] = s;
    else this.data.sessions.push(s);
    if (this.data.sessions.length > 400) this.data.sessions = this.data.sessions.slice(-400);
    this.save();
  }

  snapshot() {
    const today = this.data.days[dayKey(Date.now())] || { down: 0, up: 0 };
    const days = Object.keys(this.data.days).sort().slice(-42).map((k) => ({
      date: k,
      down: this.data.days[k].down,
      up: this.data.days[k].up,
    }));
    return {
      today,
      days,
      sessions: this.data.sessions.slice(-30).reverse(),
      budgetBytes: this.data.budgetBytes || 0,
    };
  }

  setBudget(bytes) {
    this.data.budgetBytes = Number(bytes || 0);
    this.save();
  }

  exportCsv() {
    const lines = ['date,download_bytes,upload_bytes'];
    for (const k of Object.keys(this.data.days).sort()) {
      const d = this.data.days[k];
      lines.push(`${k},${d.down},${d.up}`);
    }
    return lines.join('\n');
  }
}

module.exports = { HistoryStore };
