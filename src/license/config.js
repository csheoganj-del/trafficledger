'use strict';

const DAY = 24 * 60 * 60 * 1000;

function licenseApi() {
  return process.env.TL_LICENSE_API || 'https://mansinghgurjar.in';
}

function softwareUrl() {
  return process.env.TL_SOFTWARE_URL || 'https://mansinghgurjar.in/software/traffic-ledger';
}

module.exports = {
  PRODUCT: 'trafficledger',
  SITE_URL: process.env.TL_SITE_URL || 'https://mansinghgurjar.in',
  SOFTWARE_URL: softwareUrl(),
  LICENSE_API: licenseApi(),
  PUBLIC_KEY_SPKI_B64: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE7yicPHFqhUWC14F5YiIYN0y3c7exC9fiiNmoNLsQ9TvefFgugpr6HnVpBY9zlv2Vzax3SVXjngeZYuovwHgbdg==',
  OFFLINE_WINDOW_MS: 7 * DAY,
  BOOTSTRAP_GRACE_MS: 24 * 60 * 60 * 1000,
  PRE_EXPIRY_WARN_MS: 2 * DAY,
  CLOCK_SKEW_TOLERANCE_MS: 15 * 60 * 1000,
  CLOCK_SKEW_OFFLINE_GRACE_MS: 4 * 60 * 60 * 1000,
  REFRESH_INTERVAL_MS: 6 * 60 * 60 * 1000,
  MODE: 'enforce',
};
