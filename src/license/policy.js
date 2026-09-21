'use strict';

/**
 * Pure lockout policy. No I/O, no crypto.
 * Lifetime licenses still die when the signed lease expires — that is the
 * offline window. A copied lease cannot be extended without the private key.
 */
function paidUntilMs(claims) {
  if (!claims) return 0;
  const leaseExp = Number(claims.lease_expires_at || 0);
  const planExp = Number(claims.plan_expires_at || 0);
  if (!leaseExp) return 0;
  if (planExp > 0) return Math.min(leaseExp, planExp);
  return leaseExp;
}

function evaluateLicense(input) {
  const cfg = input.cfg || {};
  const now = input.now;
  const hwm = input.hwm || 0;
  const skew = input.clockSkewToleranceMs != null
    ? input.clockSkewToleranceMs
    : (cfg.CLOCK_SKEW_TOLERANCE_MS != null ? cfg.CLOCK_SKEW_TOLERANCE_MS : (15 * 60 * 1000));
  const offlineSkew = input.clockSkewOfflineMs != null
    ? input.clockSkewOfflineMs
    : (cfg.CLOCK_SKEW_OFFLINE_GRACE_MS != null ? cfg.CLOCK_SKEW_OFFLINE_GRACE_MS : (4 * 60 * 60 * 1000));
  const monitor = cfg.MODE === 'monitor';

  if (input.killed) return decision(false, 'killed', { monitor });

  if (hwm && now < hwm - skew) {
    const hwmDelta = hwm - now;
    const hasLiveLease = !!(input.verified && input.claims && paidUntilMs(input.claims) > now);
    if (!(hasLiveLease && hwmDelta <= offlineSkew)) {
      return decision(false, 'clock_rollback', { monitor, hwmDelta });
    }
  }

  if (!input.verified || !input.claims) {
    if (input.everLeased) {
      return decision(false, 'no_lease', { monitor, everLeased: true });
    }
    const firstSeen = input.firstSeen || 0;
    if (!firstSeen) {
      return decision(true, 'bootstrap_start', { monitor, bootstrap: true });
    }
    const graceMs = cfg.BOOTSTRAP_GRACE_MS || 0;
    if (now <= firstSeen + graceMs) {
      return decision(true, 'bootstrap_grace', {
        monitor,
        bootstrap: true,
        msUntilLock: firstSeen + graceMs - now,
      });
    }
    return decision(false, input.claims ? 'invalid_lease' : 'no_lease', { monitor });
  }

  const exp = paidUntilMs(input.claims);
  if (!exp) return decision(false, 'lease_no_expiry', { monitor });
  if (now > exp) {
    return decision(false, 'lease_expired', { monitor, expiredForMs: now - exp });
  }

  const msUntilExpiry = exp - now;
  const warn = msUntilExpiry <= (cfg.PRE_EXPIRY_WARN_MS || 0);
  return decision(true, 'valid', {
    monitor,
    warn,
    msUntilExpiry,
    planExpiresAt: input.claims.plan_expires_at || null,
    trial: !!input.claims.trial,
    plan: input.claims.plan || null,
  });

  function decision(allow, reason, extra) {
    extra = extra || {};
    const locked = !allow && !extra.monitor;
    return Object.assign({
      allow: allow || !!extra.monitor,
      wouldBlock: !allow,
      locked,
      reason,
      warn: !!extra.warn,
    }, extra);
  }
}

module.exports = { evaluateLicense, paidUntilMs };
