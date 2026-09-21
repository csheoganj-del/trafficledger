'use strict';

const crypto = require('crypto');
const cfg = require('./config');

let _pub = null;
function publicKey() {
  if (!_pub) {
    _pub = crypto.createPublicKey({
      key: Buffer.from(cfg.PUBLIC_KEY_SPKI_B64, 'base64'),
      format: 'der',
      type: 'spki',
    });
  }
  return _pub;
}

function verifyLease(token) {
  if (!token || typeof token !== 'string') return { ok: false, error: 'missing' };
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, error: 'malformed' };
  try {
    const ok = crypto.verify(
      'sha256',
      Buffer.from(parts[0], 'utf8'),
      { key: publicKey(), dsaEncoding: 'ieee-p1363' },
      Buffer.from(parts[1], 'base64url')
    );
    if (!ok) return { ok: false, error: 'bad_signature' };
    const claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (claims.product && claims.product !== cfg.PRODUCT) {
      return { ok: false, error: 'wrong_product' };
    }
    return { ok: true, claims };
  } catch (e) {
    return { ok: false, error: 'verify_exception' };
  }
}

module.exports = { verifyLease };
