/**
 * Shared Gemini retry helper.
 *
 * Wraps a Gemini generateContent call with a single 12-second backoff retry
 * on HTTP 429 (quota exceeded). On free-tier API keys, sequential calls can
 * exhaust the requests-per-minute allowance, so one automatic retry is enough
 * to recover without user intervention.
 *
 * Usage:
 *   const { geminiCallWithRetry } = require('./lib/geminiRetry');
 *   const result = await geminiCallWithRetry(() => model.generateContent(prompt));
 *
 * Previously this function was copy-pasted into both ai_verifier.js and
 * gemini_prompter.js — now it lives here once.
 */
async function geminiCallWithRetry(fn) {
    try {
        return await fn();
    } catch (e) {
        const is429 = e?.message?.includes('429') || e?.status === 429;
        if (is429) {
            console.warn('⚠️  Gemini 429 quota hit — waiting 12 s then retrying once...');
            await new Promise(r => setTimeout(r, 12000));
            return await fn(); // second attempt — let it throw naturally if it fails again
        }
        throw e;
    }
}

module.exports = { geminiCallWithRetry };
