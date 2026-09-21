'use strict';

const cfg = require('./config');
const { evaluateLicense } = require('./policy');
const { verifyLease } = require('./verify');
const { LicenseStore, deviceId, deviceName } = require('./store');

class LicenseGuard {
  constructor({ userData, safeStorage }) {
    this.store = new LicenseStore(userData, safeStorage);
    this.state = this.store.read();
    if (!this.state.firstSeen) {
      this.state.firstSeen = Date.now();
      this.store.write(this.state);
    }
    this.decision = this.evaluate();
  }

  evaluate() {
    const now = Date.now();
    const verified = verifyLease(this.state.lease);
    let hwm = Math.max(this.state.hwm || 0, now);
    if (verified.ok && verified.claims && verified.claims.server_time) {
      hwm = Math.max(hwm, Number(verified.claims.server_time));
    }
    this.state.hwm = hwm;
    this.decision = evaluateLicense({
      verified: verified.ok,
      claims: verified.claims || null,
      now,
      hwm,
      firstSeen: this.state.firstSeen,
      everLeased: this.state.everLeased,
      killed: this.state.killed,
      cfg,
    });
    return this.decision;
  }

  snapshot() {
    const verified = verifyLease(this.state.lease);
    return {
      locked: !!this.decision.locked,
      reason: this.decision.reason,
      warn: !!this.decision.warn,
      trial: !!this.decision.trial,
      plan: this.decision.plan || (verified.claims && verified.claims.plan) || null,
      msUntilExpiry: this.decision.msUntilExpiry || null,
      hasKey: !!this.state.licenseKey,
      api: cfg.LICENSE_API,
    };
  }

  async refresh() {
    const body = {
      device_id: deviceId(),
      device_name: deviceName(),
      platform: process.platform === 'darwin' ? 'macos' : process.platform,
    };
    let path = '/v1/trial';
    if (this.state.licenseKey) {
      path = '/v1/lease';
      body.license_key = this.state.licenseKey;
    }
    const env = await post(path, body);
    this.apply(env, this.state.licenseKey);
    return this.snapshot();
  }

  async claim(email) {
    const env = await post('/v1/claim', {
      email: String(email || '').trim(),
      device_id: deviceId(),
      device_name: deviceName(),
      platform: process.platform === 'darwin' ? 'macos' : process.platform,
    });
    this.apply(env, env.license_key);
    if (!env.ok && env.error) {
      const err = new Error(env.error);
      err.payload = env;
      throw err;
    }
    return this.snapshot();
  }

  async buy({ plan, email }) {
    const checkout = await post('/v1/checkout', {
      plan: String(plan || 'personal'),
      email: String(email || '').trim(),
      currency: 'INR',
    });
    if (!checkout.ok) {
      const err = new Error(checkout.error || 'checkout_failed');
      err.payload = checkout;
      throw err;
    }
    if (!checkout.license_key) {
      const err = new Error('payment_required');
      err.payload = checkout;
      throw err;
    }
    return this.activate(checkout.license_key);
  }

  async activate(key) {
    const env = await post('/v1/activate', {
      license_key: String(key || '').trim(),
      device_id: deviceId(),
      device_name: deviceName(),
      platform: process.platform === 'darwin' ? 'macos' : process.platform,
    });
    this.apply(env, key);
    if (!env.ok && env.error) {
      const err = new Error(env.error);
      err.payload = env;
      throw err;
    }
    return this.snapshot();
  }

  apply(env, persistKey) {
    if (env.killed) {
      this.state.killed = true;
      this.state.lease = '';
      this.store.write(this.state);
      this.evaluate();
      return;
    }
    if (env.error === 'trial_expired' && !this.state.licenseKey) {
      this.state.lease = '';
      this.store.write(this.state);
      this.evaluate();
      return;
    }
    if (!env.lease) {
      this.evaluate();
      return;
    }
    const verified = verifyLease(env.lease);
    if (!verified.ok) {
      this.evaluate();
      return;
    }
    this.state.lease = env.lease;
    if (persistKey) this.state.licenseKey = String(persistKey).trim();
    this.state.everLeased = true;
    this.state.killed = false;
    if (verified.claims && verified.claims.server_time) {
      this.state.hwm = Math.max(this.state.hwm, Number(verified.claims.server_time));
    }
    this.store.write(this.state);
    this.evaluate();
  }
}

async function post(pathname, body) {
  const url = cfg.LICENSE_API.replace(/\/+$/, '') + pathname;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  data.ok = data.ok === true;
  data.status = res.status;
  return data;
}

module.exports = { LicenseGuard };
