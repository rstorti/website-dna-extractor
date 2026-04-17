/**
 * logger.js — Lightweight production logger with PII/secret redaction.
 * Adds timestamps and request-ID support. Use instead of raw console.log/error.
 */

// Patterns that should never appear in logs
const REDACT_PATTERNS = [
    /key=[^&\s"]+/gi,           // API keys in query strings
    /apikey=[^&\s"]+/gi,
    /password=[^&\s"]+/gi,
    /Authorization:\s*[^\s]+/gi,
    /GEMINI_API_KEY[^\s]*/gi,
    /YOUTUBE_API_KEY[^\s]*/gi,
];

function redact(str) {
    if (typeof str !== 'string') return str;
    return REDACT_PATTERNS.reduce((s, pattern) => s.replace(pattern, '[REDACTED]'), str);
}

function formatArg(arg) {
    if (arg instanceof Error) return redact(arg.message);
    if (typeof arg === 'string') return redact(arg);
    if (typeof arg === 'object' && arg !== null) {
        try {
            return redact(JSON.stringify(arg));
        } catch { return '[Circular Object]'; }
    }
    return String(arg);
}

function makeLogger(reqId = null) {
    const prefix = reqId ? `[${reqId}]` : '';
    const ts = () => new Date().toISOString();

    return {
        log:  (...args) => console.log(`${ts()} ${prefix}`, ...args.map(formatArg)),
        warn: (...args) => console.warn(`${ts()} ⚠️ ${prefix}`, ...args.map(formatArg)),
        error:(...args) => console.error(`${ts()} ❌ ${prefix}`, ...args.map(formatArg)),
        info: (...args) => console.log(`${ts()} ℹ️ ${prefix}`, ...args.map(formatArg)),
    };
}

// Default module-level logger (no request ID)
const logger = makeLogger();

module.exports = { logger, makeLogger };
