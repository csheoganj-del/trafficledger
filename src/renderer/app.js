function rate(n) {
  n = Math.max(0, Number(n) || 0);
  if (n < 1000) return Math.round(n) + ' B/s';
  if (n < 1e6) return (n / 1e3).toFixed(1) + ' KB/s';
  if (n < 1e9) return (n / 1e6).toFixed(1) + ' MB/s';
  return (n / 1e9).toFixed(2) + ' GB/s';
}
function bytes(n) {
  n = Math.max(0, Number(n) || 0);
  if (n < 1000) return Math.round(n) + ' B';
  if (n < 1e6) return (n / 1e3).toFixed(1) + ' KB';
  if (n < 1e9) return (n / 1e6).toFixed(2) + ' MB';
  if (n < 1e12) return (n / 1e9).toFixed(2) + ' GB';
  return (n / 1e12).toFixed(2) + ' TB';
}
function spark(down, up) {
  const w = 240, h = 110;
  const max = Math.max(1, ...down, ...up);
  const pts = (arr) => arr.map((v, i) => {
    const x = arr.length < 2 ? 0 : (i / (arr.length - 1)) * w;
    const y = h - 8 - (v / max) * (h - 16);
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
  document.getElementById('spark').innerHTML =
    `<polyline fill="none" stroke="#c6f04a" stroke-width="2" points="${pts(down)}"></polyline>` +
    `<polyline fill="none" stroke="rgba(243,241,232,.45)" stroke-width="1.5" stroke-dasharray="4 4" points="${pts(up)}"></polyline>`;
}

document.querySelectorAll('nav button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('on'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.view).classList.add('on');
  });
});

function paintLicense(snap) {
  const chip = document.getElementById('license-chip');
  if (snap.trial) chip.textContent = 'TRIAL';
  else if (snap.plan) chip.textContent = String(snap.plan).toUpperCase();
  else chip.textContent = 'LICENSED';
  if (snap.warn) chip.textContent += ' · RENEW SOON';
  const line = document.getElementById('plan-line');
  if (line) {
    line.textContent = snap.trial
      ? 'You are on a 14-day trial. Buy a key to keep history after the trial ends.'
      : 'Plan: ' + (snap.plan || 'licensed') + '. Offline window is 7 days between check-ins.';
  }
}

function paintTraffic(t) {
  if (!t || t.locked) return;
  document.getElementById('down').textContent = rate(t.downBps);
  document.getElementById('up').textContent = rate(t.upBps);
  spark(t.sparkDown || [0], t.sparkUp || [0]);
  if (t.totals) document.getElementById('session').textContent = bytes(t.totals.sessionDown + t.totals.sessionUp);
}

function paintHistory(h) {
  if (!h || h.locked) return;
  document.getElementById('today').textContent = bytes((h.today && (h.today.down + h.today.up)) || 0);
  const budget = h.budgetBytes || 0;
  const used = (h.today && (h.today.down + h.today.up)) || 0;
  document.getElementById('budget').textContent = budget ? (bytes(used) + ' / ' + bytes(budget)) : 'Off';
  document.getElementById('budget-in').value = budget ? Math.round(budget / 1e9) : 0;
  const max = Math.max(1, ...(h.days || []).map((d) => d.down + d.up));
  document.getElementById('bars').innerHTML = (h.days || []).map((d) => {
    const pct = Math.max(4, ((d.down + d.up) / max) * 100);
    return `<i title="${d.date}" style="height:${pct}%"></i>`;
  }).join('');
  document.getElementById('days').innerHTML = (h.days || []).slice().reverse().map((d) =>
    `<tr><td>${d.date}</td><td>${bytes(d.down)}</td><td>${bytes(d.up)}</td></tr>`
  ).join('') || '<tr><td colspan="3">Your network history starts here.</td></tr>';
}

async function refresh() {
  paintLicense(await window.ledger.license());
  paintTraffic(await window.ledger.traffic());
  paintHistory(await window.ledger.history());
}

window.ledger.onTraffic(paintTraffic);
window.ledger.onLicense((snap) => {
  if (snap.locked) return;
  paintLicense(snap);
});

document.getElementById('save-budget').addEventListener('click', async () => {
  const gb = Number(document.getElementById('budget-in').value || 0);
  paintHistory(await window.ledger.setBudget(gb * 1e9));
});
document.getElementById('export').addEventListener('click', () => window.ledger.exportCsv());

refresh();
setInterval(refresh, 5000);
