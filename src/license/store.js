'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

function empty() {
  return { lease: '', licenseKey: '', hwm: 0, firstSeen: 0, everLeased: false, killed: false };
}

class LicenseStore {
  constructor(userData, safeStorage) {
    this.file = path.join(userData, 'license-state.enc');
    this.ever = path.join(userData, 'license-state.ever');
    this.safeStorage = safeStorage || null;
  }

  read() {
    const everLeased = fs.existsSync(this.ever);
    try {
      if (!fs.existsSync(this.file)) {
        return Object.assign(empty(), { everLeased });
      }
      const raw = fs.readFileSync(this.file, 'utf8');
      const plain = this.decrypt(raw);
      if (!plain) return Object.assign(empty(), { everLeased, decryptFailed: true });
      const st = JSON.parse(plain);
      return {
        lease: st.lease || '',
        licenseKey: st.licenseKey || '',
        hwm: Number(st.hwm || 0),
        firstSeen: Number(st.firstSeen || 0),
        everLeased: !!(st.everLeased || everLeased),
        killed: !!st.killed,
      };
    } catch (e) {
      return Object.assign(empty(), { everLeased, readError: true });
    }
  }

  write(st) {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, this.encrypt(JSON.stringify({
        lease: st.lease || '',
        licenseKey: st.licenseKey || '',
        hwm: Number(st.hwm || 0),
        firstSeen: Number(st.firstSeen || 0),
        everLeased: !!st.everLeased,
        killed: !!st.killed,
      })), { mode: 0o600 });
      if (st.everLeased) fs.writeFileSync(this.ever, '1', { mode: 0o600 });
    } catch (e) {}
  }

  encrypt(plain) {
    try {
      if (this.safeStorage && this.safeStorage.isEncryptionAvailable()) {
        return 'v1:' + this.safeStorage.encryptString(plain).toString('base64');
      }
    } catch (e) {}
    return 'p0:' + Buffer.from(plain, 'utf8').toString('base64');
  }

  decrypt(stored) {
    if (!stored) return null;
    try {
      if (stored.startsWith('v1:') && this.safeStorage) {
        return this.safeStorage.decryptString(Buffer.from(stored.slice(3), 'base64'));
      }
      if (stored.startsWith('p0:')) {
        return Buffer.from(stored.slice(3), 'base64').toString('utf8');
      }
    } catch (e) {}
    return null;
  }
}

function deviceId() {
  const raw = platformId();
  return crypto.createHash('sha256').update('trafficledger:' + raw).digest('hex');
}

function platformId() {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('reg', [
        'query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid',
      ], { encoding: 'utf8', windowsHide: true });
      const m = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/);
      if (m) return m[1].trim();
    }
    if (process.platform === 'darwin') {
      const out = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding: 'utf8' });
      const m = out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
      if (m) return m[1];
    }
  } catch (e) {}
  return os.hostname() + '|' + os.userInfo().username;
}

function deviceName() {
  return os.hostname();
}

module.exports = { LicenseStore, deviceId, deviceName };
