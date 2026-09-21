'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const { LicenseGuard } = require('./src/license/guard');
const { verifyLease } = require('./src/license/verify');

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-'));
  const guard = new LicenseGuard({ userData: dir, safeStorage: null });
  const trial = await guard.refresh();
  if (trial.locked) throw new Error('trial should allow: ' + trial.reason);
  if (!trial.trial) throw new Error('expected trial lease');

  const checkout = await fetch('http://127.0.0.1:8788/v1/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: 'personal', email: 'exe-test@trafficledger.test' }),
  }).then((r) => r.json());
  if (!checkout.license_key) throw new Error('checkout failed');

  const snap = await guard.activate(checkout.license_key);
  if (snap.locked) throw new Error('activate failed: ' + JSON.stringify(snap));
  if (snap.plan !== 'personal') throw new Error('plan ' + snap.plan);

  const st = JSON.parse(Buffer.from(fs.readFileSync(path.join(dir, 'license-state.enc'), 'utf8').slice(3), 'base64').toString('utf8'));
  const v = verifyLease(st.lease);
  if (!v.ok) throw new Error('stored lease does not verify');
  if (v.claims.device_id !== require('./src/license/store').deviceId()) throw new Error('device mismatch');

  console.log('OK trial + activate + signed lease on this Windows machine');
  console.log('key', checkout.license_key);
  console.log('plan', snap.plan);
}

main().catch((e) => { console.error(e); process.exit(1); });
