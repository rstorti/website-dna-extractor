# Website DNA Extractor v1.0.0 Production Readiness Check

Date: 2026-04-25

## Verdict

No. The current ZIP is not production ready and should not be described as bullet proof.

It is still best treated as a prototype or internal demo frontend. The core backend extraction system is not included, the packaged app does not build as shipped, there are no tests or linting scripts, and several security and reliability blockers remain.

## Test Summary

| Check | Result | Notes |
|---|---:|---|
| ZIP extraction | Pass | ZIP extracted after normalising Windows path separators. |
| Backend source present | Fail | No server.js, Express routes, extractor pipeline, Puppeteer, Supabase client, image pipeline, or API route implementation included. |
| Build using packaged ZIP node_modules | Fail | `npm run build` fails with `vite: Permission denied`, then Rollup optional dependency missing. |
| Clean install then build | Pass with warnings | `npm ci --ignore-scripts` followed by `npm run build` succeeds. Bundle warning: JS chunk over 500 KB. |
| Tests | Fail | No `test` script exists. |
| Linting | Fail | No `lint` script exists. |
| Dependency audit | Fail | `npm audit` reports 4 vulnerabilities: 3 moderate, 1 high. |
| JSON files | Pass | JSON files parse correctly. |
| URL hardening | Fail | `http://0.0.0.0/` is allowed by `lib/validateUrl.js`. |
| Frontend URL validation | Fail | YouTube and bio-link validation still uses substring matching. |
| Async job model | Fail | Frontend still uses one long `/api/extract` request rather than the Dart async job pattern. |
| Polling cleanup | Fail | `/api/status` polling is cleared on catch, but not on successful extraction. |
| Secret handling | Fail | Frontend still references `VITE_ADMIN_API_KEY` and `VITE_GEMINI_API_KEY`. |
| Local history data | Fail | `.data/history.json` is included in the ZIP. |

## Release Blockers

1. Backend source is missing.
2. Packaged ZIP build is broken due included node_modules state.
3. No automated tests, linting, type checks, or CI gate.
4. Dependency audit is not clean.
5. SSRF protection is incomplete.
6. Frontend URL validation can be bypassed by hostile domains.
7. Long synchronous extraction request remains.
8. Status polling leak remains after success.
9. Frontend still references public VITE secrets.
10. Campaign HTML description is generated without escaping source text before wrapping it in HTML.
11. `.data/history.json` ships with extraction history, Supabase URLs, and debug data.
12. App is still a 2,567-line single React component, increasing maintenance and regression risk.

## Minimum Definition of Done Before Production

- Include the full backend repo or source files in the review package.
- Remove node_modules from ZIP/repo and rely on clean `npm ci` in CI.
- Add `npm test`, `npm run lint`, `npm run typecheck`, and CI enforcement.
- Replace synchronous extraction with async job creation and polling.
- Move all final Minfo campaign payload generation to the backend.
- Validate output using a canonical JSON schema before allowing export/import.
- Escape or sanitize all HTML intended for campaign rendering.
- Harden URL validation for SSRF, redirects, DNS rebinding, IPv6, decimal/octal IPs, and public host allowlists where needed.
- Remove all `VITE_*` secret usage and use backend authentication.
- Remove `.data/history.json` and any generated outputs from distributable packages.
- Add end-to-end test fixtures covering website-only, YouTube-only, bio-link-only, combined extraction, slow site, hostile URL, image extraction, and final Minfo import JSON.

## Bottom Line

The application is not production ready. It may be suitable for a controlled internal demo if run against a trusted backend and manually reviewed output. It is not safe enough yet for autonomous new-client onboarding or automatic campaign-page population.
