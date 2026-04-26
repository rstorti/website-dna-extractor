const dns = require('dns').promises;
const dnsCb = require('dns');
const ipaddr = require('ipaddr.js');
const http = require('http');
const https = require('https');

function isIpAllowed(ipStr) {
  try {
    let addr = ipaddr.parse(ipStr);
    if (addr.kind() === 'ipv6' && addr.isIPv4MappedAddress()) {
      addr = addr.toIPv4Address();
    }
    return addr.range() === 'unicast';
  } catch (e) {
    return false;
  }
}

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
      await new Promise(r => setTimeout(r, 500));
    }
  }

  for (const ip of addresses) {
    if (!isIpAllowed(ip)) {
      return { ok: false, reason: `Resolved to restricted IP range (${ip})` };
    }
  }

  return { ok: true, url: parsed.toString() };
}

const lookupSafe = (hostname, options, callback) => {
  dnsCb.lookup(hostname, options, (err, address, family) => {
    if (err) return callback(err);
    
    let ipsToCheck = Array.isArray(address) ? address.map(a => a.address) : [address];

    for (const ip of ipsToCheck) {
        if (!ip || !isIpAllowed(ip)) {
            return callback(new Error(`SSRF Prevention: Access to IP ${ip} is blocked.`));
        }
    }
    
    callback(null, address, family);
  });
};

const safeHttpAgent = new http.Agent({ lookup: lookupSafe });
const safeHttpsAgent = new https.Agent({ lookup: lookupSafe });

module.exports = { isAllowedUrl, safeHttpAgent, safeHttpsAgent, isIpAllowed };
