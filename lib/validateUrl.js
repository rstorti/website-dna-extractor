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

  // Resolve hostname to IP(s) and block private ranges.
  // Retry once to tolerate transient DNS hiccups on the Railway/Render server.
  let addresses = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const records = await dns.lookup(parsed.hostname, { all: true });
      addresses = records.map(r => r.address);
      break;
    } catch (e) {
      if (attempt === 1) {
        return { ok: false, reason: 'DNS resolution failed: ' + e.message };
      }
      await new Promise(r => setTimeout(r, 500)); // wait before retry
    }
  }

  for (const ip of addresses) {
    if (PRIVATE_RANGES.some(r => r.test(ip))) {
      return { ok: false, reason: `Resolved to restricted IP range (${ip})` };
    }
  }

  return { ok: true, url: parsed.toString() };
}

module.exports = { isAllowedUrl };
