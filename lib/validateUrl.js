const dns = require('dns').promises;

const PRIVATE_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc/,
  /^fd/,
  /^fe80/
];

async function isAllowedUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: 'Invalid URL format' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { ok: false, reason: `Protocol "${parsed.protocol}" not allowed` };
  }

  // Resolve hostname to IP(s) and block private ranges
  let addresses = [];
  try {
    const records = await dns.lookup(parsed.hostname, { all: true });
    addresses = records.map(r => r.address);
  } catch (e) {
    return { ok: false, reason: 'DNS resolution failed: ' + e.message };
  }

  for (const ip of addresses) {
    if (PRIVATE_RANGES.some(r => r.test(ip))) {
      return { ok: false, reason: `Resolved to restricted IP range (${ip})` };
    }
  }

  return { ok: true, url: parsed.toString() };
}

module.exports = { isAllowedUrl };
